"""Rack sections — a stretch of one rack face marked for a customer.

"Bays 3-7 of aisle B belong to Zone Bowling." The 3D warehouse view paints
these onto the racking, so a section has to be one unambiguous rectangle and a
box has to belong to at most one of them.

A section is given as two corner boxes and lies on a single rack face. Odd bays
are on one side of an aisle and even bays face them, so "one face" is one aisle
and one parity. Along a face the boxes run bay 1 box 1..N, bay 3 box 1..N, and
so on: a box's place along it is (bay, box) compared as a pair. Levels are
letters counted up from the floor, shorter runs first (A..Z, then AA).
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.bin_codes import parse_box_code
from app.core.branches import BRANCHES, normalize_branch
from app.core.dependencies import require_any, require_manager
from app.database import get_db
from app.models.customer import Customer
from app.models.rack_section import RackSection
from app.models.user import User

router = APIRouter(prefix="/rack-sections", tags=["rack-sections"])

# The widest a code may run. The letter limits are what the columns hold; the
# number limits are far past any real racking and far short of what an integer
# column holds — without them a mistyped code reaches the database as an error.
MAX_AISLE_LETTERS = 10
MAX_BAY = 999
MAX_LEVEL_LETTERS = 2
MAX_BOX = 99
# The largest id an integer column holds: a bigger one cannot be a row.
MAX_SECTION_ID = 2_147_483_647


# A box as the shared parse hands it back: (aisle, bay, level, box).
Box = tuple[str, int, str, int]


class RackSectionCreate(BaseModel):
    branch: str = Field(max_length=20)
    # No NUL: the Postgres driver refuses one outright, which would be a 500.
    customer_id: str = Field(min_length=1, max_length=20, pattern=r"^[^\x00]+$")
    # Opposite corners of the section, in either order.
    from_bin: str = Field(max_length=50)
    to_bin: str = Field(max_length=50)


def _level_key(level: str) -> tuple[int, str]:
    """Levels in the order they are stacked: as text, AA would sort below B."""
    return len(level), level


def _out_of_range(aisle: str, bay: int, level: str, box: int) -> Optional[str]:
    """What about a box code is wider than a section can hold, if anything."""
    if len(aisle) > MAX_AISLE_LETTERS:
        return f"an aisle is at most {MAX_AISLE_LETTERS} letters"
    if bay > MAX_BAY:
        return f"bays stop at {MAX_BAY}"
    if len(level) > MAX_LEVEL_LETTERS:
        return f"a level is at most {MAX_LEVEL_LETTERS} letters"
    if box > MAX_BOX:
        return f"boxes stop at {MAX_BOX}"
    return None


def _corner(text: str, which: str) -> Box:
    """A corner box as (aisle, bay, level, box), or a 400 saying what is wrong."""
    typed = text.strip()
    parts = parse_box_code(typed)
    if parts is None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"The {which} corner '{typed}' is not an aisle.bay.level.box "
                "code, e.g. B.3.H.1"
            ),
        )
    problem = _out_of_range(*parts)
    if problem:
        raise HTTPException(
            status_code=400,
            detail=f"The {which} corner '{typed}' is out of range: {problem}",
        )
    return parts


def _one_face(first: str, second: str) -> tuple[Box, Box]:
    """Both corners of a section, or a 400 when they are not on one rack face."""
    a = _corner(first, "first")
    b = _corner(second, "second")
    aisle, bay_a, *_ = a
    aisle_b, bay_b, *_ = b
    if aisle != aisle_b:
        raise HTTPException(
            status_code=400,
            detail=(
                f"The corners are in different aisles ({aisle} and {aisle_b}). "
                "A section is one side of one aisle."
            ),
        )
    if bay_a % 2 != bay_b % 2:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Bays {bay_a} and {bay_b} are on opposite sides of aisle {aisle}: "
                "odd bays face even bays. A section is one side of one aisle."
            ),
        )
    return a, b


def _between(a: Box, b: Box) -> RackSection:
    """The rectangle with corners `a` and `b`, smallest first along and up."""
    (aisle, bay_a, level_a, box_a), (_, bay_b, level_b, box_b) = a, b
    (bay_from, position_from), (bay_to, position_to) = sorted(
        [(bay_a, box_a), (bay_b, box_b)]
    )
    level_from, level_to = sorted([level_a, level_b], key=_level_key)
    return RackSection(
        aisle=aisle,
        bay_from=bay_from,
        position_from=position_from,
        bay_to=bay_to,
        position_to=position_to,
        level_from=level_from,
        level_to=level_to,
    )


def _corner_codes(row: RackSection) -> tuple[str, str]:
    """The section's two corners as the labels on the boxes read."""
    return (
        f"{row.aisle}.{row.bay_from}.{row.level_from}.{row.position_from}",
        f"{row.aisle}.{row.bay_to}.{row.level_to}.{row.position_to}",
    )


def _overlap(a: RackSection, b: RackSection) -> bool:
    """Whether two sections in one branch take any of the same racking.

    They do when they are on the same face and both their runs along it and
    their runs up it meet. Either run on its own is not enough: the levels
    above a section are free, and so are the bays past its end.
    """
    if a.aisle != b.aisle or a.bay_from % 2 != b.bay_from % 2:
        return False
    along = (a.bay_from, a.position_from) <= (b.bay_to, b.position_to) and (
        b.bay_from,
        b.position_from,
    ) <= (a.bay_to, a.position_to)
    up = _level_key(a.level_from) <= _level_key(b.level_to) and _level_key(
        b.level_from
    ) <= _level_key(a.level_to)
    return along and up


def _marked_over(db: Session, section: RackSection) -> Optional[RackSection]:
    """The section already holding any of this racking, if there is one."""
    marked = (
        db.query(RackSection)
        .filter(
            RackSection.branch == section.branch,
            RackSection.aisle == section.aisle,
        )
        .order_by(RackSection.id)
        .all()
    )
    return next((other for other in marked if _overlap(section, other)), None)


def _taken(other: RackSection) -> HTTPException:
    """The refusal for racking that is already in a section, naming whose."""
    other_from, other_to = _corner_codes(other)
    return HTTPException(
        status_code=409,
        detail=f"Overlaps {other.customer.name}'s section {other_from} - {other_to}",
    )


def _serialize(row: RackSection) -> dict:
    from_code, to_code = _corner_codes(row)
    return {
        "id": row.id,
        "branch": row.branch,
        "customer_id": row.customer_id,
        "customer_name": row.customer.name,
        "aisle": row.aisle,
        "bay_from": row.bay_from,
        "position_from": row.position_from,
        "bay_to": row.bay_to,
        "position_to": row.position_to,
        "level_from": row.level_from,
        "level_to": row.level_to,
        "from_bin": from_code,
        "to_bin": to_code,
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("")
def list_rack_sections(
    branch: str = Query("HQ", max_length=20),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Every section marked in a branch, in the order you would walk past them."""
    branch = normalize_branch(branch)
    if branch not in BRANCHES:
        raise HTTPException(status_code=400, detail=f"Unknown branch: {branch}")
    rows = (
        db.query(RackSection)
        .options(joinedload(RackSection.customer))
        .filter(RackSection.branch == branch)
        .all()
    )
    ordered = sorted(
        rows,
        key=lambda row: (
            row.aisle,
            row.bay_from,
            row.position_from,
            _level_key(row.level_from),
            row.id,
        ),
    )
    return {"branch": branch, "sections": [_serialize(row) for row in ordered]}


@router.post("", status_code=201)
def create_rack_section(
    body: RackSectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Mark the racking between two corner boxes for a customer.

    The corners may be given in either order and need not be the near-bottom
    and far-top ones; what is stored is always smallest first, along the face
    and up it, so every section reads the same way round.

    Racking already in a section is refused, whoever that section belongs to —
    including the same customer, where a second section over the first would
    leave two rows to remove before the boxes were free.
    """
    branch = normalize_branch(body.branch)
    if branch not in BRANCHES:
        raise HTTPException(status_code=400, detail=f"Unknown branch: {branch}")
    corners = _one_face(body.from_bin, body.to_bin)
    customer = db.query(Customer).filter(Customer.id == body.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    row = _between(*corners)
    row.branch = branch
    row.customer_id = customer.id
    row.created_by = current_user.username
    other = _marked_over(db, row)
    if other:
        raise _taken(other)
    # A SAVEPOINT, so a refusal by the database undoes this row and nothing
    # else in the session.
    try:
        with db.begin_nested():
            db.add(row)
            db.flush()
    except IntegrityError:
        # Someone stored a section starting at this box between the check
        # above and now. Say whose, as the check would have.
        other = _marked_over(db, row)
        if other:
            raise _taken(other)
        # Not a section in the way, then: the customer was deleted in that
        # same moment, and the database refused the row for want of one.
        if not db.query(Customer).filter(Customer.id == row.customer_id).first():
            raise HTTPException(status_code=404, detail="Customer not found")
        raise HTTPException(
            status_code=409, detail="Those boxes were marked a moment ago"
        )
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.delete("/{section_id}")
def delete_rack_section(
    section_id: int = Path(ge=1, le=MAX_SECTION_ID),
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    row = db.query(RackSection).filter(RackSection.id == section_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Section not found")
    db.delete(row)
    db.commit()
    return {"ok": True}

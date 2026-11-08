"""The production board: who has which work, by lane, and handing it on.

docs/superpowers/specs/2026-11-07-production-board.md. The logic is in
`app/core/production_board.py`; a hand-off records the lane and an optional
person and writes the printed trail. It never changes a job's status, stock or
money (owner decision 2026-11-07).
"""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, joinedload

from app.core import production_board as board
from app.core.dependencies import require_any
from app.database import get_db
from app.models.job import Job, JobItem
from app.models.logo import Logo
from app.models.supplier import Supplier
from app.models.user import User
from app.routers.jobs import _system_comment

router = APIRouter(prefix="/production-board", tags=["jobs"])

# The names a person typed before, offered again on the hand-off sheet.
_HOLDERS_OFFERED = 50


class BoardLane(BaseModel):
    key: str
    label: str


class BoardLine(BaseModel):
    item_id: int
    line: int
    stock_code: Optional[str] = None
    description: Optional[str] = None
    sizes: Optional[str] = None
    qty: int
    decoration: List[str]
    holder: Optional[str] = None
    since: Optional[datetime] = None


class BoardCard(BaseModel):
    job_id: str
    lane: str
    customer_name: Optional[str] = None
    cust_ref: Optional[str] = None
    due: Optional[str] = None
    priority: Optional[str] = None
    order_category: Optional[str] = None
    status: str
    holder: Optional[str] = None
    since: Optional[datetime] = None
    lines: List[BoardLine]


class Board(BaseModel):
    lanes: List[BoardLane]
    cards: List[BoardCard]
    holders: List[str]


class HandOff(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: str = Field(min_length=1, max_length=20)
    # The lane the card was in when it was picked up, so a card already moved
    # on another tablet is not moved twice.
    from_lane: str = Field(min_length=1, max_length=40)
    to_lane: str = Field(min_length=1, max_length=40)
    holder: Optional[str] = Field(None, max_length=50)


class HandedOff(BaseModel):
    job_id: str
    lane: str
    holder: Optional[str] = None
    item_ids: List[int]
    comment: str


def _supplier_names(db: Session, ids: set[str]) -> dict[str, str]:
    if not ids:
        return {}
    rows = db.query(Supplier.id, Supplier.name).filter(Supplier.id.in_(ids)).all()
    return {sid: name for sid, name in rows}


def _logos_for(db: Session, jobs: list[Job]) -> dict[int, Logo]:
    used = {i.logo_id for job in jobs for i in job.items if i.logo_id is not None}
    if not used:
        return {}
    return {logo.id: logo for logo in db.query(Logo).filter(Logo.id.in_(used))}


def _known_decorators(db: Session) -> set[str]:
    """Every supplier named as the decorator of a logo in use."""
    rows = (
        db.query(Logo.supplier_id)
        .filter(
            Logo.made_by == "subcontract",
            Logo.supplier_id.isnot(None),
            Logo.is_active.is_(True),
        )
        .distinct()
        .all()
    )
    return {sid for (sid,) in rows}


@router.get("", response_model=Board)
def get_board(db: Session = Depends(get_db), _: User = Depends(require_any)):
    """Work in hand by lane: a card per job per lane. No money."""
    jobs = (
        db.query(Job)
        .options(joinedload(Job.items))
        .filter(Job.status.in_(list(board.IN_WORK)))
        .order_by(Job.id)
        .all()
    )
    cards = board.cards(jobs, _logos_for(db, jobs))
    decorators = _known_decorators(db) | {
        sid for card in cards if (sid := board.supplier_of(card["lane"]))
    }
    names = _supplier_names(db, decorators)
    holders = [
        name
        for (name,) in db.query(JobItem.station_holder)
        .filter(JobItem.station_holder.isnot(None))
        .distinct()
        .order_by(JobItem.station_holder)
        .limit(_HOLDERS_OFFERED)
    ]
    return {"lanes": board.lanes(decorators, names), "cards": cards, "holders": holders}


def _lane_name(db: Session, lane: str) -> str:
    """The lane's name, or 422 for a lane that is not one.

    A decorator lane is a supplier's. One whose supplier has since been removed
    is still a lane while it holds work, so that work can change hands there.
    """
    if lane in board.FIXED_LANES:
        return board.FIXED_LANES[lane]
    supplier_id = board.supplier_of(lane)
    name = _supplier_names(db, {supplier_id}).get(supplier_id) if supplier_id else None
    known = supplier_id and (
        supplier_id in _supplier_names(db, {supplier_id}) or _holds_work(db, lane)
    )
    if known:
        name = name or supplier_id  # a blank name still names its lane
    if not name:
        raise HTTPException(
            status_code=422,
            detail=(
                f"'{lane}' is not a lane: use picking, embroidery, print, packing "
                "or decorator:<supplier id>."
            ),
        )
    return name


def _holds_work(db: Session, lane: str) -> bool:
    return (
        db.query(JobItem.id)
        .join(Job, Job.id == JobItem.job_id)
        .filter(JobItem.station == lane, Job.status.in_(list(board.IN_WORK)))
        .first()
        is not None
    )


def locked_job(db: Session, job_id: str):
    """The job, its row locked for the hand-off.

    The row alone: PostgreSQL refuses FOR UPDATE over the outer join an eager
    load of the lines makes ("cannot be applied to the nullable side of an
    outer join"), and SQLite, which the tests run on, ignores FOR UPDATE — so
    only the compiled SQL can show it (test_production_board). Its lines load
    after, inside the same transaction.
    """
    return (
        db.query(Job)
        .filter(Job.id == job_id)
        .with_for_update()
        .populate_existing()  # what the lock holds, not a copy read before it
    )


@router.post("/hand-off", response_model=HandedOff)
def hand_off(
    body: HandOff,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """Hand a job's work at one lane to another lane, and optionally a person.

    Records where each garment is and writes it on the job's trail (Jim2's
    "Line 1 given to Lina for EMB"). Never the status, stock or money. A locked job's
    work still changes hands: the lock is on what was sold, not on the floor.
    """
    to_name = _lane_name(db, body.to_lane)
    job = locked_job(db, body.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in board.IN_WORK:
        raise HTTPException(
            status_code=409,
            detail=f"Job {job.id} is {job.status} — it is not in work on the floor.",
        )
    logos = _logos_for(db, [job])
    work = board.units(job)
    if not work:
        raise HTTPException(
            status_code=409,
            detail=f"Job {job.id} has no garments or decoration to hand on.",
        )
    moving = [
        g
        for g in work
        if board.lane_of(g, board.decorations(job, g, logos)) == body.from_lane
    ]
    if not moving:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Job {job.id} has no work at {body.from_lane} now — it has been "
                "handed on. Refresh the board."
            ),
        )
    holder = (body.holder or "").strip() or None
    now = datetime.now(timezone.utc)
    for garment in moving:
        garment.station = body.to_lane
        garment.station_holder = holder
        garment.station_at = now
    # Lines changed off the job form: the job row is written and its version
    # moves, so a form opened before the hand-off cannot save over it.
    job.updated_at = now
    numbers = board.line_numbers(job)
    text = board.hand_off_text(
        [numbers[g.id] for g in moving],
        to_name,
        holder,
        decorator=board.supplier_of(body.to_lane) is not None,
    )
    # An internal note on the trail. Not `inc`: that puts a comment on the
    # customer's documents, and this one names the floor's people.
    db.add(_system_comment(job, text, by=current_user))
    db.commit()
    return {
        "job_id": job.id,
        "lane": body.to_lane,
        "holder": holder,
        "item_ids": [g.id for g in moving],
        "comment": text,
    }

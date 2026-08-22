"""The one way stock changes.

Stock is recorded in three places that have to agree: the item total
(``InventoryItem.stock`` / ``.committed_qty``), the per-branch position
(``stock_locations``), and the movement ledger (``stock_movements``). Every
stock bug this codebase has had was a path that updated some of those and not
the others — a transfer that decremented the total and never added it back, a
receipt that moved the total without touching a branch, a status change that
moved neither.

None of those paths were wrong about what they were trying to do. They were
incomplete, and incompleteness is invisible at the call site: writing
``inv.stock += qty`` looks finished. So the three updates are no longer
something a caller performs and can half-perform — they happen here, together,
or not at all.

Two shapes cover every movement in the system:

``post_movement``   stock arrives at or leaves a branch, or is reserved there.
                    The item total, that branch's position and the ledger all
                    move together.
``post_relocation`` stock moves between branches. The item total does not
                    change — it is the same stock in a different place — so
                    only the two positions move, against one ledger row.

Callers still decide *what* happened and *where*. This decides what recording it
entails.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.core.stock_location import DEFAULT_BRANCH, adjust_location
from app.models.inventory import InventoryItem, StockMovement

# Movement types that move physical stock, as opposed to reserving it or
# relocating it. Kept here because the invariant "on-hand changed by exactly the
# movements posted for it" is only meaningful over this set.
ON_HAND_TYPES = frozenset(
    {
        "GR",
        "Purchase Receipt",
        "Sale",
        "Adjustment",
        "Stocktake",
        "Transfer In",
        "Transfer Out",
    }
)


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def post_movement(
    db: Session,
    *,
    sku: str,
    movement_type: str,
    branch: Optional[str] = None,
    quantity: int = 0,
    committed: int = 0,
    reference: Optional[str] = None,
    notes: Optional[str] = None,
    job_id: Optional[str] = None,
    po_id: Optional[str] = None,
    date: Optional[str] = None,
) -> Optional[StockMovement]:
    """Record a stock movement and apply it everywhere it has to land.

    ``quantity`` is the signed change to on-hand; ``committed`` the signed change
    to the reservation. A movement affects one or the other, never both — goods
    arriving are not also reserved, and reserving does not move anything.

    Returns the movement row, or None when the SKU is unknown. An unknown SKU is
    not an error here: several callers iterate over job or receipt lines that may
    reference a product that has since been deleted, and skipping is what they
    all already did individually.
    """
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if item is None:
        return None

    branch = branch or DEFAULT_BRANCH

    if quantity:
        item.stock = (item.stock or 0) + quantity
    if committed:
        item.committed_qty = max(0, (item.committed_qty or 0) + committed)

    adjust_location(db, sku, branch, on_hand=quantity, committed=committed)

    movement = StockMovement(
        sku=sku,
        date=date or _today(),
        type=movement_type,
        quantity=quantity or committed,
        reference=reference,
        notes=notes,
        job_id=job_id,
        po_id=po_id,
        location_branch=branch,
    )
    db.add(movement)
    return movement


def post_relocation(
    db: Session,
    *,
    sku: str,
    quantity: int,
    from_branch: str,
    to_branch: str,
    movement_type: str = "Location Change",
    reference: Optional[str] = None,
    notes: Optional[str] = None,
    date: Optional[str] = None,
) -> Optional[StockMovement]:
    """Move stock between branches without changing how much of it there is.

    The item total deliberately does not move. A relocation that decremented it
    and relied on something else to add it back is how same-branch moves used to
    destroy stock outright.
    """
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if item is None:
        return None

    adjust_location(db, sku, from_branch, on_hand=-quantity)
    adjust_location(db, sku, to_branch, on_hand=quantity)

    movement = StockMovement(
        sku=sku,
        date=date or _today(),
        type=movement_type,
        quantity=quantity,
        reference=reference,
        notes=notes,
        location_branch=to_branch,
    )
    db.add(movement)
    return movement


def reverse_job_movements(
    db: Session,
    *,
    job_id: str,
    movement_type: str,
    branch: Optional[str] = None,
) -> int:
    """Undo a job's movements of one type, removing them from the ledger.

    Used when an invoice is recalled: the goods never left, so the entry is
    withdrawn rather than answered with an opposing one. That matters because
    the depletion path treats the presence of a movement as "already done" — an
    offsetting row would leave that guard tripped and the job could never be
    invoiced again.

    Returns how many were reversed.
    """
    movements = (
        db.query(StockMovement)
        .filter(StockMovement.job_id == job_id, StockMovement.type == movement_type)
        .all()
    )
    for movement in movements:
        item = db.query(InventoryItem).filter(InventoryItem.sku == movement.sku).first()
        if item is not None:
            quantity = -(movement.quantity or 0)
            item.stock = (item.stock or 0) + quantity
            adjust_location(
                db,
                movement.sku,
                movement.location_branch or branch,
                on_hand=quantity,
            )
        db.delete(movement)
    return len(movements)

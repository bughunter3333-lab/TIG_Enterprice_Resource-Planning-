"""Per-location stock positions — Jim2's "Qty by Locations", ERPNext's Bin.

A StockLocation row is the position of one SKU at one branch: what is on hand
there, what is committed out of it, what is on order into it. The table existed
but only its own CRUD endpoints ever wrote it, so the Locations tab showed
numbers a human typed once and reality moved on without them.

Every stock movement should come through `adjust_location` so the positions
stay true. `location_summary` exposes the drift honestly rather than pretending
legacy stock already has a home.
"""

from sqlalchemy import case, func, insert, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.inventory import InventoryItem
from app.models.stock_location import StockLocation

DEFAULT_BRANCH = "HQ"

QUANTITIES = ("qty_on_hand", "committed_qty", "on_po_qty", "backorder_qty")


def floored(column, delta: int):
    """`column + delta` in SQL, never below zero."""
    value = func.coalesce(column, 0) + delta
    return case((value < 0, 0), else_=value)


def adjust_location(
    db: Session,
    sku: str,
    branch: str,
    *,
    on_hand: int = 0,
    committed: int = 0,
    on_po: int = 0,
    backorder: int = 0,
) -> StockLocation:
    """Apply signed deltas to a (sku, branch) position, creating it if needed.

    Quantities are floored at zero: a mis-sequenced movement should leave a
    position at nothing rather than going negative, which would then poison
    every downstream available/projected figure.

    Applied in SQL — `qty = qty + delta` — never read, added to and written
    back: two requests moving one position at once each wrote the figure it
    had read, and one of the two movements was lost.
    """
    branch = branch or DEFAULT_BRANCH
    # The item first, then its position — the order every request takes stock
    # in (app/core/row_locks.py), whoever calls: a position written before its
    # item crossed a movement that writes the item first.
    db.query(InventoryItem.sku).filter(InventoryItem.sku == sku).with_for_update(
        key_share=True
    ).first()
    deltas = dict(zip(QUANTITIES, (on_hand, committed, on_po, backorder), strict=True))
    where = (StockLocation.sku == sku, StockLocation.branch == branch)
    row = db.query(StockLocation).filter(*where).first()
    if row is None and _new_position(db, sku, branch, deltas):
        return db.query(StockLocation).filter(*where).one()
    if row is None:  # another request made it first
        row = db.query(StockLocation).filter(*where).one()
    changed = {
        name: floored(getattr(StockLocation, name), d)
        for name, d in deltas.items()
        if d
    }
    if not changed:
        return row
    if not _update(db, where, changed):
        # Deleted by another request since it was read: made again with this
        # movement in it, so the units still land at their branch rather than
        # reading unlocated — or, made again meanwhile by yet another, updated.
        db.expunge(row)
        if not _new_position(db, sku, branch, deltas):
            _update(db, where, changed)
        return db.query(StockLocation).filter(*where).one()
    db.expire(row, list(changed))
    return row


def _update(db: Session, where: tuple, changed: dict) -> int:
    """Apply the deltas in SQL; how many positions it changed (0 or 1)."""
    return db.execute(
        update(StockLocation)
        .where(*where)
        .values(**changed)
        .execution_options(synchronize_session=False)
    ).rowcount


def _new_position(db: Session, sku: str, branch: str, deltas: dict) -> bool:
    """Insert the position with these deltas as its figures; False if another
    request inserted it first (it is then there to be updated)."""
    try:
        with db.begin_nested():
            db.execute(
                insert(StockLocation).values(
                    sku=sku, branch=branch, **{n: max(0, d) for n, d in deltas.items()}
                )
            )
    except IntegrityError:
        return False
    return True


def position_qty(db: Session, sku: str, branch: str) -> int:
    """What is on hand for this SKU at this branch, zero if it has no position.

    A count is always a count of one shelf. Anything that measures a physical
    count has to difference it against this, never against the item total —
    the two are only the same while a SKU lives at a single branch.
    """
    row = (
        db.query(StockLocation)
        .filter(
            StockLocation.sku == sku, StockLocation.branch == (branch or DEFAULT_BRANCH)
        )
        .first()
    )
    return (row.qty_on_hand or 0) if row else 0


def unlocated_qty(db: Session, sku: str) -> int:
    """On-hand that has no branch yet — the item total less every position."""
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    total = (item.stock or 0) if item else 0
    located = sum(
        r.qty_on_hand or 0
        for r in db.query(StockLocation).filter(StockLocation.sku == sku).all()
    )
    return total - located


def location_summary(db: Session, sku: str) -> dict:
    """Reconcile the per-location positions against the item's total on hand.

    Legacy stock predates location tracking, so `unlocated` is expected to be
    non-zero until it is put away. Surfacing it beats silently showing a
    Locations tab that does not add up to the item.

    Committed, back-ordered and on-order are derived from the open jobs and
    purchase orders, as the Locations tab and the stock list derive them. This
    read the counters stored on the position instead, and they disagreed: the
    stock list said 2 committed, this said 3 (F14).
    """
    from app.core.reservations import (
        backordered_by_branch,
        committed_by_branch,
        on_order_total,
    )

    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    total = (item.stock or 0) if item else 0
    rows = db.query(StockLocation).filter(StockLocation.sku == sku).all()
    located = sum(r.qty_on_hand or 0 for r in rows)
    committed = committed_by_branch(db, sku)
    backordered = backordered_by_branch(db, sku)
    on_po = on_order_total(db, sku)
    return {
        "sku": sku,
        "total_on_hand": total,
        "located": located,
        "unlocated": total - located,
        "in_sync": total == located,
        "branches": [
            {
                "branch": r.branch,
                "qty_on_hand": r.qty_on_hand or 0,
                "committed_qty": committed.get(r.branch, 0),
                "available_qty": max(
                    0, (r.qty_on_hand or 0) - committed.get(r.branch, 0)
                ),
                "on_po_qty": on_po if r.branch == DEFAULT_BRANCH else 0,
                "backorder_qty": backordered.get(r.branch, 0),
            }
            for r in rows
        ],
    }

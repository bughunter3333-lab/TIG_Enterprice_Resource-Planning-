"""Per-location stock positions — Jim2's "Qty by Locations", ERPNext's Bin.

A StockLocation row is the position of one SKU at one branch: what is on hand
there, what is committed out of it, what is on order into it. The table existed
but only its own CRUD endpoints ever wrote it, so the Locations tab showed
numbers a human typed once and reality moved on without them.

Every stock movement should come through `adjust_location` so the positions
stay true. `location_summary` exposes the drift honestly rather than pretending
legacy stock already has a home.
"""

from sqlalchemy.orm import Session

from app.models.inventory import InventoryItem
from app.models.stock_location import StockLocation

DEFAULT_BRANCH = "HQ"


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
    """
    branch = branch or DEFAULT_BRANCH
    row = db.query(StockLocation).filter_by(sku=sku, branch=branch).first()
    if row is None:
        row = StockLocation(
            sku=sku,
            branch=branch,
            qty_on_hand=0,
            committed_qty=0,
            backorder_qty=0,
            on_po_qty=0,
        )
        db.add(row)
        db.flush()  # so repeated adjustments in one request hit the same row

    row.qty_on_hand = max(0, (row.qty_on_hand or 0) + on_hand)
    row.committed_qty = max(0, (row.committed_qty or 0) + committed)
    row.on_po_qty = max(0, (row.on_po_qty or 0) + on_po)
    row.backorder_qty = max(0, (row.backorder_qty or 0) + backorder)
    return row


def location_summary(db: Session, sku: str) -> dict:
    """Reconcile the per-location positions against the item's total on hand.

    Legacy stock predates location tracking, so `unlocated` is expected to be
    non-zero until it is put away. Surfacing it beats silently showing a
    Locations tab that does not add up to the item.
    """
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    total = (item.stock or 0) if item else 0
    rows = db.query(StockLocation).filter(StockLocation.sku == sku).all()
    located = sum(r.qty_on_hand or 0 for r in rows)
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
                "committed_qty": r.committed_qty or 0,
                "available_qty": r.available_qty,
                "on_po_qty": r.on_po_qty or 0,
                "backorder_qty": r.backorder_qty or 0,
            }
            for r in rows
        ],
    }

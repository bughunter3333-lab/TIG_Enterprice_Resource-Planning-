"""What needs buying, decided once.

The rule was written out seven times and gave two different answers. Five
backend sites compared on-hand against the minimum, but the stock list omitted
the `min_stock > 0` guard the other four carried, so every zero-stock item with
no threshold read as low there and nowhere else. On the frontend two screens used
`<` and two used `<=`. The same SKU could be flagged on one screen and fine on
the next.

All seven also asked the wrong question. Whether to buy is not "is the shelf
below the minimum" but "will it be, once what is already coming has arrived and
what is already promised has left". Blanks bought in cartons on four to six week
lead times spend ordinary weeks under the minimum while fully covered by an
order placed a fortnight ago, and every one of those screamed.

  projected = on hand + on order − committed

A draft purchase order is deliberately not counted as on order. It has not been
sent, so nothing is coming, and treating it as incoming would let a forgotten
draft suppress the alert forever — a quieter failure than the noise it fixes.
"""

from typing import Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from app.core.reservations import (
    ORDERED_PO_STATUSES,
    committed_by_sku,
    on_order_by_sku,
)
from app.models.inventory import InventoryItem


def _suggested(shortfall: int, reorder_qty: Optional[int]) -> int:
    """Round the shortfall up to a whole buying multiple.

    `reorder_qty` is how much we buy in — a carton, a box of twelve. Ordering
    the bare shortfall would mean ordering three of something that only ships in
    tens.
    """
    if shortfall <= 0:
        return 0
    lot = reorder_qty or 0
    if lot <= 0:
        return shortfall
    lots = -(-shortfall // lot)  # ceiling division
    return lots * lot


def replenishment_rows(
    db: Session, skus: Optional[Iterable[str]] = None, *, only_needed: bool = True
) -> List[Dict]:
    """The reorder picture for a set of SKUs, or for every active item.

    Returns on-hand, on-order and committed alongside the projected position, so
    a screen can show the working rather than only the verdict — a quieter list
    is only trustworthy if you can see why something is missing from it.
    """
    query = db.query(InventoryItem).filter(InventoryItem.status == "Active")
    if skus is not None:
        skus = list(skus)
        if not skus:
            return []
        query = query.filter(InventoryItem.sku.in_(skus))
    items = query.order_by(InventoryItem.stock).all()
    if not items:
        return []

    codes = [item.sku for item in items]
    committed = committed_by_sku(db, codes)
    on_order = on_order_by_sku(db, codes, ORDERED_PO_STATUSES)

    rows = []
    for item in items:
        minimum = item.min_stock or 0
        on_hand = item.stock or 0
        incoming = on_order.get(item.sku, 0)
        reserved = committed.get(item.sku, 0)
        projected = on_hand + incoming - reserved
        # A minimum of zero means nobody has set one, not that any stock at all
        # is enough — those items are not managed by this rule.
        needed = minimum > 0 and projected <= minimum
        shortfall = max(0, minimum - projected) if needed else 0

        if only_needed and not needed:
            continue
        rows.append(
            {
                "sku": item.sku,
                "name": item.name,
                "category": item.category or "",
                "supplier": item.supplier or "",
                "stock": on_hand,
                "on_order": incoming,
                "committed": reserved,
                "projected": projected,
                "min_stock": minimum,
                "reorder_qty": item.reorder_qty or 0,
                "shortfall": shortfall,
                "suggested_qty": _suggested(shortfall, item.reorder_qty),
                "unit_cost": float(item.unit_cost or 0),
            }
        )
    return rows


def needs_replenishment(db: Session, skus: Iterable[str]) -> set:
    """Just the SKUs that need attention — for filtering a list."""
    return {row["sku"] for row in replenishment_rows(db, skus)}

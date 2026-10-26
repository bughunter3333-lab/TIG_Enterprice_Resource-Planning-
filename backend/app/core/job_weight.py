"""What a job weighs, and which of its garments the scale knows nothing about.

Freight is charged on the order weight, so the picking slip says it and names
the garments that have none — copied from Jim2's footer, "Order Weight: 15kg
(2 items has 0 weight)". It came out 0 kg for every order (finding F08): the
stock weight could not be written, and a line's own weight was overridden by
its SKU's even when the SKU's was 0. The warning then counted the embroidery
and alteration lines, which weigh nothing by nature, and missed the garments.

A line weighs its stock item's weight per unit when that is known, else its
own; only stocked garment lines are weighed, and only they can be missing one.
"""

from sqlalchemy.orm import Session

from app.models.inventory import InventoryItem


def _stock_weights(db: Session, job) -> dict[str, float]:
    skus = {i.stock_code for i in job.items if i.stock_code}
    if not skus:
        return {}
    return {
        sku: float(weight or 0)
        for sku, weight in db.query(InventoryItem.sku, InventoryItem.weight_kg).filter(
            InventoryItem.sku.in_(skus)
        )
    }


def _garment_lines(job, stocked: dict):
    for item in job.items:
        if item.display_type not in (None, "product"):
            continue
        # Goods only: a logo is a stock item in Jim2 too, so a decoration
        # line's code can be stocked without the line being anything to weigh.
        if item.is_service:
            continue
        if item.stock_code in stocked:
            yield item


def _unit_weight(item, stocked: dict) -> float:
    return stocked.get(item.stock_code) or float(item.weight_kg or 0)


def order_weight(job, db: Session) -> float:
    stocked = _stock_weights(db, job)
    total = sum(
        _unit_weight(item, stocked) * (item.qty or item.order_qty or 0)
        for item in _garment_lines(job, stocked)
    )
    return round(total, 3)


def unweighed_lines(job, db: Session) -> list[str]:
    """The SKUs of the job's garment lines that weigh nothing, in line order."""
    stocked = _stock_weights(db, job)
    return [
        item.stock_code
        for item in sorted(_garment_lines(job, stocked), key=lambda i: i.sort or 0)
        if not _unit_weight(item, stocked)
    ]

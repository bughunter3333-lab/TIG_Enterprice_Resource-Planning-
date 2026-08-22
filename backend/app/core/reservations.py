"""What counts as reserved or expected stock, defined once.

The rule was written out three times and one copy disagreed. ``jobs.py`` treated
INVOICE as a status that reserves stock, while both read paths excluded it —
so between invoicing and payment the goods were counted twice: gone from the
shelf because they had shipped, and still reserved because the transition never
released them. On a 40-unit item with a 10-unit job that reads as 20 available
when 30 genuinely are, and the goods-receipt allocator uses exactly that figure
to decide what it can hand to a backorder.

Reserving is a property of the job's status, so it is derived from open job
lines rather than accumulated into a counter. A derived figure cannot drift from
the jobs it describes; an accumulated one only stays right while every path that
moves a job remembers to move the counter with it.
"""

from typing import Dict, Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.stock_location import DEFAULT_BRANCH
from app.models.job import Job, JobItem
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem

# A job reserves stock once it is a real order and until the goods leave.
# QUOTE has not been won yet; INVOICE and PAID have shipped, so the stock is no
# longer reserved — it is gone, and depletion has already taken it off hand.
# CANCEL never ships.
COMMITTED_STATUSES = frozenset(
    {
        "ORDER",
        "In Progress",
        "PROOF",
        "PRINT",
        "Pick/Pack",
        "FINISH",
    }
)

# Expressed as an exclusion for queries, which is how the read paths were
# already written and reads better against a status column.
UNCOMMITTED_STATUSES = ("QUOTE", "INVOICE", "PAID", "CANCEL")


def _base_query(db: Session):
    return (
        db.query(JobItem, Job)
        .join(Job, JobItem.job_id == Job.id)
        .filter(Job.status.notin_(UNCOMMITTED_STATUSES))
    )


def committed_by_sku(db: Session, skus: Iterable[str]) -> Dict[str, int]:
    """Reserved quantity per SKU across every open job."""
    skus = list(skus)
    if not skus:
        return {}
    rows = (
        db.query(JobItem.stock_code, func.coalesce(func.sum(JobItem.supply_qty), 0))
        .join(Job, JobItem.job_id == Job.id)
        .filter(
            JobItem.stock_code.in_(skus),
            Job.status.notin_(UNCOMMITTED_STATUSES),
        )
        .group_by(JobItem.stock_code)
        .all()
    )
    return {sku: int(qty or 0) for sku, qty in rows}


def committed_by_branch(db: Session, sku: str) -> Dict[str, int]:
    """Reserved quantity for one SKU, split by the branch that will ship it."""
    rows = (
        db.query(
            func.coalesce(Job.branch, DEFAULT_BRANCH),
            func.coalesce(func.sum(JobItem.supply_qty), 0),
        )
        .join(JobItem, JobItem.job_id == Job.id)
        .filter(
            JobItem.stock_code == sku,
            Job.status.notin_(UNCOMMITTED_STATUSES),
        )
        .group_by(func.coalesce(Job.branch, DEFAULT_BRANCH))
        .all()
    )
    return {branch: int(qty or 0) for branch, qty in rows}


def committed_total(db: Session, sku: str) -> int:
    """Reserved quantity for one SKU across all branches."""
    return committed_by_sku(db, [sku]).get(sku, 0)


# A purchase order is expected stock from the moment it is raised until it is
# fully received. Received and Cancelled orders are neither outstanding nor
# expected.
OPEN_PO_STATUSES = ("Draft", "Sent", "Partial")


def on_order_by_sku(db: Session, skus: Iterable[str]) -> Dict[str, int]:
    """Outstanding quantity per SKU across every open purchase order."""
    skus = list(skus)
    if not skus:
        return {}
    rows = (
        db.query(
            PurchaseOrderItem.sku,
            func.coalesce(
                func.sum(
                    PurchaseOrderItem.qty_ordered - PurchaseOrderItem.qty_received
                ),
                0,
            ),
        )
        .join(PurchaseOrder, PurchaseOrderItem.order_id == PurchaseOrder.id)
        .filter(
            PurchaseOrderItem.sku.in_(skus),
            PurchaseOrder.status.in_(OPEN_PO_STATUSES),
            PurchaseOrderItem.qty_ordered > PurchaseOrderItem.qty_received,
        )
        .group_by(PurchaseOrderItem.sku)
        .all()
    )
    return {sku: int(qty or 0) for sku, qty in rows}


def on_order_total(db: Session, sku: str) -> int:
    """Outstanding quantity for one SKU across all open purchase orders."""
    return on_order_by_sku(db, [sku]).get(sku, 0)


def backordered_by_branch(db: Session, sku: str) -> Dict[str, int]:
    """Outstanding back-order quantity for one SKU, split by branch.

    `JobItem.b_ord` is what a job still needs and could not be supplied from
    stock; accepting a goods receipt draws it down as the shortfall is filled.
    Deriving it keeps the Locations tab's back-order figure tied to the jobs
    waiting on stock, rather than to a column only the manual location editor
    ever set.
    """
    rows = (
        db.query(
            func.coalesce(Job.branch, DEFAULT_BRANCH),
            func.coalesce(func.sum(JobItem.b_ord), 0),
        )
        .join(JobItem, JobItem.job_id == Job.id)
        .filter(
            JobItem.stock_code == sku,
            JobItem.b_ord > 0,
            Job.status.notin_(UNCOMMITTED_STATUSES),
        )
        .group_by(func.coalesce(Job.branch, DEFAULT_BRANCH))
        .all()
    )
    return {branch: int(qty or 0) for branch, qty in rows}

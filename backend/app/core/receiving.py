"""Goods arriving against a purchase order — one way, from either screen.

Stock can be received two ways: a goods receipt (inspected, then accepted), or
the quick receive on the purchase order itself. They had drifted apart. The
goods receipt credited only the first PO line carrying its SKU, so a PO
consolidated across jobs never closed (finding F03); neither said 'Partial'
when part had come (F29); the movement named no PO line or job, filled job
lines never read 'Received', and back-orders went oldest-due-first whichever
job the PO line had been raised for (F18); and the quick receive filled no
back-orders at all. Both now come through here.
"""

from datetime import date, datetime, timezone
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.core.reservations import COMMITTED_STATUSES, committed_total
from app.core.stock_ledger import post_movement
from app.models.inventory import InventoryItem
from app.models.job import Job, JobItem
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem

# The movement types that are goods arriving from a supplier: a goods receipt,
# and the quick receive on a purchase order.
RECEIPT_TYPES = ("GR", "Purchase Receipt")


def credit_po_lines(
    po: PurchaseOrder,
    sku: str,
    qty: int,
    po_item: Optional[PurchaseOrderItem] = None,
) -> list[tuple[PurchaseOrderItem, int]]:
    """Credit `qty` of `sku` to the PO, and say which lines took how much.

    Named line, or else every line of the SKU in turn, each up to what it still
    needs. A supplier who sends more than was ordered has still sent it: the
    over-delivery is recorded on the last line, so the shelf and the order
    agree and the extra is visible.
    """
    lines = (
        [po_item]
        if po_item is not None
        else sorted((i for i in po.items if i.sku == sku), key=lambda i: i.id)
    )
    if not lines or qty <= 0:
        return []
    credits: dict[int, int] = {}
    remaining = qty
    for line in lines:
        outstanding = max(0, (line.qty_ordered or 0) - (line.qty_received or 0))
        take = min(outstanding, remaining)
        if take:
            credits[line.id] = take
            remaining -= take
    if remaining:
        credits[lines[-1].id] = credits.get(lines[-1].id, 0) + remaining
    by_id = {line.id: line for line in lines}
    for line_id, taken in credits.items():
        by_id[line_id].qty_received = (by_id[line_id].qty_received or 0) + taken
    return [(by_id[line_id], taken) for line_id, taken in credits.items()]


def settle_po_status(po: PurchaseOrder, today: str) -> None:
    """Received when every line has all it ordered; Partial once anything has come."""
    if po.status == "Cancelled" or not po.items:
        return
    if all((i.qty_received or 0) >= (i.qty_ordered or 0) for i in po.items):
        if po.status != "Received":
            po.status = "Received"
            po.received_date = today
    elif any((i.qty_received or 0) > 0 for i in po.items):
        po.status = "Partial"


def touch_job(job: Job) -> None:
    """Move the job's version (`Job.version`), because its lines changed here.

    Only an UPDATE of the job row moves it, and changing a line is not one. A
    job form opened before a back-order was filled then saved its older lines
    over the fill: the reservation was released and the units bought again.
    """
    job.updated_at = datetime.now(timezone.utc)


def service_lines(db: Session, line: PurchaseOrderItem, sku: str) -> list[JobItem]:
    """The job's decoration or alteration lines a PO line bought, if it bought work.

    Subcontracted decoration is bought from order requirements against the
    job's logo line, and Jim2 holds a logo as a stock item too, so its code can
    be a SKU. Receiving it put it on that stock item's shelf, where nothing
    ever took it off: work done to the job's garments is not goods.
    """
    if not line.job_id:
        return []
    lines = (
        db.query(JobItem)
        .filter(JobItem.job_id == line.job_id, JobItem.stock_code == sku)
        .all()
    )
    raised_for = [i for i in lines if i.po_no == line.order_id] or lines
    return raised_for if raised_for and all(i.is_service for i in raised_for) else []


def receive(
    db: Session,
    *,
    sku: str,
    credits: list[tuple[PurchaseOrderItem, int]],
    movement_type: str,
    branch: Optional[str],
    reference: str,
    notes: str,
    date: str,
) -> None:
    """Shelve what arrived: one movement per PO line, naming the PO and its job.

    A line that bought a job's decoration or alteration work is credited (the
    PO still closes) but shelves nothing; the work reads 'Received' on the job
    once all of it is in.
    """
    for line, qty in credits:
        services = service_lines(db, line, sku)
        if services:
            if (line.qty_received or 0) >= (line.qty_ordered or 0):
                for item in services:
                    item.item_status = "Received"
                touch_job(services[0].job)
            continue
        post_movement(
            db,
            sku=sku,
            movement_type=movement_type,
            branch=branch,
            quantity=qty,
            date=date,
            reference=reference,
            po_id=line.order_id,
            po_line=line.id,
            job_id=line.job_id,
            notes=notes,
        )


def fill_back_orders(
    db: Session, sku: str, prefer_job_ids: Iterable[Optional[str]] = ()
) -> None:
    """Give newly arrived stock to the job lines waiting for it.

    The jobs the PO lines were raised for come first, in line order — that is
    who the goods were bought for. Whatever is left goes to the rest, oldest
    due first. A line whose back-order is now fully covered reads 'Received'.

    Open orders only (the committed statuses): a quote or a portal order not
    yet confirmed reserves nothing, so it is given nothing.
    """
    inv = db.query(InventoryItem).filter_by(sku=sku).first()
    if not inv:
        return
    db.flush()
    available = max(0, (inv.stock or 0) - committed_total(db, sku))
    if available <= 0:
        return
    waiting = (
        db.query(JobItem, Job)
        .join(Job, Job.id == JobItem.job_id)
        .filter(
            JobItem.stock_code == sku,
            JobItem.b_ord > 0,
            Job.status.in_(list(COMMITTED_STATUSES)),
        )
        .order_by(Job.due.asc().nullslast(), Job.id.asc(), JobItem.id.asc())
        .all()
    )
    preferred = [job_id for job_id in prefer_job_ids if job_id]
    rank = {job_id: n for n, job_id in enumerate(dict.fromkeys(preferred))}
    waiting.sort(key=lambda pair: rank.get(pair[1].id, len(rank)))
    for item, job in waiting:
        if available <= 0:
            break
        fill = min(item.b_ord, available)
        item.b_ord -= fill
        # Back-order becomes supply: order_qty = supply_qty + b_ord still holds.
        item.supply_qty = (item.supply_qty or 0) + fill
        if item.b_ord == 0:
            item.item_status = "Received"
        touch_job(job)
        # It is supplied from stock now, so it is reserved for this job — the
        # open order's reservation is what it supplies (F14).
        post_movement(
            db,
            sku=sku,
            movement_type="Committed",
            branch=job.branch,
            committed=fill,
            date=date.today().isoformat(),
            reference=job.id,
            job_id=job.id,
            notes=f"Committed for Job {job.id} — back-order filled",
        )
        available -= fill

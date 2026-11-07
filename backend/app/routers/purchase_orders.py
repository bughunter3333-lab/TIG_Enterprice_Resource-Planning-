import io
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Optional, List

from app.database import get_db
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.inventory import InventoryItem
from app.models.job import Job, JobItem
from app.models.logo import Logo
from app.models.settings import CompanySettings
from app.models.supplier import Supplier
from app.core import po_totals, purchase_order_document, receiving
from app.core.dependencies import require_any, require_staff
from app.core.reservations import COMMITTED_STATUSES
from app.routers.email_router import _send_and_log, smtp_config
from app.routers.jobs import _total_from_lines
from app.core.stock_location import DEFAULT_BRANCH
from app.models.user import User
from datetime import datetime

router = APIRouter(prefix="/purchase-orders", tags=["purchase_orders"])

VALID_STATUSES = {"Draft", "Sent", "Partial", "Received", "Cancelled"}
# What a person may set. Partial and Received are what the lines say
# (`receiving.settle_po_status`), never chosen (F29) — save that a Partial PO
# may be closed short as Received (`_check_status_change`, F25).
SETTABLE_STATUSES = ("Draft", "Sent", "Cancelled")
# A PO in these is closed: there is nothing left to send the supplier (F17).
UNSENDABLE_STATUSES = ("Cancelled", "Received")
# What a PO is created as: nothing has arrived against a new one (F25).
NEW_STATUSES = ("Draft", "Sent")


def _set_totals(po: PurchaseOrder) -> None:
    """Each line is its quantity times its unit cost; the PO is their sum plus GST.

    Every way of raising a PO goes through this. The two that raise one from
    order requirements and from back-orders set only `total`, so their ex-GST,
    GST and inc-GST figures read zero, and aged payables — which reads the
    inc-GST total — never saw them (F15). The formula is `app/core/po_totals.py`,
    shared with auto-reorder, the PO document and the ledger health check.
    """
    po_totals.set_totals(po)


def _po_with_items(db: Session, po_id: str) -> PurchaseOrder:
    """Reloaded with its lines, so the response carries them — a refreshed PO
    serialises with its lines expired, which is how a new PO came back empty."""
    return (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items))
        .filter(PurchaseOrder.id == po_id)
        .first()
    )


class POItemSchema(BaseModel):
    sku: Optional[str] = None
    # Which job this line is for. Optional because a stock replenishment PO is
    # for no job in particular.
    job_id: Optional[str] = None
    description: Optional[str] = None
    qty_ordered: int = 0
    qty_received: int = 0
    unit_cost: float = 0
    total: float = 0


class POCreate(BaseModel):
    id: str
    supplier_id: str
    supplier_name: Optional[str] = None
    status: str = "Draft"
    order_date: Optional[str] = None
    expected_date: Optional[str] = None
    notes: Optional[str] = None
    items: List[POItemSchema] = []


class POUpdate(BaseModel):
    # A field it does not know is refused: `items` sent here used to be dropped
    # with a 200, so a set-up charge "added" to a PO was never on it (S2-20).
    model_config = ConfigDict(extra="forbid")

    status: Optional[str] = None
    expected_date: Optional[str] = None
    notes: Optional[str] = None
    # Lines added to the PO — a printer's set-up charge on the decoration PO,
    # so the supplier's bill can match it. Lines already on it are not edited.
    add_items: Optional[List[POItemSchema]] = None


class ReceiveItem(BaseModel):
    id: int
    qty_received: int = Field(..., gt=0)


class ReceiveItems(BaseModel):
    items: List[ReceiveItem]


class RequirementItem(BaseModel):
    item_id: int
    qty: int = Field(..., gt=0)


class POFromRequirements(BaseModel):
    id: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    expected_date: Optional[str] = None
    notes: Optional[str] = None
    requirements: List[RequirementItem]


@router.get("")
def list_pos(
    status: Optional[str] = Query(None),
    supplier_id: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    q = db.query(PurchaseOrder).options(joinedload(PurchaseOrder.items))
    if status:
        q = q.filter(PurchaseOrder.status == status)
    if supplier_id:
        q = q.filter(PurchaseOrder.supplier_id == supplier_id)
    return q.order_by(PurchaseOrder.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/next-id")
def next_po_id(db: Session = Depends(get_db), _: User = Depends(require_any)):
    """Return the next available PO ID in PO-NNNN format."""
    from sqlalchemy import func as sqlfunc

    last = db.query(PurchaseOrder.id).order_by(PurchaseOrder.created_at.desc()).first()
    if last:
        try:
            num = int(last[0].split("-")[-1]) + 1
        except (ValueError, IndexError):
            num = db.query(sqlfunc.count(PurchaseOrder.id)).scalar() + 1
    else:
        num = 1
    return {"id": f"PO-{num:04d}"}


@router.get("/{po_id}")
def get_po(po_id: str, db: Session = Depends(get_db), _: User = Depends(require_any)):
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items))
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return po


@router.post("")
def create_po(
    body: POCreate, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    if db.query(PurchaseOrder).filter(PurchaseOrder.id == body.id).first():
        raise HTTPException(status_code=409, detail="PO ID already exists")
    # Created as Received, or with lines already received, a PO read as goods
    # received and not billed while nothing had been shelved (F25).
    if body.status not in NEW_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"A new purchase order is Draft or Sent, not '{body.status}'",
        )
    if any(item.qty_received for item in body.items):
        raise HTTPException(
            status_code=422,
            detail="A new purchase order has nothing received — receive goods against it",
        )
    po = PurchaseOrder(**body.model_dump(exclude={"items"}))
    for item_data in body.items:
        po.items.append(PurchaseOrderItem(**item_data.model_dump()))
    _set_totals(po)
    db.add(po)
    db.commit()
    return _po_with_items(db, po.id)


@router.post("/from-requirements")
def create_po_from_requirements(
    body: POFromRequirements,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Create a PO from order requirements and back-fill po_no / po_due on the linked job items."""
    if db.query(PurchaseOrder).filter(PurchaseOrder.id == body.id).first():
        raise HTTPException(status_code=409, detail="PO ID already exists")

    item_ids = [r.item_id for r in body.requirements]
    job_items = db.query(JobItem).filter(JobItem.id.in_(item_ids)).all()
    item_map = {ji.id: ji for ji in job_items}

    # A logo done in-house is production work, not a purchase: the worklist no
    # longer offers it, and this is the door it could still come in by (F16).
    logo_ids = {ji.logo_id for ji in job_items if ji.logo_id}
    in_house = {
        logo.id: logo.code
        for logo in db.query(Logo).filter(
            Logo.id.in_(logo_ids), Logo.made_by == "in_house"
        )
    }
    refused = [
        f"job {ji.job_id} {in_house[ji.logo_id]}"
        for ji in job_items
        if ji.logo_id in in_house
    ]
    if refused:
        raise HTTPException(
            status_code=422,
            detail="In-house work is not bought on a PO: " + ", ".join(refused),
        )

    # One line per SKU *per job*, not one line per SKU. Jim2's PO 2048001 carries
    # RS.K43012CU.NAV.14 twice -- once for job 1194956 and once for 1194961 --
    # because a purchase order covering six jobs still has to say which units
    # belong to which. Collapsing by SKU alone is what turned a real shortage
    # into "35 units across 22 jobs" with nothing to reconcile it against.
    sku_groups: dict = {}
    for req in body.requirements:
        ji = item_map.get(req.item_id)
        if not ji:
            continue
        sku = ji.stock_code or ji.description or "ITEM"
        key = (sku, ji.job_id)
        if key not in sku_groups:
            inv = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
            sku_groups[key] = {
                "sku": sku,
                "job_id": ji.job_id,
                "description": ji.description or sku,
                "qty_ordered": 0,
                "unit_cost": (
                    float(inv.unit_cost) if inv else float(ji.purchase_price or 0)
                ),
                "total": 0,
            }
        sku_groups[key]["qty_ordered"] += req.qty

    for grp in sku_groups.values():
        grp["total"] = grp["qty_ordered"] * grp["unit_cost"]

    po = PurchaseOrder(
        id=body.id,
        supplier_id=body.supplier_id,
        supplier_name=body.supplier_name,
        status="Draft",
        order_date=datetime.now().strftime("%d/%m/%Y"),
        expected_date=body.expected_date,
        notes=body.notes,
    )
    for grp in sku_groups.values():
        po.items.append(PurchaseOrderItem(**grp))
    _set_totals(po)
    db.add(po)

    for req in body.requirements:
        ji = item_map.get(req.item_id)
        if ji:
            ji.po_no = body.id
            ji.po_due = body.expected_date
            receiving.touch_job(ji.job)

    db.commit()
    return _po_with_items(db, body.id)


class POFromJobs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_ids: List[str] = Field(min_length=1, max_length=500)
    expected_date: Optional[str] = None


def _new_po_id(db: Session) -> str:
    """The next free `PO-YYYYMMDD-n` for today."""
    prefix = f"PO-{datetime.now():%Y%m%d}-"
    n = db.query(PurchaseOrder).filter(PurchaseOrder.id.like(f"{prefix}%")).count()
    while db.get(PurchaseOrder, f"{prefix}{n + 1}") is not None:
        n += 1
    return f"{prefix}{n + 1}"


@router.post("/from-jobs")
def create_pos_from_jobs(
    body: POFromJobs,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Raise the purchase orders the selected jobs' short garment lines need —
    Jim2's "Auto Create Purchase Orders" on the job list (JIM24, JIM3).

    One PO per supplier across the jobs, a line per job as on any PO raised
    from requirements (that path writes each PO and its number back onto the
    job lines). Only open orders' back-ordered lines not already on a PO are
    bought; a line whose stock item names no supplier, and a job that is not
    an open order, are reported rather than guessed at.
    """
    jobs = db.query(Job).filter(Job.id.in_(body.job_ids)).all()
    skipped, by_supplier = [], {}
    suppliers = {s.name: s for s in db.query(Supplier).all()}
    for job in sorted(jobs, key=lambda j: body.job_ids.index(j.id)):
        if job.status not in COMMITTED_STATUSES:
            if any((it.b_ord or 0) > 0 for it in job.items):
                skipped.append(
                    {
                        "job_id": job.id,
                        "sku": "",
                        "reason": f"not an open order ({job.status})",
                    }
                )
            continue
        for it in job.items:
            if (it.b_ord or 0) <= 0 or it.po_no or it.is_service:
                continue
            inv = db.query(InventoryItem).filter_by(sku=it.stock_code).first()
            supplier = suppliers.get(inv.supplier) if inv and inv.supplier else None
            if supplier is None:
                supplier = (
                    db.get(Supplier, inv.supplier) if inv and inv.supplier else None
                )
            if supplier is None:
                skipped.append(
                    {
                        "job_id": job.id,
                        "sku": it.stock_code or "",
                        "reason": f"{it.stock_code} has no supplier on its stock record",
                    }
                )
                continue
            by_supplier.setdefault(supplier.id, (supplier, []))[1].append(
                RequirementItem(item_id=it.id, qty=it.b_ord)
            )

    created = []
    for supplier, requirements in by_supplier.values():
        po = create_po_from_requirements(
            POFromRequirements(
                id=_new_po_id(db),
                supplier_id=supplier.id,
                supplier_name=supplier.name,
                expected_date=body.expected_date,
                requirements=requirements,
            ),
            db,
            current_user,
        )
        # Read now: the next supplier's PO commits, which expires this one.
        created.append(
            {
                "id": po.id,
                "supplier_id": po.supplier_id,
                "supplier_name": po.supplier_name,
                "status": po.status,
                "total_inc": float(po.total_inc or 0),
                "items": [
                    {
                        "sku": line.sku,
                        "job_id": line.job_id,
                        "qty_ordered": line.qty_ordered,
                        "unit_cost": float(line.unit_cost or 0),
                    }
                    for line in po.items
                ],
            }
        )
    return {"created": created, "skipped": skipped}


class BackOrderItem(BaseModel):
    sku: str
    description: Optional[str] = None
    qty: int
    unit_cost: float = 0
    job_ids: List[str] = []


class POFromBackOrders(BaseModel):
    id: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    expected_date: Optional[str] = None
    notes: Optional[str] = None
    items: List[BackOrderItem]


def _shares_by_job(db: Session, item: BackOrderItem) -> list[tuple]:
    """One back-order row's quantity as (job_id, qty, job lines), a share per job.

    Each job takes what it back-orders, in the order the jobs were given, until
    the quantity runs out; whatever is bought beyond them is for stock, with no
    job. The row used to become one line with no job on it, so the receipt had
    no one to prefer and filled the oldest job due — leaving the job it was
    bought for waiting on a PO already received, and hidden from the buying
    list by its po_no (F18).
    """
    waiting = (
        db.query(JobItem)
        .filter(
            JobItem.job_id.in_(item.job_ids),
            JobItem.stock_code == item.sku,
            JobItem.b_ord > 0,
        )
        .all()
        if item.job_ids
        else []
    )
    given = {job_id: n for n, job_id in enumerate(dict.fromkeys(item.job_ids))}
    waiting.sort(key=lambda ji: (given[ji.job_id], ji.id))
    shares: dict = {}
    left = item.qty
    for ji in waiting:
        take = min(ji.b_ord, left)
        if take <= 0:
            break
        share = shares.setdefault(ji.job_id, [0, []])
        share[0] += take
        share[1].append(ji)
        left -= take
    rows = [(job_id, qty, lines) for job_id, (qty, lines) in shares.items()]
    if left > 0 or not rows:
        rows.append((None, left, []))
    return rows


@router.post("/from-back-orders")
def create_po_from_back_orders(
    body: POFromBackOrders,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Create a PO from selected back-order rows, a line per job it is for.

    The job lines it buys for carry its number (po_no), as a PO raised from
    order requirements does.
    """
    if db.query(PurchaseOrder).filter(PurchaseOrder.id == body.id).first():
        raise HTTPException(status_code=409, detail="PO ID already exists")

    po = PurchaseOrder(
        id=body.id,
        supplier_id=body.supplier_id,
        supplier_name=body.supplier_name,
        status="Draft",
        order_date=datetime.now().strftime("%Y-%m-%d"),
        expected_date=body.expected_date,
        notes=body.notes,
    )
    linked = []
    for item in body.items:
        for job_id, qty, lines in _shares_by_job(db, item):
            po.items.append(
                PurchaseOrderItem(
                    sku=item.sku,
                    job_id=job_id,
                    description=item.description or item.sku,
                    qty_ordered=qty,
                    qty_received=0,
                    unit_cost=item.unit_cost,
                )
            )
            linked.extend(lines)
    _set_totals(po)
    db.add(po)
    db.flush()

    for ji in linked:
        ji.po_no = body.id
        if body.expected_date:
            ji.po_due = body.expected_date
        receiving.touch_job(ji.job)

    db.commit()
    return _po_with_items(db, body.id)


def _check_status_change(po: PurchaseOrder, status: str) -> None:
    """Draft, Sent and Cancelled are chosen; Partial and Received are not (F29).

    Set by hand they said whatever somebody picked: a PO with 4 of 6 still to
    come read Received, and the screen then hid the controls to receive them.
    Once anything has arrived the lines decide, so the PO cannot be put back to
    Draft or Sent, or cancelled with goods already on the shelf.

    The one exception is closing it short (F25): a Partial PO whose rest is not
    coming is set Received. Left Partial, it was committed spend for units
    that would never arrive, and could be closed no other way.
    """
    if status == "Received" and po.status == "Partial":
        return
    if status not in SETTABLE_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"'{status}' follows from what has been received; it is not set by hand"
                if status in VALID_STATUSES
                else f"Invalid status. Valid: {list(SETTABLE_STATUSES)}"
            ),
        )
    if any((line.qty_received or 0) > 0 for line in po.items):
        raise HTTPException(
            status_code=422,
            detail=f"{po.id} has goods received against it, so it stays {po.status}",
        )


def _release_waiting_lines(db: Session, po: PurchaseOrder, status: str) -> None:
    """Job lines a closed PO will no longer fill go back on the buying list.

    A line keeps the number of the PO raised for it, and the buying list skips
    a line that has one. Closed short, the PO will not bring the units still
    back-ordered; cancelled, it brings nothing. Left pointing at it, those
    lines were never suggested for buying again.
    """
    lines = db.query(JobItem).filter(JobItem.po_no == po.id)
    if status == "Received":
        lines = lines.filter(JobItem.b_ord > 0)
    for ji in lines:
        ji.po_no = None
        ji.po_due = None
        receiving.touch_job(ji.job)
    if status == "Received":
        for po_line in po.items:
            _release_short_work(db, po_line)


def _release_short_work(db: Session, po_line: PurchaseOrderItem) -> None:
    """Decoration a PO closed short will not bring goes back on the buying list.

    Work is never back-ordered, so the release above passed it by: an
    embroiderer's 38 of 40 closed the PO with the 2 missing applications on no
    list, and none of the job's decoration — even what came back — read
    Received (S2-17). One PO line buys a job's applications across its lines,
    so what came is given to them in line order; the lines it does not cover
    are released, to be bought again. A line it covers in part, on an open
    order, is split: what came stays on this PO, Received, and the rest is a
    line of its own to buy — released whole, 38 of 40 came back asking for 40.
    """
    services = receiving.service_lines(db, po_line, po_line.sku)
    if not services or (po_line.qty_received or 0) >= (po_line.qty_ordered or 0):
        return
    job = services[0].job
    covered = po_line.qty_received or 0
    split = False
    for item in sorted(services, key=lambda i: (i.sort or 0, i.id or 0)):
        qty = int(item.order_qty or 0)
        if qty <= covered:
            covered -= qty
            item.item_status = "Received"
        elif covered and job.status in COMMITTED_STATUSES:
            job.items.append(_split_off(item, qty - covered))
            item.order_qty = item.supply_qty = covered
            if item.qty:
                item.qty = min(int(item.qty), covered)
            item.item_status = "Received"
            covered, split = 0, True
        else:
            item.po_no = item.po_due = None
    if split:
        _total_from_lines(job)
    receiving.touch_job(job)


def _split_off(item: JobItem, qty: int) -> JobItem:
    """A copy of a decoration line for `qty` of it, not on any PO yet."""
    columns = {c.key: getattr(item, c.key) for c in JobItem.__table__.columns}
    for key in ("id", "job_id", "po_no", "po_due", "item_status"):
        columns.pop(key, None)
    rest = JobItem(**columns)
    rest.order_qty = rest.supply_qty = qty
    rest.b_ord = 0
    if rest.qty:
        rest.qty = max(0, int(rest.qty) - (int(item.order_qty or 0) - qty))
    return rest


def _add_lines(po: PurchaseOrder, lines: List[POItemSchema], status: str) -> None:
    """New lines on an open PO, each with nothing received yet (F25).

    `status` is what the PO is becoming, so a save that closes it adds nothing.
    """
    if status in UNSENDABLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"{po.id} is {status} — nothing is added to it",
        )
    if any(line.qty_received for line in lines):
        raise HTTPException(
            status_code=422,
            detail="An added line has nothing received — receive goods against it",
        )
    for line in lines:
        po.items.append(PurchaseOrderItem(**line.model_dump()))
    _set_totals(po)


@router.patch("/{po_id}")
def update_po(
    po_id: str,
    body: POUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    # Locked as a receive locks it, so a cancel cannot read a line as empty
    # while a receive is crediting it (F29).
    po = receiving.lock_po(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if body.status is not None and body.status != po.status:
        _check_status_change(po, body.status)
        if body.status == "Received":
            po.received_date = po.received_date or datetime.now().strftime("%Y-%m-%d")
        if body.status in ("Received", "Cancelled"):
            _release_waiting_lines(db, po, body.status)
    if body.add_items:
        _add_lines(po, body.add_items, body.status or po.status)
    for field, value in body.model_dump(
        exclude_none=True, exclude={"add_items"}
    ).items():
        setattr(po, field, value)
    db.commit()
    return _po_with_items(db, po_id)


@router.post("/{po_id}/receive")
def receive_items(
    po_id: str,
    body: ReceiveItems,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Mark items as received and update inventory stock levels."""
    # Locked before its lines are credited, as a goods receipt locks it (F18).
    po = receiving.lock_po(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    receiving.check_receivable(po)

    receive_map = {r.id: r.qty_received for r in body.items}
    today = datetime.now().strftime("%Y-%m-%d")
    prefer_jobs: dict[str, list] = {}

    for item in po.items:
        if item.id not in receive_map:
            continue
        # The quick receive is capped at what was ordered — a typo of 999
        # against an order of 10 must not put 999 on the shelf. An
        # over-delivery is a goods receipt, where it is inspected and recorded.
        qty = min(
            receive_map[item.id], max(0, item.qty_ordered - (item.qty_received or 0))
        )
        if qty <= 0:
            continue
        # The same path as a goods receipt: the line is credited, the movement
        # names the PO and the line's job, and waiting back-orders are filled.
        credits = receiving.credit_po_lines(po, item.sku, qty, po_item=item)
        receiving.receive(
            db,
            sku=item.sku,
            credits=credits,
            movement_type="Purchase Receipt",
            branch=DEFAULT_BRANCH,
            reference=po_id,
            notes=f"Received from PO {po_id}",
            date=today,
        )
        prefer_jobs.setdefault(item.sku, []).append(item.job_id)

    for sku, job_ids in prefer_jobs.items():
        receiving.fill_back_orders(db, sku, job_ids)
    receiving.settle_po_status(po, today)
    db.commit()
    return _po_with_items(db, po_id)


def _po_document(db: Session, po_id: str) -> tuple:
    po = _po_with_items(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    supplier = db.get(Supplier, po.supplier_id) if po.supplier_id else None
    company = db.query(CompanySettings).first() or CompanySettings(
        company_name="Total Image"
    )
    return po, supplier, company, purchase_order_document.build(po, supplier, company)


@router.get("/{po_id}/pdf")
def po_pdf(po_id: str, db: Session = Depends(get_db), _: User = Depends(require_any)):
    """The purchase order as the supplier is sent it (F17)."""
    _, _, _, pdf = _po_document(db, po_id)
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{po_id}.pdf"'},
    )


class POEmail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The supplier's own address unless another is given.
    to_email: Optional[EmailStr] = None
    cc: Optional[EmailStr] = None
    message: Optional[str] = Field(None, max_length=4000)


@router.post("/{po_id}/email")
def email_po(
    po_id: str,
    body: POEmail,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Email the purchase order to its supplier, the PDF attached.

    Sending is what makes a Draft 'Sent' — it used to be a status somebody set,
    while the order itself went out of the system, if at all (F17). The send
    happens before the answer and is logged either way, as invoices are.
    """
    settings = db.query(CompanySettings).first()
    if not settings or not settings.smtp_host:
        raise HTTPException(
            status_code=400,
            detail="SMTP not configured. Set SMTP settings in Company Settings.",
        )
    po, supplier, company, pdf = _po_document(db, po_id)
    if po.status in UNSENDABLE_STATUSES:
        # Sent again, the supplier reads a closed order as a new one.
        raise HTTPException(
            status_code=409,
            detail=f"Purchase order {po.id} is {po.status} — it is not sent again",
        )
    to = body.to_email or (supplier.email if supplier else None)
    if not to:
        raise HTTPException(
            status_code=422,
            detail=f"{po.supplier_name or 'The supplier'} has no email address — give one",
        )

    sender = company.company_name or "TIG"
    subject = f"Purchase order {po.id} — {sender}"
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name or sender} <{settings.smtp_user}>"
    msg["To"] = to
    if body.cc:
        msg["Cc"] = body.cc
    text = (body.message or "").strip()
    msg.attach(
        MIMEText(
            (f"<p>{escape(text)}</p>" if text else "")
            + f"<p>Please find attached our purchase order {escape(po.id)}.</p>"
            + f"<p>{escape(purchase_order_document.STANDING_INSTRUCTION)}</p>",
            "html",
        )
    )
    attachment = MIMEApplication(pdf, _subtype="pdf")
    attachment.add_header("Content-Disposition", "attachment", filename=f"{po.id}.pdf")
    msg.attach(attachment)

    error = _send_and_log(
        db,
        smtp_config=smtp_config(settings),
        recipients=[to] + ([body.cc] if body.cc else []),
        msg_string=msg.as_string(),
        log_data={
            "to_email": to,
            "subject": subject,
            "po_id": po.id,
            "email_type": "purchase_order",
            "sent_by": current_user.username,
        },
    )
    if error:
        raise HTTPException(
            status_code=502, detail=f"The email could not be sent: {error}"
        )
    if po.status == "Draft":
        po.status = "Sent"
        db.commit()
    return {
        "ok": True,
        "message": f"Purchase order {po.id} sent to {to}",
        "status": po.status,
    }


@router.delete("/{po_id}")
def delete_po(
    po_id: str, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    db.delete(po)
    db.commit()
    return {"ok": True}

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
from app.models.job import JobItem
from app.models.settings import CompanySettings
from app.models.supplier import Supplier
from app.core import purchase_order_document, receiving
from app.core.dependencies import require_any, require_staff
from app.routers.email_router import _send_and_log, smtp_config
from app.core.ledger import money
from app.core.stock_location import DEFAULT_BRANCH
from app.models.user import User
from datetime import datetime
from decimal import Decimal

router = APIRouter(prefix="/purchase-orders", tags=["purchase_orders"])

VALID_STATUSES = {"Draft", "Sent", "Partial", "Received", "Cancelled"}
_GST = Decimal("0.10")


def _set_totals(po: PurchaseOrder) -> None:
    """Each line is its quantity times its unit cost; the PO is their sum plus GST.

    Every way of raising a PO goes through this. The two that raise one from
    order requirements and from back-orders set only `total`, so their ex-GST,
    GST and inc-GST figures read zero, and aged payables — which reads the
    inc-GST total — never saw them (F15).
    """
    total_ex = Decimal("0")
    for line in po.items:
        line.total = money(Decimal(int(line.qty_ordered or 0)) * money(line.unit_cost))
        total_ex += money(line.total)
    tax = money(total_ex * _GST)
    po.total_ex = total_ex
    po.tax_total = tax
    po.total_inc = total_ex + tax
    po.total = po.total_inc  # the older single total, kept in step


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
    status: Optional[str] = None
    expected_date: Optional[str] = None
    notes: Optional[str] = None


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


@router.patch("/{po_id}")
def update_po(
    po_id: str,
    body: POUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if body.status and body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(po, field, value)
    db.commit()
    db.refresh(po)
    return po


@router.post("/{po_id}/receive")
def receive_items(
    po_id: str,
    body: ReceiveItems,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Mark items as received and update inventory stock levels."""
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items))
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

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

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, cast, Integer
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

from app.database import get_db
from app.core.stock_location import adjust_location
from app.models.job import Job, JobItem, JobComment
from app.models.job_payment import JobPayment
from app.models.customer import Customer
from app.models.inventory import InventoryItem, StockMovement
from app.core.dependencies import require_any, require_staff
from app.models.user import User

router = APIRouter(prefix="/jobs", tags=["jobs"])

VALID_STATUSES = {
    "QUOTE",
    "New",
    "ORDER",
    "In Progress",
    "PROOF",
    "PRINT",
    "Pick/Pack",
    "FINISH",
    "INVOICE",
    "PAID",
    "CANCEL",
}

# Allowed forward and backward transitions for non-admin users.
# Key = current status, value = set of allowed next statuses.
# Admins bypass this map entirely.
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "QUOTE": {"ORDER", "CANCEL"},
    "New": {"ORDER", "QUOTE", "CANCEL"},
    "ORDER": {"In Progress", "QUOTE", "CANCEL"},
    "In Progress": {"PROOF", "PRINT", "ORDER", "CANCEL"},
    "PROOF": {"In Progress", "PRINT", "CANCEL"},
    "PRINT": {"Pick/Pack", "In Progress", "CANCEL"},
    "Pick/Pack": {"FINISH", "PRINT", "CANCEL"},
    "FINISH": {"INVOICE", "Pick/Pack", "CANCEL"},
    "INVOICE": {"PAID", "FINISH", "CANCEL"},
    "PAID": {"CANCEL"},
    "CANCEL": {"QUOTE"},
}

# Fields that must be present when moving to certain statuses.
REQUIRED_FIELDS_FOR_STATUS: dict[str, list[tuple[str, str]]] = {
    "ORDER": [("customer_id", "Customer must be set before converting to ORDER")],
    "INVOICE": [("invoice", "Invoice number must be set before marking as INVOICE")],
}


# ── Pydantic schemas ──────────────────────────────────────────────────────────


class JobItemSchema(BaseModel):
    sort: int = 0
    display_type: str = "product"
    description: Optional[str] = None
    sizes: Optional[str] = None
    stock_code: Optional[str] = None
    decoration_type: str = "None"
    emb_code: Optional[str] = None
    trs_code: Optional[str] = None
    dec_code: Optional[str] = None
    stitch_count: Optional[int] = None
    color_count: Optional[int] = None
    dec_position: Optional[str] = None
    order_qty: int = 0
    supply_qty: int = 0
    qty: int = 0
    b_ord: int = 0
    qty_pick: int = 0
    qty_delivered: int = 0
    qty_invoiced: int = 0
    weight_kg: float = 0
    purchase_price: float = 0
    margin: float = 0
    margin_percent: float = 0
    discount: float = 0
    price_ex: float = 0
    price_inc: float = 0
    total: float = 0
    hide: bool = False
    tax_type: Optional[str] = None
    item_status: Optional[str] = None
    po_no: Optional[str] = None
    po_due: Optional[str] = None


class _JobSharedFields(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    date_in: Optional[str] = None
    type: Optional[str] = None
    quote: Optional[str] = None
    invoice: Optional[str] = None
    due: Optional[str] = None
    out: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    total_ex: Optional[float] = None
    tax: Optional[float] = None
    total_inc: Optional[float] = None
    deposit: Optional[float] = None
    balance_due: Optional[float] = None
    payment_method: Optional[str] = None
    shipping_address: Optional[str] = None
    notes: Optional[str] = None
    # Jim2 fields
    cust_ref: Optional[str] = None
    our_ref: Optional[str] = None
    description: Optional[str] = None
    ship_to: Optional[str] = None
    project_no: Optional[str] = None
    serial_no: Optional[str] = None
    name_contact: Optional[str] = None
    # ERP enhancement fields
    payment_status: Optional[str] = None
    commitment_date: Optional[str] = None
    validity_date: Optional[str] = None
    locked: Optional[bool] = None
    invoice_status: Optional[str] = None
    proof_status: Optional[str] = None
    proof_notes: Optional[str] = None
    # Production / dispatch fields
    branch: Optional[str] = None
    ship_to_id: Optional[int] = None
    weight_total: Optional[float] = None
    fuel_levy: Optional[float] = None
    # Jim2 Sprint-2 fields
    price_level: Optional[str] = None
    acc_mgr: Optional[str] = None
    invoice_desc: Optional[str] = None
    ex_job_ref: Optional[str] = None
    requested_by: Optional[str] = None
    lock_rate: Optional[bool] = None


class JobCreate(_JobSharedFields):
    id: Optional[str] = None
    customer_id: str
    customer_name: Optional[str] = None
    status: str = "QUOTE"
    date_in: Optional[str] = None
    quote: Optional[str] = None
    priority: str = "Normal"
    type: str = "Normal"
    total_ex: float = 0
    tax: float = 0
    total_inc: float = 0
    deposit: float = 0
    balance_due: float = 0
    payment_method: Optional[str] = "Account"
    payment_status: str = "unpaid"
    locked: bool = False
    invoice_status: str = "not_invoiced"
    items: List[JobItemSchema] = Field(default_factory=list)


class JobUpdate(_JobSharedFields):
    status: Optional[str] = None
    items: Optional[List[JobItemSchema]] = None


class StatusUpdate(BaseModel):
    status: str


class CommentCreate(BaseModel):
    comment: str
    inc: bool = False
    is_internal: bool = False


class LockToggle(BaseModel):
    locked: bool


class PaymentCreate(BaseModel):
    amount: float
    method: str = "EFT"
    reference: Optional[str] = None
    received_date: Optional[str] = None
    notes: Optional[str] = None


class DispatchRequest(BaseModel):
    ship_via: str
    ship_ref: str
    cartons: int = 1
    notes: Optional[str] = None
    advance_status: bool = False


class PickLine(BaseModel):
    item_id: int
    qty_pick: int = Field(ge=0)


class PickRequest(BaseModel):
    picks: List[PickLine]


# ── Helpers ───────────────────────────────────────────────────────────────────


def _validate_transition(job: "Job", new_status: str, current_user: "User") -> None:
    """Raise 422 if the status move is not permitted for this user's role."""
    if current_user.role == "admin":
        return  # admins can make any move
    allowed = ALLOWED_TRANSITIONS.get(job.status, set())
    if new_status not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot move from '{job.status}' to '{new_status}'. "
            f"Allowed next statuses: {', '.join(sorted(allowed)) or 'none'}.",
        )


def _validate_required_fields(job: "Job", new_status: str) -> None:
    """Raise 422 if required fields are missing for the target status."""
    for field, message in REQUIRED_FIELDS_FOR_STATUS.get(new_status, []):
        if not getattr(job, field, None):
            raise HTTPException(status_code=422, detail=message)
    if new_status == "INVOICE" and float(job.total_inc or 0) <= 0:
        raise HTTPException(
            status_code=422,
            detail="Job total must be greater than zero before invoicing",
        )


def _check_credit_limit(job: "Job", db: Session) -> None:
    """Raise 422 if converting to ORDER would exceed the customer's credit limit."""
    if not job.customer_id:
        return
    customer = db.query(Customer).filter(Customer.id == job.customer_id).first()
    if not customer:
        return
    if customer.credit_hold:
        raise HTTPException(
            status_code=422, detail=f"Customer '{customer.name}' is on credit hold"
        )
    if float(customer.credit_limit or 0) > 0:
        outstanding = float(customer.balance or 0)
        job_total = float(job.total_inc or 0)
        if outstanding + job_total > float(customer.credit_limit):
            raise HTTPException(
                status_code=422,
                detail=f"Order would exceed credit limit of ${customer.credit_limit:.2f} "
                f"(current balance ${outstanding:.2f}, order ${job_total:.2f})",
            )


# Statuses where stock is actively reserved (committed)
_COMMITTED_STATUSES = {
    "ORDER",
    "In Progress",
    "PROOF",
    "PRINT",
    "Pick/Pack",
    "FINISH",
    "INVOICE",
}

# Fuel levy rate: 13% of freight (derived from sticky note: $30→$3.90, $20→$2.60, $15→$1.95)
_FUEL_LEVY_RATE = 0.13


def calculate_fuel_levy(freight_amount: float) -> float:
    """Return fuel levy rounded to 2 decimal places at the sliding rate."""
    if freight_amount <= 0:
        return 0.0
    return round(freight_amount * _FUEL_LEVY_RATE, 2)


def _commit_job_stock(job: "Job", db: Session) -> None:
    """Reserve (commit) stock for all product lines on this job."""
    today = datetime.now().strftime("%Y-%m-%d")
    for item in job.items:
        if not item.stock_code or item.display_type != "product":
            continue
        qty = item.qty or item.order_qty or 0
        if qty <= 0:
            continue
        inv = (
            db.query(InventoryItem).filter(InventoryItem.sku == item.stock_code).first()
        )
        if not inv:
            continue
        inv.committed_qty = (inv.committed_qty or 0) + qty
        # The reservation belongs to the branch that will ship it.
        adjust_location(db, item.stock_code, job.branch, committed=qty)
        db.add(
            StockMovement(
                sku=item.stock_code,
                date=today,
                type="Committed",
                quantity=qty,
                reference=job.id,
                notes=f"Committed for Job {job.id}",
            )
        )


def _release_job_stock(job: "Job", db: Session) -> None:
    """Release (un-commit) stock previously reserved for this job."""
    today = datetime.now().strftime("%Y-%m-%d")
    for item in job.items:
        if not item.stock_code or item.display_type != "product":
            continue
        qty = item.qty or item.order_qty or 0
        if qty <= 0:
            continue
        inv = (
            db.query(InventoryItem).filter(InventoryItem.sku == item.stock_code).first()
        )
        if not inv:
            continue
        inv.committed_qty = max(0, (inv.committed_qty or 0) - qty)
        adjust_location(db, item.stock_code, job.branch, committed=-qty)
        db.add(
            StockMovement(
                sku=item.stock_code,
                date=today,
                type="Released",
                quantity=-qty,
                reference=job.id,
                notes=f"Released from Job {job.id}",
            )
        )


def _deplete_on_hand(job: "Job", db: Session) -> None:
    """Goods physically leave on-hand stock when the job is invoiced (Jim2 model).
    Idempotent per job: a "Sale" movement already on the ledger means done."""
    already = (
        db.query(StockMovement)
        .filter(StockMovement.job_id == job.id, StockMovement.type == "Sale")
        .first()
    )
    if already:
        return
    today = datetime.now().strftime("%Y-%m-%d")
    for item in job.items:
        if not item.stock_code or item.display_type != "product":
            continue
        qty = item.supply_qty or 0  # only what was actually supplied from stock ships
        if qty <= 0:
            continue
        inv = (
            db.query(InventoryItem).filter(InventoryItem.sku == item.stock_code).first()
        )
        if not inv:
            continue
        inv.stock = (inv.stock or 0) - qty
        # Goods leave the branch that shipped them, so the per-location
        # position falls with the total (Jim2 Qty by Locations).
        adjust_location(db, item.stock_code, job.branch, on_hand=-qty)
        db.add(
            StockMovement(
                sku=item.stock_code,
                date=today,
                type="Sale",
                quantity=-qty,
                reference=job.id,
                job_id=job.id,
                notes=f"Invoiced — shipped on Job {job.id}",
            )
        )


def _restore_on_hand(job: "Job", db: Session) -> None:
    """Reverse invoice depletion (e.g. on unprint): add stock back, drop Sale rows."""
    sales = (
        db.query(StockMovement)
        .filter(StockMovement.job_id == job.id, StockMovement.type == "Sale")
        .all()
    )
    for mv in sales:
        inv = db.query(InventoryItem).filter(InventoryItem.sku == mv.sku).first()
        if inv:
            # mv.quantity is negative → subtracting it adds the stock back
            inv.stock = (inv.stock or 0) - (mv.quantity or 0)
        db.delete(mv)


def _recalculate_weight(job: "Job", db: Session) -> None:
    """Recompute job.weight_total from item quantities and per-SKU weights."""
    skus = [
        item.stock_code
        for item in job.items
        if item.stock_code and item.display_type == "product"
    ]
    if not skus:
        job.weight_total = 0
        return
    inv_map = {
        inv.sku: float(inv.weight_kg or 0)
        for inv in db.query(InventoryItem).filter(InventoryItem.sku.in_(skus)).all()
    }
    total = 0.0
    for item in job.items:
        if not item.stock_code or item.display_type != "product":
            continue
        weight = inv_map.get(item.stock_code, float(item.weight_kg or 0))
        qty = item.qty or item.order_qty or 0
        total += weight * qty
    job.weight_total = round(total, 3)


def _recalculate_customer_balance(customer_id: str, db: Session) -> None:
    """Recompute customer.balance as sum of balance_due across all active jobs."""
    if not customer_id:
        return
    from sqlalchemy import func as sqlfunc

    total = (
        db.query(sqlfunc.coalesce(sqlfunc.sum(Job.balance_due), 0))
        .filter(
            Job.customer_id == customer_id,
            Job.status.in_(["INVOICE", "PAID", "FINISH"]),
        )
        .scalar()
    )
    db.query(Customer).filter(Customer.id == customer_id).update(
        {"balance": float(total or 0)}, synchronize_session=False
    )


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/fuel-levy")
def get_fuel_levy(freight: float, _: User = Depends(require_any)):
    """Calculate fuel levy for a given freight amount (13% sliding scale)."""
    return {"freight": freight, "fuel_levy": calculate_fuel_levy(freight)}


@router.get("")
def list_jobs(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    q = db.query(Job).options(joinedload(Job.items), joinedload(Job.comments))
    if status and status != "all":
        q = q.filter(Job.status == status)
    if priority and priority != "all":
        q = q.filter(Job.priority == priority)
    if search:
        term = f"%{search}%"
        q = q.filter(
            Job.id.ilike(term)
            | Job.customer_name.ilike(term)
            | Job.invoice.ilike(term)
            | Job.cust_ref.ilike(term)
            | Job.our_ref.ilike(term)
        )
    return q.order_by(Job.created_at.desc()).offset(offset).limit(limit).all()


JOB_ID_START = 110000


def _next_job_id(db: Session) -> str:
    # Single MAX() aggregate — O(log N) via primary key index.
    # regexp_match limits to 6-digit IDs so legacy 7-digit random IDs are excluded.
    result = (
        db.query(func.max(cast(Job.id, Integer)))
        .filter(Job.id.regexp_match(r"^\d{6}$"))
        .scalar()
    )
    return str((result or JOB_ID_START - 1) + 1)


def _get_initials(user: "User") -> str:
    name = user.full_name or user.username
    return name[:3].upper()


@router.get("/next-id")
def get_next_job_id(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    return {"next_id": _next_job_id(db)}


@router.get("/sales-register")
def sales_register(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    customer_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Return INVOICE and PAID jobs for the Sales Register, filtered by date range."""
    q = (
        db.query(Job)
        .options(joinedload(Job.items))
        .filter(Job.status.in_(["INVOICE", "PAID"]))
    )
    if customer_id:
        q = q.filter(Job.customer_id == customer_id)
    if date_from:
        q = q.filter(Job.date_in >= date_from)
    if date_to:
        q = q.filter(Job.date_in <= date_to)
    result = q.order_by(Job.date_in.desc()).all()
    total_ex = sum(float(j.total_ex or 0) for j in result)
    total_inc = sum(float(j.total_inc or 0) for j in result)
    total_tax = sum(float(j.tax or 0) for j in result)
    return {
        "jobs": result,
        "summary": {
            "count": len(result),
            "total_ex": round(total_ex, 2),
            "total_inc": round(total_inc, 2),
            "total_tax": round(total_tax, 2),
        },
    }


@router.get("/order-requirements")
def get_order_requirements(
    req_type: str = Query("garment", alias="type"),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Aggregate job items needing ordering, grouped by SKU (garment) or decoration type."""
    EXCLUDE_STATUSES = ["CANCEL", "PAID"]

    base = (
        db.query(JobItem, Job)
        .join(Job, JobItem.job_id == Job.id)
        .filter(~Job.status.in_(EXCLUDE_STATUSES))
    )

    if req_type == "garment":
        rows = base.filter(
            JobItem.b_ord > 0,
            (JobItem.po_no.is_(None)) | (JobItem.po_no == ""),
        ).all()

        grouped: dict = {}
        skus = list({item.stock_code for item, _ in rows if item.stock_code})
        inv_map = (
            {
                inv.sku: inv
                for inv in db.query(InventoryItem)
                .filter(InventoryItem.sku.in_(skus))
                .all()
            }
            if skus
            else {}
        )

        for item, job in rows:
            key = item.stock_code or ""
            if key not in grouped:
                inv = inv_map.get(key)
                grouped[key] = {
                    "sku": key,
                    "description": item.description or "",
                    "supplier": inv.supplier if inv else "",
                    "unit_cost": (
                        float(inv.unit_cost) if inv else float(item.purchase_price or 0)
                    ),
                    "total_b_ord": 0,
                    "jobs": [],
                }
            grouped[key]["total_b_ord"] += item.b_ord or 0
            grouped[key]["jobs"].append(
                {
                    "job_id": job.id,
                    "customer_name": job.customer_name or "",
                    "item_id": item.id,
                    "b_ord": item.b_ord or 0,
                    "po_no": item.po_no or "",
                }
            )
        return list(grouped.values())

    # decoration type
    rows = base.filter(
        JobItem.decoration_type.notin_(["None", ""]),
        JobItem.decoration_type.isnot(None),
        (JobItem.po_no.is_(None)) | (JobItem.po_no == ""),
    ).all()

    grouped: dict = {}
    for item, job in rows:
        dec_code = (
            item.emb_code if item.decoration_type == "EMB" else item.trs_code
        ) or ""
        key = f"{item.decoration_type}:{dec_code}"
        if key not in grouped:
            grouped[key] = {
                "sku": dec_code,
                "decoration_type": item.decoration_type,
                "description": item.description or "",
                "total_qty": 0,
                "jobs": [],
            }
        grouped[key]["total_qty"] += item.order_qty or 0
        grouped[key]["jobs"].append(
            {
                "job_id": job.id,
                "customer_name": job.customer_name or "",
                "item_id": item.id,
                "qty": item.order_qty or 0,
                "dec_code": dec_code,
                "po_no": item.po_no or "",
            }
        )
    return list(grouped.values())


@router.get("/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db), _: User = Depends(require_any)):
    job = (
        db.query(Job)
        .options(joinedload(Job.items), joinedload(Job.comments))
        .filter(Job.id == job_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _job_with_relations(db: Session, job_id: str) -> Job:
    """Re-load a job with items + comments eagerly so the response includes them.
    (db.refresh() expires relationships, which would serialize an empty items list.)"""
    return (
        db.query(Job)
        .options(joinedload(Job.items), joinedload(Job.comments))
        .filter(Job.id == job_id)
        .first()
    )


@router.post("")
def create_job(
    body: JobCreate, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    job_id = body.id or _next_job_id(db)
    if db.query(Job).filter(Job.id == job_id).first():
        raise HTTPException(status_code=409, detail="Job ID already exists")
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
    # Enforce required fields for the requested status on creation.
    required = REQUIRED_FIELDS_FOR_STATUS.get(body.status, [])
    missing_messages: List[str] = []
    for field, message in required:
        if not getattr(body, field, None):
            missing_messages.append(message)
    if missing_messages:
        raise HTTPException(status_code=400, detail="; ".join(missing_messages))
    job = Job(**{**body.model_dump(exclude={"items"}), "id": job_id})
    for item_data in body.items:
        job.items.append(JobItem(**item_data.model_dump()))
    db.add(job)
    db.commit()
    return _job_with_relations(db, job_id)


@router.patch("/{job_id}")
def update_job(
    job_id: str,
    body: JobUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    job = db.query(Job).options(joinedload(Job.items)).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if body.status and body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
    if body.status and body.status != job.status:
        _validate_transition(job, body.status, current_user)
        _validate_required_fields(job, body.status)

    update_data = body.model_dump(exclude_none=True, exclude={"items"})
    for field, value in update_data.items():
        setattr(job, field, value)

    if body.items is not None:
        for item in job.items:
            db.delete(item)
        db.flush()
        for item_data in body.items:
            job.items.append(JobItem(**item_data.model_dump()))
        _recalculate_weight(job, db)

    db.commit()
    return _job_with_relations(db, job_id)


@router.post("/{job_id}/status")
def update_status(
    job_id: str,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    _validate_transition(job, body.status, current_user)
    _validate_required_fields(job, body.status)
    if body.status == "ORDER":
        _check_credit_limit(job, db)

    old_status = job.status
    job.status = body.status
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")

    # Committed stock management
    was_committed = old_status in _COMMITTED_STATUSES
    now_committed = body.status in _COMMITTED_STATUSES
    if not was_committed and now_committed:
        _commit_job_stock(job, db)
    elif was_committed and not now_committed:
        _release_job_stock(job, db)

    # On-hand depletion: stock physically leaves when the job is invoiced (Jim2 model)
    if body.status == "INVOICE" and old_status != "INVOICE":
        _deplete_on_hand(job, db)

    # Set compliance timestamps automatically
    if body.status == "INVOICE" and not job.invoice_date:
        job.invoice_date = today
        job.invoice_status = "invoiced"
    if body.status == "PAID":
        job.payment_status = "paid"
        if not job.payment_date:
            job.payment_date = today
    if body.status == "FINISH":
        if not job.dispatched_at:
            job.dispatched_at = today
    # Recalculate AR balance for the customer
    if body.status in ("INVOICE", "PAID", "CANCEL"):
        _recalculate_customer_balance(job.customer_id, db)
    comment = JobComment(
        job_id=job_id,
        date=now.strftime("%d/%m/%Y"),
        time=now.strftime("%H:%M"),
        initials=_get_initials(current_user),
        author_name=current_user.full_name or current_user.username,
        status=body.status,
        is_internal=True,
        comment=f"Status changed to {body.status}",
    )
    db.add(comment)
    db.commit()
    db.refresh(job)
    return job


@router.post("/{job_id}/comments")
def add_comment(
    job_id: str,
    body: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    now = datetime.now()
    comment = JobComment(
        job_id=job_id,
        date=now.strftime("%d/%m/%Y"),
        time=now.strftime("%H:%M"),
        initials=_get_initials(current_user),
        author_name=current_user.full_name or current_user.username,
        status=job.status,
        inc=body.inc,
        is_internal=body.is_internal,
        comment=body.comment,
    )
    db.add(comment)
    db.commit()
    return {"ok": True}


@router.post("/{job_id}/lock")
def toggle_lock(
    job_id: str,
    body: LockToggle,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.locked = body.locked
    now = datetime.now()
    action = "locked" if body.locked else "unlocked"
    comment = JobComment(
        job_id=job_id,
        date=now.strftime("%d/%m/%Y"),
        time=now.strftime("%H:%M"),
        initials=_get_initials(current_user),
        author_name=current_user.full_name or current_user.username,
        status=job.status,
        is_internal=True,
        comment=f"Job {action} by {current_user.full_name or current_user.username}",
    )
    db.add(comment)
    db.commit()
    db.refresh(job)
    return job


@router.post("/{job_id}/payment")
def record_payment(
    job_id: str,
    body: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if body.amount <= 0 or body.amount > float(job.balance_due or 0):
        raise HTTPException(status_code=400, detail="Invalid payment amount")

    now = datetime.now()
    today = now.strftime("%Y-%m-%d")

    # Update job financials
    job.deposit = round(float(job.deposit or 0) + body.amount, 2)
    job.balance_due = round(float(job.balance_due or 0) - body.amount, 2)

    # Derive payment_status
    if job.balance_due <= 0:
        job.payment_status = "paid"
        job.balance_due = 0
        if not job.payment_date:
            job.payment_date = today
    else:
        job.payment_status = "partial"

    # Write ledger entry
    ledger = JobPayment(
        job_id=job_id,
        amount=body.amount,
        method=body.method,
        reference=body.reference,
        received_date=body.received_date or today,
        received_by=current_user.full_name or current_user.username,
        notes=body.notes,
    )
    db.add(ledger)

    # Audit comment
    comment_parts = [f"Payment of ${body.amount:.2f} received via {body.method}"]
    if body.reference:
        comment_parts.append(f"Ref: {body.reference}")
    comment = JobComment(
        job_id=job_id,
        date=now.strftime("%d/%m/%Y"),
        time=now.strftime("%H:%M"),
        initials=_get_initials(current_user),
        author_name=current_user.full_name or current_user.username,
        status=job.status,
        is_internal=True,
        comment=" — ".join(comment_parts),
    )
    db.add(comment)

    # Recalculate live AR balance on customer
    _recalculate_customer_balance(job.customer_id, db)

    db.commit()
    db.refresh(job)
    return job


@router.delete("/{job_id}")
def delete_job(
    job_id: str, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()
    return {"ok": True}


@router.post("/{job_id}/dispatch")
def dispatch_job(
    job_id: str,
    body: DispatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Record dispatch details as an internal comment; optionally advance from FINISH → INVOICE."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    comment_text = f"Dispatched — Ship Via: {body.ship_via}, Ref: {body.ship_ref}, Cartons: {body.cartons}"
    if body.notes:
        comment_text += f". {body.notes}"
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    if not job.dispatched_at:
        job.dispatched_at = today
    comment = JobComment(
        job_id=job_id,
        date=now.strftime("%d/%m/%Y"),
        time=now.strftime("%H:%M"),
        initials=_get_initials(current_user),
        author_name=current_user.full_name or current_user.username,
        status=job.status,
        is_internal=True,
        comment=comment_text,
    )
    db.add(comment)
    if body.advance_status and job.status == "FINISH":
        job.status = "INVOICE"
        if not job.invoice_date:
            job.invoice_date = today
        _deplete_on_hand(job, db)
    db.commit()
    db.refresh(job)
    return job


@router.post("/{job_id}/pick")
def pick_job_items(
    job_id: str,
    body: PickRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Record per-line picked quantities (Jim2 Qty Pick).

    A line picked to its supply qty gets item_status 'Picked'; partly picked
    'Partial'. Returns all_picked so the UI can offer to advance the job.
    """
    job = db.query(Job).options(joinedload(Job.items)).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    def target(i: JobItem) -> int:
        return i.supply_qty or i.qty or i.order_qty or 0

    item_map = {i.id: i for i in job.items}
    updated = 0
    for p in body.picks:
        item = item_map.get(p.item_id)
        if not item:
            continue
        item.qty_pick = p.qty_pick
        t = target(item)
        if t > 0 and p.qty_pick >= t:
            item.item_status = "Picked"
        elif p.qty_pick > 0:
            item.item_status = "Partial"
        else:
            item.item_status = ""
        updated += 1

    products = [i for i in job.items if (i.display_type or "product") == "product"]
    all_picked = bool(products) and all(
        target(i) > 0 and (i.qty_pick or 0) >= target(i) for i in products
    )

    now = datetime.now()
    db.add(
        JobComment(
            job_id=job_id,
            date=now.strftime("%d/%m/%Y"),
            time=now.strftime("%H:%M"),
            initials=_get_initials(current_user),
            author_name=current_user.full_name or current_user.username,
            status=job.status,
            is_internal=True,
            comment=f"Pick/Pack: {updated} line(s) updated"
            + (" — all lines picked" if all_picked else ""),
        )
    )
    db.commit()
    return {"all_picked": all_picked, "job": _job_with_relations(db, job_id)}


@router.post("/{job_id}/unprint")
def unprint_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Revert an INVOICE or PAID job back to FINISH (unprint / recall invoice)."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in ("INVOICE", "PAID"):
        raise HTTPException(
            status_code=400, detail="Can only unprint INVOICE or PAID jobs"
        )
    prev_status = job.status
    job.status = "FINISH"
    # Recalling the invoice puts the shipped stock back on hand
    _restore_on_hand(job, db)
    now = datetime.now()
    comment = JobComment(
        job_id=job_id,
        date=now.strftime("%d/%m/%Y"),
        time=now.strftime("%H:%M"),
        initials=_get_initials(current_user),
        author_name=current_user.full_name or current_user.username,
        status="FINISH",
        is_internal=True,
        comment=f"Unprinted — status reverted from {prev_status} to FINISH",
    )
    db.add(comment)
    db.commit()
    db.refresh(job)
    return job

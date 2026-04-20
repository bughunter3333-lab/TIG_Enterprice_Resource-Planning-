from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.database import get_db
from app.models.job import Job, JobItem, JobComment
from app.core.dependencies import require_any, require_staff, get_current_user
from app.models.user import User

router = APIRouter(prefix="/jobs", tags=["jobs"])

VALID_STATUSES = {"QUOTE", "ORDER", "PROOF", "PRINT", "FINISH", "INVOICE", "PAID", "CANCEL"}


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class JobItemSchema(BaseModel):
    description: Optional[str] = None
    sizes: Optional[str] = None
    stock_code: Optional[str] = None
    order_qty: int = 0
    supply_qty: int = 0
    qty: int = 0
    price_ex: float = 0
    price_inc: float = 0
    total: float = 0


class JobCreate(BaseModel):
    id: str
    customer_id: str
    customer_name: Optional[str] = None
    status: str = "QUOTE"
    invoice: Optional[str] = None
    date_in: Optional[str] = None
    due: Optional[str] = None
    quote: Optional[str] = None
    priority: str = "Normal"
    type: str = "Normal"
    assigned_to: Optional[str] = None
    total_ex: float = 0
    total_inc: float = 0
    deposit: float = 0
    balance_due: float = 0
    notes: Optional[str] = None
    items: List[JobItemSchema] = []


class JobUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    due: Optional[str] = None
    notes: Optional[str] = None
    deposit: Optional[float] = None
    balance_due: Optional[float] = None


class StatusUpdate(BaseModel):
    status: str


class CommentCreate(BaseModel):
    comment: str


class PaymentCreate(BaseModel):
    amount: float
    method: str = "Credit Card"


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/")
def list_jobs(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
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
            Job.id.ilike(term) |
            Job.customer_name.ilike(term) |
            Job.invoice.ilike(term)
        )
    return q.order_by(Job.created_at.desc()).all()


@router.get("/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db), _: User = Depends(require_any)):
    job = db.query(Job).options(joinedload(Job.items), joinedload(Job.comments)).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/")
def create_job(body: JobCreate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    if db.query(Job).filter(Job.id == body.id).first():
        raise HTTPException(status_code=409, detail="Job ID already exists")
    job = Job(**body.model_dump(exclude={"items"}))
    for item_data in body.items:
        job.items.append(JobItem(**item_data.model_dump()))
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.patch("/{job_id}")
def update_job(job_id: str, body: JobUpdate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(job, field, value)
    db.commit()
    db.refresh(job)
    return job


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

    # Overseas staff can only update status (limited write)
    job.status = body.status
    now = datetime.now()
    comment = JobComment(
        job_id=job_id,
        date=now.strftime("%d/%m/%Y"),
        time=now.strftime("%H:%M"),
        initials=current_user.full_name[:3].upper(),
        status=body.status,
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
        initials=current_user.full_name[:3].upper(),
        status=job.status,
        comment=body.comment,
    )
    db.add(comment)
    db.commit()
    return {"ok": True}


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
    if body.amount <= 0 or body.amount > float(job.balance_due):
        raise HTTPException(status_code=400, detail="Invalid payment amount")
    job.deposit = float(job.deposit) + body.amount
    job.balance_due = float(job.balance_due) - body.amount
    now = datetime.now()
    comment = JobComment(
        job_id=job_id,
        date=now.strftime("%d/%m/%Y"),
        time=now.strftime("%H:%M"),
        initials=current_user.full_name[:3].upper(),
        status=job.status,
        comment=f"Payment of ${body.amount:.2f} received via {body.method}",
    )
    db.add(comment)
    db.commit()
    db.refresh(job)
    return job


@router.delete("/{job_id}")
def delete_job(job_id: str, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()
    return {"ok": True}

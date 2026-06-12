from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date

from app.database import get_db
from app.models.customer import Customer
from app.core.dependencies import require_any, require_staff
from app.core.abn import validate_abn, clean_abn
from app.models.user import User

router = APIRouter(prefix="/customers", tags=["customers"])


def _validate_abn(abn: Optional[str]) -> Optional[str]:
    if not abn:
        return abn
    if not validate_abn(abn):
        raise HTTPException(
            status_code=422, detail="Invalid ABN: must pass ATO checksum"
        )
    return clean_abn(abn)


class CustomerCreate(BaseModel):
    id: str
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    address: Optional[str] = None
    abn: Optional[str] = None
    account_type: str = "Account"
    payment_terms: Optional[str] = "Net 30"
    credit_limit: float = 0
    account_manager: Optional[str] = None
    customer_group: str = "General"
    territory: Optional[str] = None
    status: str = "Active"


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    address: Optional[str] = None
    abn: Optional[str] = None
    account_type: Optional[str] = None
    payment_terms: Optional[str] = None
    credit_limit: Optional[float] = None
    account_manager: Optional[str] = None
    customer_group: Optional[str] = None
    territory: Optional[str] = None
    status: Optional[str] = None


@router.get("/")
def list_customers(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    try:
        q = db.query(Customer)
        if search:
            term = f"%{search}%"
            q = q.filter(
                Customer.name.ilike(term)
                | Customer.id.ilike(term)
                | Customer.email.ilike(term)
            )
        if status and status != "all":
            q = q.filter(Customer.status == status)
        return q.order_by(Customer.name).offset(offset).limit(limit).all()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to retrieve customers")


@router.get("/{customer_id}")
def get_customer(
    customer_id: str, db: Session = Depends(get_db), _: User = Depends(require_any)
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.post("/")
def create_customer(
    body: CustomerCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    if db.query(Customer).filter(Customer.id == body.id).first():
        raise HTTPException(status_code=409, detail="Customer ID already exists")
    data = body.model_dump()
    data["abn"] = _validate_abn(data.get("abn"))
    customer = Customer(**data)
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.patch("/{customer_id}")
def update_customer(
    customer_id: str,
    body: CustomerUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    data = body.model_dump(exclude_none=True)
    if "abn" in data:
        data["abn"] = _validate_abn(data["abn"])
    for field, value in data.items():
        setattr(customer, field, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{customer_id}")
def delete_customer(
    customer_id: str, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    from app.models.job import Job

    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    active_jobs = (
        db.query(Job)
        .filter(
            Job.customer_id == customer_id,
            ~Job.status.in_(["PAID", "CANCEL"]),
        )
        .count()
    )
    if active_jobs:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete customer with {active_jobs} active job(s). Close or cancel them first.",
        )
    db.delete(customer)
    db.commit()
    return {"ok": True}


@router.get("/{customer_id}/statement")
def customer_statement(
    customer_id: str,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """AR statement for a customer — outstanding invoices and payment history."""
    from app.models.job import Job
    from app.models.job_payment import JobPayment

    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    as_at = date_to or date.today().isoformat()
    q = db.query(Job).filter(
        Job.customer_id == customer_id,
        Job.status.in_(["INVOICE", "PAID", "FINISH"]),
    )
    if date_from:
        q = q.filter(Job.invoice_date >= date_from)
    if date_to:
        q = q.filter(Job.invoice_date <= date_to)
    jobs = q.order_by(Job.invoice_date).all()

    lines = []
    running_balance = 0.0
    for j in jobs:
        total_inc = float(j.total_inc or 0)
        payments = db.query(JobPayment).filter(JobPayment.job_id == j.id).all()
        total_paid = sum(float(p.amount) for p in payments)
        balance = round(total_inc - total_paid, 2)
        running_balance += balance
        lines.append(
            {
                "job_id": j.id,
                "invoice_no": j.invoice or "",
                "invoice_date": j.invoice_date or j.date_in or "",
                "description": j.description or "",
                "total_inc": round(total_inc, 2),
                "paid": round(total_paid, 2),
                "balance": balance,
                "payment_status": j.payment_status or "unpaid",
            }
        )

    return {
        "customer_id": customer_id,
        "customer_name": customer.name,
        "abn": customer.abn or "",
        "as_at": as_at,
        "lines": lines,
        "totals": {
            "invoiced": round(sum(ln["total_inc"] for ln in lines), 2),
            "paid": round(sum(ln["paid"] for ln in lines), 2),
            "outstanding": round(running_balance, 2),
        },
    }

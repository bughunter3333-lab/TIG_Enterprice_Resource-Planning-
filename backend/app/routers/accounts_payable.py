from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date

from app.database import get_db
from app.models.supplier_bill import SupplierBill
from app.core.dependencies import require_any, require_staff
from app.models.user import User

router = APIRouter(prefix="/ap", tags=["accounts_payable"])

VALID_STATUSES = {"pending", "approved", "paid"}


class BillCreate(BaseModel):
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    po_id: Optional[str] = None
    bill_number: Optional[str] = None
    bill_date: Optional[str] = None
    due_date: Optional[str] = None
    description: Optional[str] = None
    amount_ex: float = 0
    tax: float = 0
    amount_inc: float = 0
    status: str = "pending"
    notes: Optional[str] = None


class BillUpdate(BaseModel):
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    po_id: Optional[str] = None
    bill_number: Optional[str] = None
    bill_date: Optional[str] = None
    due_date: Optional[str] = None
    description: Optional[str] = None
    amount_ex: Optional[float] = None
    tax: Optional[float] = None
    amount_inc: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class BillPay(BaseModel):
    paid_amount: float
    paid_date: Optional[str] = None


def _serialize(b: SupplierBill) -> dict:
    return {
        "id": b.id,
        "supplier_id": b.supplier_id,
        "supplier_name": b.supplier_name,
        "po_id": b.po_id,
        "bill_number": b.bill_number,
        "bill_date": b.bill_date,
        "due_date": b.due_date,
        "description": b.description,
        "amount_ex": float(b.amount_ex or 0),
        "tax": float(b.tax or 0),
        "amount_inc": float(b.amount_inc or 0),
        "status": b.status,
        "paid_date": b.paid_date,
        "paid_amount": float(b.paid_amount or 0),
        "notes": b.notes,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


@router.get("/bills")
def list_bills(
    status: Optional[str] = Query(None),
    supplier_id: Optional[str] = Query(None),
    overdue_only: bool = Query(False),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    q = db.query(SupplierBill)
    if status:
        q = q.filter(SupplierBill.status == status)
    if supplier_id:
        q = q.filter(SupplierBill.supplier_id == supplier_id)
    if overdue_only:
        today = date.today().isoformat()
        q = q.filter(
            SupplierBill.due_date < today,
            SupplierBill.status.in_(["pending", "approved"]),
        )
    bills = (
        q.order_by(SupplierBill.due_date.asc().nullslast())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_serialize(b) for b in bills]


@router.post("/bills", status_code=201)
def create_bill(
    data: BillCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    if data.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status. Use: {sorted(VALID_STATUSES)}")
    bill = SupplierBill(
        supplier_id=data.supplier_id,
        supplier_name=data.supplier_name,
        po_id=data.po_id,
        bill_number=data.bill_number,
        bill_date=data.bill_date,
        due_date=data.due_date,
        description=data.description,
        amount_ex=data.amount_ex,
        tax=data.tax,
        amount_inc=data.amount_inc,
        status=data.status,
        notes=data.notes,
        paid_amount=0,
    )
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return _serialize(bill)


@router.get("/bills/{bill_id}")
def get_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    bill = db.query(SupplierBill).filter(SupplierBill.id == bill_id).first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    return _serialize(bill)


@router.patch("/bills/{bill_id}")
def update_bill(
    bill_id: int,
    data: BillUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    bill = db.query(SupplierBill).filter(SupplierBill.id == bill_id).first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    if data.status is not None and data.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status. Use: {sorted(VALID_STATUSES)}")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(bill, field, value)
    db.commit()
    db.refresh(bill)
    return _serialize(bill)


@router.post("/bills/{bill_id}/pay")
def pay_bill(
    bill_id: int,
    data: BillPay,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    bill = db.query(SupplierBill).filter(SupplierBill.id == bill_id).first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    bill.paid_amount = data.paid_amount
    bill.paid_date = data.paid_date or date.today().isoformat()
    bill.status = "paid"
    db.commit()
    db.refresh(bill)
    return _serialize(bill)


@router.delete("/bills/{bill_id}", status_code=204)
def delete_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    bill = db.query(SupplierBill).filter(SupplierBill.id == bill_id).first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    db.delete(bill)
    db.commit()


@router.get("/summary")
def ap_summary(
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    today = date.today().isoformat()
    all_open = (
        db.query(SupplierBill)
        .filter(SupplierBill.status.in_(["pending", "approved"]))
        .all()
    )
    overdue = [b for b in all_open if b.due_date and b.due_date < today]
    due_this_week = [
        b for b in all_open if b.due_date and today <= b.due_date <= _week_end(today)
    ]
    return {
        "total_open_count": len(all_open),
        "total_open_amount": round(sum(float(b.amount_inc or 0) for b in all_open), 2),
        "overdue_count": len(overdue),
        "overdue_amount": round(sum(float(b.amount_inc or 0) for b in overdue), 2),
        "due_this_week_count": len(due_this_week),
        "due_this_week_amount": round(
            sum(float(b.amount_inc or 0) for b in due_this_week), 2
        ),
    }


def _week_end(today_iso: str) -> str:
    from datetime import timedelta

    d = date.fromisoformat(today_iso)
    days_until_sunday = 6 - d.weekday()
    return (d + timedelta(days=days_until_sunday)).isoformat()

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional, List

from app.database import get_db
from app.models.customer import Customer
from app.core.dependencies import require_any, require_staff
from app.models.user import User

router = APIRouter(prefix="/customers", tags=["customers"])


class CustomerCreate(BaseModel):
    id: str
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    account_type: str = "Account"
    credit_limit: float = 0
    status: str = "Active"


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    account_type: Optional[str] = None
    credit_limit: Optional[float] = None
    status: Optional[str] = None


@router.get("/")
def list_customers(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    q = db.query(Customer)
    if search:
        term = f"%{search}%"
        q = q.filter(Customer.name.ilike(term) | Customer.id.ilike(term) | Customer.email.ilike(term))
    if status and status != "all":
        q = q.filter(Customer.status == status)
    return q.order_by(Customer.name).all()


@router.get("/{customer_id}")
def get_customer(customer_id: str, db: Session = Depends(get_db), _: User = Depends(require_any)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.post("/")
def create_customer(body: CustomerCreate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    if db.query(Customer).filter(Customer.id == body.id).first():
        raise HTTPException(status_code=409, detail="Customer ID already exists")
    customer = Customer(**body.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.patch("/{customer_id}")
def update_customer(customer_id: str, body: CustomerUpdate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(customer, field, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{customer_id}")
def delete_customer(customer_id: str, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(customer)
    db.commit()
    return {"ok": True}

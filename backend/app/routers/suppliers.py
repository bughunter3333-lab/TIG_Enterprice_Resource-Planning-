from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.supplier import Supplier
from app.core.dependencies import require_any, require_staff
from app.models.user import User

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


class SupplierCreate(BaseModel):
    id: str
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    payment_terms: Optional[str] = None
    currency: str = "AUD"
    status: str = "Active"


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    payment_terms: Optional[str] = None
    currency: Optional[str] = None
    status: Optional[str] = None


@router.get("/")
def list_suppliers(
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    q = db.query(Supplier)
    if search:
        term = f"%{search}%"
        q = q.filter(Supplier.name.ilike(term) | Supplier.id.ilike(term))
    return q.order_by(Supplier.name).all()


@router.get("/{supplier_id}")
def get_supplier(supplier_id: str, db: Session = Depends(get_db), _: User = Depends(require_any)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return s


@router.post("/")
def create_supplier(body: SupplierCreate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    if db.query(Supplier).filter(Supplier.id == body.id).first():
        raise HTTPException(status_code=409, detail="Supplier ID already exists")
    s = Supplier(**body.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.patch("/{supplier_id}")
def update_supplier(supplier_id: str, body: SupplierUpdate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: str, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    db.delete(s)
    db.commit()
    return {"ok": True}

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional

from app.database import get_db
from app.models.supplier import Supplier
from app.core.dependencies import require_any, require_staff
from app.core.abn import validate_abn, clean_abn
from app.models.user import User

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


def _validate_abn(abn: Optional[str]) -> Optional[str]:
    if not abn:
        return abn
    if not validate_abn(abn):
        raise HTTPException(
            status_code=422, detail="Invalid ABN: must pass ATO checksum"
        )
    return clean_abn(abn)


class SupplierCreate(BaseModel):
    id: str = Field(..., max_length=50)
    name: str = Field(..., max_length=200)
    contact: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = Field(None, max_length=500)
    abn: Optional[str] = Field(None, max_length=20)
    payment_terms: Optional[str] = Field(None, max_length=100)
    currency: str = Field("AUD", max_length=10)
    status: str = Field("Active", max_length=20)


class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    contact: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = Field(None, max_length=500)
    abn: Optional[str] = Field(None, max_length=20)
    payment_terms: Optional[str] = Field(None, max_length=100)
    currency: Optional[str] = Field(None, max_length=10)
    status: Optional[str] = Field(None, max_length=20)


@router.get("/")
def list_suppliers(
    search: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    try:
        q = db.query(Supplier)
        if search:
            term = f"%{search}%"
            q = q.filter(Supplier.name.ilike(term) | Supplier.id.ilike(term))
        return q.order_by(Supplier.name).offset(offset).limit(limit).all()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to retrieve suppliers")


@router.get("/{supplier_id}")
def get_supplier(
    supplier_id: str, db: Session = Depends(get_db), _: User = Depends(require_any)
):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return s


@router.post("/")
def create_supplier(
    body: SupplierCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    if db.query(Supplier).filter(Supplier.id == body.id).first():
        raise HTTPException(status_code=409, detail="Supplier ID already exists")
    data = body.model_dump()
    data["abn"] = _validate_abn(data.get("abn"))
    s = Supplier(**data)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.patch("/{supplier_id}")
def update_supplier(
    supplier_id: str,
    body: SupplierUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    data = body.model_dump(exclude_none=True)
    if "abn" in data:
        data["abn"] = _validate_abn(data["abn"])
    for field, value in data.items():
        setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{supplier_id}")
def delete_supplier(
    supplier_id: str, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    db.delete(s)
    db.commit()
    return {"ok": True}

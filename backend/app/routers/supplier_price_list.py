from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_role
from app.models.supplier import Supplier
from app.models.supplier_price_list import SupplierPriceList

router = APIRouter(prefix="/suppliers", tags=["supplier-price-list"])


class PriceListItemIn(BaseModel):
    sku: str
    description: Optional[str] = None
    unit_cost: float
    min_qty: int = 1
    currency: str = "AUD"
    lead_time_days: Optional[int] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    notes: Optional[str] = None


class PriceListItemPatch(BaseModel):
    description: Optional[str] = None
    unit_cost: Optional[float] = None
    min_qty: Optional[int] = None
    currency: Optional[str] = None
    lead_time_days: Optional[int] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    notes: Optional[str] = None


def _row(p: SupplierPriceList) -> dict:
    return {
        "id": p.id,
        "supplier_id": p.supplier_id,
        "sku": p.sku,
        "description": p.description,
        "unit_cost": float(p.unit_cost),
        "min_qty": p.min_qty or 1,
        "currency": p.currency or "AUD",
        "lead_time_days": p.lead_time_days,
        "valid_from": p.valid_from,
        "valid_to": p.valid_to,
        "notes": p.notes,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("/{supplier_id}/price-list")
def list_price_list(
    supplier_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_role("admin", "staff")),
):
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return [_row(p) for p in supplier.price_list]


@router.post("/{supplier_id}/price-list", status_code=201)
def create_price_list_item(
    supplier_id: str,
    body: PriceListItemIn,
    db: Session = Depends(get_db),
    _=Depends(require_role("admin", "staff")),
):
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    item = SupplierPriceList(supplier_id=supplier_id, **body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return _row(item)


@router.patch("/{supplier_id}/price-list/{item_id}")
def update_price_list_item(
    supplier_id: str,
    item_id: int,
    body: PriceListItemPatch,
    db: Session = Depends(get_db),
    _=Depends(require_role("admin", "staff")),
):
    item = (
        db.query(SupplierPriceList)
        .filter_by(id=item_id, supplier_id=supplier_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Price list item not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return _row(item)


@router.delete("/{supplier_id}/price-list/{item_id}", status_code=204)
def delete_price_list_item(
    supplier_id: str,
    item_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    item = (
        db.query(SupplierPriceList)
        .filter_by(id=item_id, supplier_id=supplier_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Price list item not found")
    db.delete(item)
    db.commit()

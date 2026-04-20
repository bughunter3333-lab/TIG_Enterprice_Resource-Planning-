from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.database import get_db
from app.models.inventory import InventoryItem, StockMovement
from app.core.dependencies import require_any, require_staff
from app.models.user import User

router = APIRouter(prefix="/inventory", tags=["inventory"])


class InventoryCreate(BaseModel):
    sku: str
    name: str
    category: Optional[str] = None
    supplier: Optional[str] = None
    stock: int = 0
    min_stock: int = 0
    unit_cost: float = 0
    sell_price: float = 0
    location: Optional[str] = None
    status: str = "Active"


class InventoryUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    supplier: Optional[str] = None
    min_stock: Optional[int] = None
    unit_cost: Optional[float] = None
    sell_price: Optional[float] = None
    location: Optional[str] = None
    status: Optional[str] = None


class StockAdjust(BaseModel):
    adjustment: int
    reason: str


@router.get("/")
def list_inventory(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    low_stock: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    q = db.query(InventoryItem)
    if search:
        term = f"%{search}%"
        q = q.filter(InventoryItem.sku.ilike(term) | InventoryItem.name.ilike(term))
    if category:
        q = q.filter(InventoryItem.category == category)
    if low_stock:
        q = q.filter(InventoryItem.stock <= InventoryItem.min_stock)
    return q.order_by(InventoryItem.name).all()


@router.get("/{sku}")
def get_item(sku: str, db: Session = Depends(get_db), _: User = Depends(require_any)):
    item = db.query(InventoryItem).options(joinedload(InventoryItem.movements)).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.post("/")
def create_item(body: InventoryCreate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    if db.query(InventoryItem).filter(InventoryItem.sku == body.sku).first():
        raise HTTPException(status_code=409, detail="SKU already exists")
    item = InventoryItem(**body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{sku}")
def update_item(sku: str, body: InventoryUpdate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{sku}/adjust")
def adjust_stock(sku: str, body: StockAdjust, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    new_stock = item.stock + body.adjustment
    if new_stock < 0:
        raise HTTPException(status_code=400, detail="Adjustment would result in negative stock")
    item.stock = new_stock
    movement = StockMovement(
        sku=sku,
        date=datetime.now().strftime("%d/%m/%Y"),
        type="Adjustment",
        quantity=body.adjustment,
        notes=body.reason,
    )
    db.add(movement)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{sku}")
def delete_item(sku: str, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"ok": True}

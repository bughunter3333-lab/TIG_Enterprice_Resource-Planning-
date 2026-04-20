from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional, List

from app.database import get_db
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.inventory import InventoryItem, StockMovement
from app.core.dependencies import require_any, require_staff
from app.models.user import User
from datetime import datetime

router = APIRouter(prefix="/purchase-orders", tags=["purchase_orders"])

VALID_STATUSES = {"Draft", "Sent", "Partial", "Received", "Cancelled"}


class POItemSchema(BaseModel):
    sku: Optional[str] = None
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


class ReceiveItems(BaseModel):
    items: List[dict]  # [{id: int, qty_received: int}]


@router.get("/")
def list_pos(
    status: Optional[str] = Query(None),
    supplier_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    q = db.query(PurchaseOrder).options(joinedload(PurchaseOrder.items))
    if status:
        q = q.filter(PurchaseOrder.status == status)
    if supplier_id:
        q = q.filter(PurchaseOrder.supplier_id == supplier_id)
    return q.order_by(PurchaseOrder.created_at.desc()).all()


@router.get("/{po_id}")
def get_po(po_id: str, db: Session = Depends(get_db), _: User = Depends(require_any)):
    po = db.query(PurchaseOrder).options(joinedload(PurchaseOrder.items)).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return po


@router.post("/")
def create_po(body: POCreate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    if db.query(PurchaseOrder).filter(PurchaseOrder.id == body.id).first():
        raise HTTPException(status_code=409, detail="PO ID already exists")
    po = PurchaseOrder(**body.model_dump(exclude={"items"}))
    po.total = sum(i.total for i in body.items)
    for item_data in body.items:
        po.items.append(PurchaseOrderItem(**item_data.model_dump()))
    db.add(po)
    db.commit()
    db.refresh(po)
    return po


@router.patch("/{po_id}")
def update_po(po_id: str, body: POUpdate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
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
def receive_items(po_id: str, body: ReceiveItems, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    """Mark items as received and update inventory stock levels."""
    po = db.query(PurchaseOrder).options(joinedload(PurchaseOrder.items)).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    receive_map = {r["id"]: r["qty_received"] for r in body.items}
    all_received = True

    for item in po.items:
        if item.id in receive_map:
            qty = receive_map[item.id]
            item.qty_received = min(item.qty_ordered, item.qty_received + qty)
            # Update inventory
            inv = db.query(InventoryItem).filter(InventoryItem.sku == item.sku).first()
            if inv:
                inv.stock += qty
                movement = StockMovement(
                    sku=item.sku,
                    date=datetime.now().strftime("%d/%m/%Y"),
                    type="Purchase Receipt",
                    quantity=qty,
                    reference=po_id,
                    notes=f"Received from PO {po_id}",
                )
                db.add(movement)
        if item.qty_received < item.qty_ordered:
            all_received = False

    po.status = "Received" if all_received else "Partial"
    db.commit()
    db.refresh(po)
    return po


@router.delete("/{po_id}")
def delete_po(po_id: str, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    db.delete(po)
    db.commit()
    return {"ok": True}

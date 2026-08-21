from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, Field
from typing import Optional, List

from app.database import get_db
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.inventory import InventoryItem, StockMovement
from app.models.job import JobItem
from app.core.dependencies import require_any, require_staff
from app.core.stock_location import DEFAULT_BRANCH, adjust_location
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


class ReceiveItem(BaseModel):
    id: int
    qty_received: int = Field(..., gt=0)


class ReceiveItems(BaseModel):
    items: List[ReceiveItem]


class RequirementItem(BaseModel):
    item_id: int
    qty: int = Field(..., gt=0)


class POFromRequirements(BaseModel):
    id: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    expected_date: Optional[str] = None
    notes: Optional[str] = None
    requirements: List[RequirementItem]


@router.get("")
def list_pos(
    status: Optional[str] = Query(None),
    supplier_id: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    q = db.query(PurchaseOrder).options(joinedload(PurchaseOrder.items))
    if status:
        q = q.filter(PurchaseOrder.status == status)
    if supplier_id:
        q = q.filter(PurchaseOrder.supplier_id == supplier_id)
    return q.order_by(PurchaseOrder.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/next-id")
def next_po_id(db: Session = Depends(get_db), _: User = Depends(require_any)):
    """Return the next available PO ID in PO-NNNN format."""
    from sqlalchemy import func as sqlfunc

    last = db.query(PurchaseOrder.id).order_by(PurchaseOrder.created_at.desc()).first()
    if last:
        try:
            num = int(last[0].split("-")[-1]) + 1
        except (ValueError, IndexError):
            num = db.query(sqlfunc.count(PurchaseOrder.id)).scalar() + 1
    else:
        num = 1
    return {"id": f"PO-{num:04d}"}


@router.get("/{po_id}")
def get_po(po_id: str, db: Session = Depends(get_db), _: User = Depends(require_any)):
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items))
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return po


@router.post("")
def create_po(
    body: POCreate, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    if db.query(PurchaseOrder).filter(PurchaseOrder.id == body.id).first():
        raise HTTPException(status_code=409, detail="PO ID already exists")
    po = PurchaseOrder(**body.model_dump(exclude={"items"}))
    total_ex = round(sum(i.total for i in body.items), 2)
    tax_total = round(total_ex * 0.10, 2)
    total_inc = round(total_ex + tax_total, 2)
    po.total_ex = total_ex
    po.tax_total = tax_total
    po.total_inc = total_inc
    po.total = total_inc  # keep backward-compat field in sync
    for item_data in body.items:
        po.items.append(PurchaseOrderItem(**item_data.model_dump()))
    db.add(po)
    db.commit()
    db.refresh(po)
    return po


@router.post("/from-requirements")
def create_po_from_requirements(
    body: POFromRequirements,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Create a PO from order requirements and back-fill po_no / po_due on the linked job items."""
    if db.query(PurchaseOrder).filter(PurchaseOrder.id == body.id).first():
        raise HTTPException(status_code=409, detail="PO ID already exists")

    item_ids = [r.item_id for r in body.requirements]
    job_items = db.query(JobItem).filter(JobItem.id.in_(item_ids)).all()
    item_map = {ji.id: ji for ji in job_items}

    # Group by SKU to build PO line items
    sku_groups: dict = {}
    for req in body.requirements:
        ji = item_map.get(req.item_id)
        if not ji:
            continue
        key = ji.stock_code or ji.description or "ITEM"
        if key not in sku_groups:
            inv = db.query(InventoryItem).filter(InventoryItem.sku == key).first()
            sku_groups[key] = {
                "sku": key,
                "description": ji.description or key,
                "qty_ordered": 0,
                "unit_cost": (
                    float(inv.unit_cost) if inv else float(ji.purchase_price or 0)
                ),
                "total": 0,
            }
        sku_groups[key]["qty_ordered"] += req.qty

    for grp in sku_groups.values():
        grp["total"] = grp["qty_ordered"] * grp["unit_cost"]

    po = PurchaseOrder(
        id=body.id,
        supplier_id=body.supplier_id,
        supplier_name=body.supplier_name,
        status="Draft",
        order_date=datetime.now().strftime("%d/%m/%Y"),
        expected_date=body.expected_date,
        notes=body.notes,
        total=sum(g["total"] for g in sku_groups.values()),
    )
    for grp in sku_groups.values():
        po.items.append(PurchaseOrderItem(**grp))
    db.add(po)

    for req in body.requirements:
        ji = item_map.get(req.item_id)
        if ji:
            ji.po_no = body.id
            ji.po_due = body.expected_date

    db.commit()
    db.refresh(po)
    return po


class BackOrderItem(BaseModel):
    sku: str
    description: Optional[str] = None
    qty: int
    unit_cost: float = 0
    job_ids: List[str] = []


class POFromBackOrders(BaseModel):
    id: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    expected_date: Optional[str] = None
    notes: Optional[str] = None
    items: List[BackOrderItem]


@router.post("/from-back-orders")
def create_po_from_back_orders(
    body: POFromBackOrders,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Create a PO from selected back-order rows and link back to job items via po_no."""
    if db.query(PurchaseOrder).filter(PurchaseOrder.id == body.id).first():
        raise HTTPException(status_code=409, detail="PO ID already exists")

    po = PurchaseOrder(
        id=body.id,
        supplier_id=body.supplier_id,
        supplier_name=body.supplier_name,
        status="Draft",
        order_date=datetime.now().strftime("%Y-%m-%d"),
        expected_date=body.expected_date,
        notes=body.notes,
        total=sum(i.qty * i.unit_cost for i in body.items),
    )
    for item in body.items:
        po.items.append(
            PurchaseOrderItem(
                sku=item.sku,
                description=item.description or item.sku,
                qty_ordered=item.qty,
                qty_received=0,
                unit_cost=item.unit_cost,
                total=round(item.qty * item.unit_cost, 2),
            )
        )
    db.add(po)
    db.flush()

    # Link job items: set po_no on matching back-ordered job items
    for item in body.items:
        if item.job_ids:
            matching = (
                db.query(JobItem)
                .filter(
                    JobItem.job_id.in_(item.job_ids),
                    JobItem.stock_code == item.sku,
                    JobItem.b_ord > 0,
                )
                .all()
            )
            for ji in matching:
                ji.po_no = body.id
                if body.expected_date:
                    ji.po_due = body.expected_date

    db.commit()
    db.refresh(po)
    return po


@router.patch("/{po_id}")
def update_po(
    po_id: str,
    body: POUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
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
def receive_items(
    po_id: str,
    body: ReceiveItems,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Mark items as received and update inventory stock levels."""
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items))
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    receive_map = {r.id: r.qty_received for r in body.items}
    all_received = True

    for item in po.items:
        if item.id in receive_map:
            # The received count is clamped to what was ordered, so stock has to
            # move by the clamped delta, not by the requested quantity — sending
            # 999 against an order of 10 used to record 10 received and add 999
            # to the shelf.
            previously = item.qty_received or 0
            item.qty_received = min(item.qty_ordered, previously + receive_map[item.id])
            qty = item.qty_received - previously
            inv = (
                db.query(InventoryItem).filter(InventoryItem.sku == item.sku).first()
                if qty > 0
                else None
            )
            if inv:
                inv.stock += qty
                # Goods land in a branch. Without this the item total rises while
                # every per-location position stays put, so the Locations tab
                # reports the difference as stock that has no home.
                adjust_location(db, item.sku, DEFAULT_BRANCH, on_hand=qty)
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
def delete_po(
    po_id: str, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    db.delete(po)
    db.commit()
    return {"ok": True}

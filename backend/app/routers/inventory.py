from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.database import get_db
from app.models.inventory import InventoryItem, StockMovement
from app.models.stock_location import StockLocation
from app.models.stock_pricing import StockPriceLevel, StockPriceBreakpoint
from app.models.job import Job, JobItem
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.supplier import Supplier
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
    reorder_qty: int = 0
    unit_cost: float = 0
    sell_price: float = 0
    location: Optional[str] = None
    status: str = "Active"


class InventoryUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    supplier: Optional[str] = None
    min_stock: Optional[int] = None
    reorder_qty: Optional[int] = None
    unit_cost: Optional[float] = None
    sell_price: Optional[float] = None
    location: Optional[str] = None
    status: Optional[str] = None
    # Jim2 detail fields
    item_type: Optional[str] = None
    gl_group: Optional[str] = None
    barcode: Optional[str] = None
    buy_unit: Optional[str] = None
    sell_unit: Optional[str] = None
    buy_tax_pct: Optional[float] = None
    sell_tax_pct: Optional[float] = None


class StockAdjust(BaseModel):
    adjustment: int
    reason: str


class TransferRequest(BaseModel):
    from_sku: str
    to_sku: Optional[str] = None
    quantity: int
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


class StocktakeItemIn(BaseModel):
    sku: str
    counted_qty: int
    notes: Optional[str] = None


class StocktakeRequest(BaseModel):
    reference: Optional[str] = None
    method: str = "Informed"
    items: List[StocktakeItemIn]


class LocationCreate(BaseModel):
    branch: str
    zone: Optional[str] = None
    qty_on_hand: int = 0
    committed_qty: int = 0
    backorder_qty: int = 0
    on_po_qty: int = 0
    primary_bin_1: Optional[str] = None
    max_qty_bin_1: Optional[int] = None
    primary_bin_2: Optional[str] = None
    max_qty_bin_2: Optional[int] = None


class LocationUpdate(BaseModel):
    zone: Optional[str] = None
    qty_on_hand: Optional[int] = None
    committed_qty: Optional[int] = None
    backorder_qty: Optional[int] = None
    on_po_qty: Optional[int] = None
    primary_bin_1: Optional[str] = None
    max_qty_bin_1: Optional[int] = None
    primary_bin_2: Optional[str] = None
    max_qty_bin_2: Optional[int] = None


class PriceBreakpointIn(BaseModel):
    min_qty: int = 0
    price_ex: float
    price_inc: float
    pont_pct: Optional[float] = None


class PriceLevelCreate(BaseModel):
    price_level: str
    price_calc_method: str = "Fixed Price"
    base_pl: Optional[str] = None
    currency: str = "AUD"
    tax_code: str = "G"
    breakpoints: List[PriceBreakpointIn] = []


class CostUpdate(BaseModel):
    last_cost: Optional[float] = None
    last_cog: Optional[float] = None
    avg_cost: Optional[float] = None
    avg_cog: Optional[float] = None
    max_cog: Optional[float] = None
    last_po_cogs: Optional[float] = None
    avg_po_cogs: Optional[float] = None
    last_ex: Optional[float] = None
    last_effective_date: Optional[str] = None
    price_template: Optional[str] = None


@router.get("/")
def list_inventory(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    low_stock: bool = Query(False),
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    try:
        q = db.query(InventoryItem)
        if search:
            term = f"%{search}%"
            q = q.filter(InventoryItem.sku.ilike(term) | InventoryItem.name.ilike(term))
        if category:
            q = q.filter(InventoryItem.category == category)
        if low_stock:
            q = q.filter(InventoryItem.stock <= InventoryItem.min_stock)
        return q.order_by(InventoryItem.name).offset(offset).limit(limit).all()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to retrieve inventory")


@router.get("/low-stock")
def low_stock_alert(
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Return all active SKUs where stock <= min_stock, sorted by urgency."""
    items = (
        db.query(InventoryItem)
        .filter(
            InventoryItem.min_stock > 0,
            InventoryItem.stock <= InventoryItem.min_stock,
            InventoryItem.status == "Active",
        )
        .order_by(InventoryItem.stock)
        .all()
    )

    rows = [
        {
            "sku": i.sku,
            "name": i.name,
            "category": i.category or "",
            "supplier": i.supplier or "",
            "stock": i.stock,
            "min_stock": i.min_stock,
            "reorder_qty": i.reorder_qty or 0,
            "shortfall": max(0, (i.min_stock or 0) - (i.stock or 0)),
            "unit_cost": float(i.unit_cost or 0),
            "reorder_value": float(i.unit_cost or 0)
            * max(0, (i.reorder_qty or i.min_stock or 0)),
        }
        for i in items
    ]
    total_value = round(sum(r["reorder_value"] for r in rows), 2)
    return {"count": len(rows), "reorder_value": total_value, "rows": rows}


@router.get("/movements")
def list_movements(
    sku: Optional[str] = Query(None),
    limit: int = Query(50),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    q = db.query(StockMovement)
    if sku:
        q = q.filter(StockMovement.sku == sku)
    return q.order_by(StockMovement.created_at.desc()).limit(limit).all()


@router.get("/stock-flow")
def stock_flow(
    sku: Optional[str] = Query(None),
    limit: int = Query(100),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Return stock items with their recent movement history for the Stock Flow view."""
    q = db.query(InventoryItem)
    if sku:
        q = q.filter(
            InventoryItem.sku.ilike(f"%{sku}%") | InventoryItem.name.ilike(f"%{sku}%")
        )
    items = q.order_by(InventoryItem.name).limit(limit).all()
    result = []
    for item in items:
        movements = (
            db.query(StockMovement)
            .filter(StockMovement.sku == item.sku)
            .order_by(StockMovement.created_at.desc())
            .limit(10)
            .all()
        )
        result.append(
            {
                "sku": item.sku,
                "name": item.name,
                "category": item.category,
                "stock": item.stock,
                "min_stock": item.min_stock,
                "location": item.location,
                "unit_cost": float(item.unit_cost or 0),
                "sell_price": float(item.sell_price or 0),
                "movements": [
                    {
                        "id": m.id,
                        "date": m.date,
                        "type": m.type,
                        "quantity": m.quantity,
                        "reference": m.reference,
                        "notes": m.notes,
                    }
                    for m in movements
                ],
            }
        )
    return result


@router.get("/{sku}")
def get_item(sku: str, db: Session = Depends(get_db), _: User = Depends(require_any)):
    item = (
        db.query(InventoryItem)
        .options(joinedload(InventoryItem.movements))
        .filter(InventoryItem.sku == sku)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.post("/")
def create_item(
    body: InventoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    if db.query(InventoryItem).filter(InventoryItem.sku == body.sku).first():
        raise HTTPException(status_code=409, detail="SKU already exists")
    item = InventoryItem(**body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{sku}")
def update_item(
    sku: str,
    body: InventoryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{sku}/adjust")
def adjust_stock(
    sku: str,
    body: StockAdjust,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    new_stock = item.stock + body.adjustment
    if new_stock < 0:
        raise HTTPException(
            status_code=400, detail="Adjustment would result in negative stock"
        )
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
def delete_item(
    sku: str, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.get("/{sku}/locations")
def get_locations(
    sku: str, db: Session = Depends(get_db), _: User = Depends(require_any)
):
    if not db.query(InventoryItem).filter(InventoryItem.sku == sku).first():
        raise HTTPException(status_code=404, detail="Item not found")
    locs = (
        db.query(StockLocation)
        .filter(StockLocation.sku == sku)
        .order_by(StockLocation.branch)
        .all()
    )
    return [
        {
            "id": loc.id,
            "sku": loc.sku,
            "branch": loc.branch,
            "zone": loc.zone,
            "qty_on_hand": loc.qty_on_hand,
            "committed_qty": loc.committed_qty,
            "available_qty": loc.available_qty,
            "backorder_qty": loc.backorder_qty,
            "on_po_qty": loc.on_po_qty,
            "primary_bin_1": loc.primary_bin_1,
            "max_qty_bin_1": loc.max_qty_bin_1,
            "primary_bin_2": loc.primary_bin_2,
            "max_qty_bin_2": loc.max_qty_bin_2,
        }
        for loc in locs
    ]


@router.post("/{sku}/locations")
def add_location(
    sku: str,
    body: LocationCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    if not db.query(InventoryItem).filter(InventoryItem.sku == sku).first():
        raise HTTPException(status_code=404, detail="Item not found")
    if (
        db.query(StockLocation)
        .filter(StockLocation.sku == sku, StockLocation.branch == body.branch)
        .first()
    ):
        raise HTTPException(
            status_code=409,
            detail=f"Location '{body.branch}' already exists for this SKU",
        )
    loc = StockLocation(sku=sku, **body.model_dump())
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return {
        "id": loc.id,
        "sku": loc.sku,
        "branch": loc.branch,
        "zone": loc.zone,
        "qty_on_hand": loc.qty_on_hand,
        "committed_qty": loc.committed_qty,
        "available_qty": loc.available_qty,
        "backorder_qty": loc.backorder_qty,
        "on_po_qty": loc.on_po_qty,
        "primary_bin_1": loc.primary_bin_1,
        "max_qty_bin_1": loc.max_qty_bin_1,
        "primary_bin_2": loc.primary_bin_2,
        "max_qty_bin_2": loc.max_qty_bin_2,
    }


@router.patch("/{sku}/locations/{branch}")
def update_location(
    sku: str,
    branch: str,
    body: LocationUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    loc = (
        db.query(StockLocation)
        .filter(StockLocation.sku == sku, StockLocation.branch == branch)
        .first()
    )
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(loc, field, value)
    db.commit()
    db.refresh(loc)
    return {
        "id": loc.id,
        "sku": loc.sku,
        "branch": loc.branch,
        "zone": loc.zone,
        "qty_on_hand": loc.qty_on_hand,
        "committed_qty": loc.committed_qty,
        "available_qty": loc.available_qty,
        "backorder_qty": loc.backorder_qty,
        "on_po_qty": loc.on_po_qty,
        "primary_bin_1": loc.primary_bin_1,
        "max_qty_bin_1": loc.max_qty_bin_1,
        "primary_bin_2": loc.primary_bin_2,
        "max_qty_bin_2": loc.max_qty_bin_2,
    }


@router.delete("/{sku}/locations/{branch}")
def delete_location(
    sku: str,
    branch: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    loc = (
        db.query(StockLocation)
        .filter(StockLocation.sku == sku, StockLocation.branch == branch)
        .first()
    )
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    db.delete(loc)
    db.commit()
    return {"ok": True}


@router.get("/{sku}/pricing")
def get_pricing(
    sku: str, db: Session = Depends(get_db), _: User = Depends(require_any)
):
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    levels = (
        db.query(StockPriceLevel)
        .options(joinedload(StockPriceLevel.breakpoints))
        .filter(StockPriceLevel.sku == sku)
        .all()
    )
    return {
        "last_cost": float(item.last_cost) if item.last_cost is not None else None,
        "last_cog": float(item.last_cog) if item.last_cog is not None else None,
        "avg_cost": float(item.avg_cost) if item.avg_cost is not None else None,
        "avg_cog": float(item.avg_cog) if item.avg_cog is not None else None,
        "max_cog": float(item.max_cog) if item.max_cog is not None else None,
        "last_po_cogs": (
            float(item.last_po_cogs) if item.last_po_cogs is not None else None
        ),
        "avg_po_cogs": (
            float(item.avg_po_cogs) if item.avg_po_cogs is not None else None
        ),
        "last_ex": float(item.last_ex) if item.last_ex is not None else None,
        "last_effective_date": item.last_effective_date,
        "price_template": item.price_template,
        "price_levels": [
            {
                "id": pl.id,
                "price_level": pl.price_level,
                "price_calc_method": pl.price_calc_method,
                "base_pl": pl.base_pl,
                "currency": pl.currency,
                "tax_code": pl.tax_code,
                "breakpoints": [
                    {
                        "id": bp.id,
                        "min_qty": bp.min_qty,
                        "price_ex": float(bp.price_ex),
                        "price_inc": float(bp.price_inc),
                        "pont_pct": (
                            float(bp.pont_pct) if bp.pont_pct is not None else None
                        ),
                    }
                    for bp in pl.breakpoints
                ],
            }
            for pl in levels
        ],
    }


@router.put("/{sku}/pricing/cost")
def update_cost(
    sku: str,
    body: CostUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    db.commit()
    return {"ok": True}


@router.post("/{sku}/pricing/levels")
def add_price_level(
    sku: str,
    body: PriceLevelCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    if not db.query(InventoryItem).filter(InventoryItem.sku == sku).first():
        raise HTTPException(status_code=404, detail="Item not found")
    if (
        db.query(StockPriceLevel)
        .filter(
            StockPriceLevel.sku == sku, StockPriceLevel.price_level == body.price_level
        )
        .first()
    ):
        raise HTTPException(
            status_code=409,
            detail=f"Price level '{body.price_level}' already exists for this SKU",
        )
    level = StockPriceLevel(
        sku=sku,
        price_level=body.price_level,
        price_calc_method=body.price_calc_method,
        base_pl=body.base_pl,
        currency=body.currency,
        tax_code=body.tax_code,
    )
    for bp in body.breakpoints:
        level.breakpoints.append(StockPriceBreakpoint(**bp.model_dump()))
    db.add(level)
    db.commit()
    db.refresh(level)
    return {
        "id": level.id,
        "price_level": level.price_level,
        "price_calc_method": level.price_calc_method,
        "currency": level.currency,
        "tax_code": level.tax_code,
        "breakpoints": [
            {
                "id": bp.id,
                "min_qty": bp.min_qty,
                "price_ex": float(bp.price_ex),
                "price_inc": float(bp.price_inc),
                "pont_pct": float(bp.pont_pct) if bp.pont_pct is not None else None,
            }
            for bp in level.breakpoints
        ],
    }


@router.put("/{sku}/pricing/levels/{level_id}")
def update_price_level(
    sku: str,
    level_id: int,
    body: PriceLevelCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    level = (
        db.query(StockPriceLevel)
        .filter(StockPriceLevel.id == level_id, StockPriceLevel.sku == sku)
        .first()
    )
    if not level:
        raise HTTPException(status_code=404, detail="Price level not found")
    level.price_level = body.price_level
    level.price_calc_method = body.price_calc_method
    level.base_pl = body.base_pl
    level.currency = body.currency
    level.tax_code = body.tax_code
    for bp in list(level.breakpoints):
        db.delete(bp)
    db.flush()
    level.breakpoints = [
        StockPriceBreakpoint(**bp.model_dump()) for bp in body.breakpoints
    ]
    db.commit()
    db.refresh(level)
    return {
        "id": level.id,
        "price_level": level.price_level,
        "breakpoints": [
            {
                "id": bp.id,
                "min_qty": bp.min_qty,
                "price_ex": float(bp.price_ex),
                "price_inc": float(bp.price_inc),
                "pont_pct": float(bp.pont_pct) if bp.pont_pct is not None else None,
            }
            for bp in level.breakpoints
        ],
    }


@router.delete("/{sku}/pricing/levels/{level_id}")
def delete_price_level(
    sku: str,
    level_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    level = (
        db.query(StockPriceLevel)
        .filter(StockPriceLevel.id == level_id, StockPriceLevel.sku == sku)
        .first()
    )
    if not level:
        raise HTTPException(status_code=404, detail="Price level not found")
    db.delete(level)
    db.commit()
    return {"ok": True}


@router.get("/{sku}/transactions")
def get_transactions(
    sku: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    if not db.query(InventoryItem).filter(InventoryItem.sku == sku).first():
        raise HTTPException(status_code=404, detail="Item not found")
    movements = (
        db.query(StockMovement)
        .filter(StockMovement.sku == sku)
        .order_by(StockMovement.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": m.id,
            "date": m.date,
            "type": m.type,
            "reference": m.reference,
            "location_branch": m.location_branch,
            "quantity": m.quantity,
            "qty_bal": m.qty_bal,
            "po_id": m.po_id,
            "po_line": m.po_line,
            "job_id": m.job_id,
            "pack_num": m.pack_num,
            "bin": m.bin,
            "notes": m.notes,
        }
        for m in movements
    ]


@router.get("/{sku}/committed")
def get_committed(
    sku: str, db: Session = Depends(get_db), _: User = Depends(require_any)
):
    if not db.query(InventoryItem).filter(InventoryItem.sku == sku).first():
        raise HTTPException(status_code=404, detail="Item not found")
    rows = (
        db.query(JobItem, Job)
        .join(Job, JobItem.job_id == Job.id)
        .filter(
            JobItem.stock_code == sku,
            Job.status.notin_(["PAID", "CANCEL"]),
        )
        .all()
    )
    return [
        {
            "card_code": job.customer_id,
            "customer_name": job.customer_name,
            "job_id": job.id,
            "job_ref": job.id,
            "date": job.date_in,
            "location_branch": job.branch,
            "qty": item_.order_qty,
            "unit": "UNIT",
            "price_ex": float(item_.price_ex) if item_.price_ex is not None else None,
            "price_inc": (
                float(item_.price_inc) if item_.price_inc is not None else None
            ),
            "currency": "AUD",
            "total_aud": float(item_.total) if item_.total is not None else None,
        }
        for item_, job in rows
    ]


@router.post("/transfer")
def transfer_stock(
    body: TransferRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Move quantity from one SKU/location to another, creating movement records for both."""
    from_item = (
        db.query(InventoryItem).filter(InventoryItem.sku == body.from_sku).first()
    )
    if not from_item:
        raise HTTPException(status_code=404, detail=f"SKU '{body.from_sku}' not found")
    if from_item.stock < body.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock for transfer")

    ref = body.reference or f"XFER-{body.from_sku}"
    now = datetime.now().strftime("%d/%m/%Y")

    from_item.stock -= body.quantity
    out_movement = StockMovement(
        sku=body.from_sku,
        date=now,
        type="Transfer Out",
        quantity=-body.quantity,
        reference=ref,
        notes=body.notes
        or f"Transfer to {body.to_location or body.to_sku or 'unknown'}",
    )
    db.add(out_movement)

    if body.to_sku and body.to_sku != body.from_sku:
        to_item = (
            db.query(InventoryItem).filter(InventoryItem.sku == body.to_sku).first()
        )
        if not to_item:
            raise HTTPException(
                status_code=404, detail=f"Destination SKU '{body.to_sku}' not found"
            )
        to_item.stock += body.quantity
        in_movement = StockMovement(
            sku=body.to_sku,
            date=now,
            type="Transfer In",
            quantity=body.quantity,
            reference=ref,
            notes=body.notes or f"Transfer from {body.from_location or body.from_sku}",
        )
        db.add(in_movement)
    elif body.to_location:
        from_item.location = body.to_location
        loc_movement = StockMovement(
            sku=body.from_sku,
            date=now,
            type="Location Change",
            quantity=body.quantity,
            reference=ref,
            notes=f"Moved from {body.from_location or from_item.location or '?'} to {body.to_location}",
        )
        db.add(loc_movement)

    db.commit()
    return {"ok": True, "from_sku": body.from_sku, "quantity": body.quantity}


@router.post("/stocktake")
def stocktake(
    body: StocktakeRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Reconcile physical counts against system stock, creating adjustment movements."""
    ref = body.reference or f"STKTK-{datetime.now().strftime('%Y%m%d%H%M')}"
    now = datetime.now().strftime("%d/%m/%Y")
    results = []
    for entry in body.items:
        item = db.query(InventoryItem).filter(InventoryItem.sku == entry.sku).first()
        if not item:
            results.append({"sku": entry.sku, "error": "Not found"})
            continue
        variance = entry.counted_qty - item.stock
        if variance != 0:
            item.stock = entry.counted_qty
            movement = StockMovement(
                sku=entry.sku,
                date=now,
                type="Stocktake",
                quantity=variance,
                reference=ref,
                notes=entry.notes
                or f"Stocktake ({body.method}): counted {entry.counted_qty}, was {item.stock + (-variance)}",
            )
            db.add(movement)
        results.append(
            {
                "sku": entry.sku,
                "previous": item.stock - variance if variance != 0 else item.stock,
                "counted": entry.counted_qty,
                "variance": variance,
            }
        )
    db.commit()
    return {"reference": ref, "method": body.method, "results": results}


@router.post("/auto-reorder")
def auto_reorder(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    """Find all low-stock items and create draft purchase orders grouped by supplier."""
    from datetime import date

    low_stock = (
        db.query(InventoryItem)
        .filter(
            InventoryItem.stock <= InventoryItem.min_stock,
            InventoryItem.min_stock > 0,
            InventoryItem.status == "Active",
        )
        .all()
    )

    if not low_stock:
        return {"created": 0, "purchase_orders": []}

    # Group items by supplier name
    by_supplier: dict = {}
    for item in low_stock:
        key = item.supplier or "Unassigned"
        by_supplier.setdefault(key, []).append(item)

    today = date.today().strftime("%Y-%m-%d")
    created_ids = []

    for idx, (supplier_name, items) in enumerate(by_supplier.items(), 1):
        # Try to match supplier name to DB record
        supplier_rec = (
            db.query(Supplier).filter(Supplier.name.ilike(f"%{supplier_name}%")).first()
        )
        supplier_id = supplier_rec.id if supplier_rec else None

        po_id = f"AR-{date.today().strftime('%Y%m%d')}-{idx:03d}"
        # Avoid duplicate IDs if run multiple times per day
        suffix = 0
        base_id = po_id
        while db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first():
            suffix += 1
            po_id = f"{base_id}-{suffix}"

        po_items = []
        total = 0.0
        for item in items:
            # Use explicit reorder_qty when set; fall back to doubling the min_stock shortfall
            if item.reorder_qty and item.reorder_qty > 0:
                qty = item.reorder_qty
            else:
                qty = max(item.min_stock * 2 - item.stock, item.min_stock)
            line_total = float(qty * (item.unit_cost or 0))
            total += line_total
            po_items.append(
                PurchaseOrderItem(
                    sku=item.sku,
                    description=item.name,
                    qty_ordered=qty,
                    qty_received=0,
                    unit_cost=float(item.unit_cost or 0),
                    total=line_total,
                )
            )

        po = PurchaseOrder(
            id=po_id,
            supplier_id=supplier_id,
            supplier_name=supplier_name,
            status="Draft",
            order_date=today,
            total=total,
            notes=f"Auto-generated reorder — {len(items)} low-stock item(s)",
        )
        po.items = po_items
        db.add(po)
        created_ids.append(po_id)

    db.commit()
    return {"created": len(created_ids), "purchase_orders": created_ids}

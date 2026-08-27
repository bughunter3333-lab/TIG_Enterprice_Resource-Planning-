from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.database import get_db
from app.models.inventory import InventoryItem, StockMovement
from app.models.stock_location import StockLocation
from app.core.branches import normalize_branch
from app.core.stock_location import (
    DEFAULT_BRANCH,
    location_summary,
    position_qty,
    unlocated_qty,
)
from app.core.stock_ledger import place_unlocated, post_movement, post_relocation
from app.core.replenishment import needs_replenishment, replenishment_rows
from app.core.reservations import (
    UNCOMMITTED_STATUSES,
    backordered_by_branch,
    committed_by_branch,
    committed_by_sku,
    on_order_by_sku,
    on_order_total,
)
from app.models.stock_pricing import StockPriceLevel, StockPriceBreakpoint
from app.models.job import Job, JobItem
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.supplier import Supplier
from app.models.supplier_price_list import SupplierPriceList
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
    # Jim2 Descriptions tab
    desc_extended: Optional[str] = None
    desc_web: Optional[str] = None
    desc_care: Optional[str] = None


class StockAdjust(BaseModel):
    adjustment: int
    reason: str
    branch: str = "HQ"


class TransferRequest(BaseModel):
    from_sku: str
    to_sku: Optional[str] = None
    quantity: int
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    # Branch is the stock-position axis (HQ/MELB/...). Kept separate from the
    # bin-level from/to_location strings above, which are shelf codes.
    from_branch: str = "HQ"
    to_branch: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


class StocktakeItemIn(BaseModel):
    sku: str
    counted_qty: int
    notes: Optional[str] = None


class StocktakeRequest(BaseModel):
    reference: Optional[str] = None
    method: str = "Informed"
    branch: str = "HQ"
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


@router.get("")
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
        items = q.order_by(InventoryItem.name).offset(offset).limit(limit).all()
        if low_stock:
            # Filtered after loading rather than in SQL, because whether an item
            # needs buying depends on open jobs and purchase orders and not on
            # its own row. This endpoint is capped at 5,000 items.
            flagged = needs_replenishment(db, [it.sku for it in items])
            items = [it for it in items if it.sku in flagged]
        # Committed and on-order are derived from the open jobs and purchase
        # orders themselves, overriding the stored columns, so what the grid
        # shows cannot drift from the documents it describes. Not persisted.
        skus = [it.sku for it in items]
        if skus:
            committed = committed_by_sku(db, skus)
            on_order = on_order_by_sku(db, skus)
            for it in items:
                it.committed_qty = committed.get(it.sku, 0)
                it.on_order_qty = on_order.get(it.sku, 0)
        return items
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to retrieve inventory")


@router.get("/low-stock")
def low_stock_alert(
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """What needs buying, once what is coming and what is promised are counted.

    The rows carry on-order and committed alongside the projected position, so
    the list can show why something is absent from it — a quieter list is only
    trustworthy if the working is visible.
    """
    rows = replenishment_rows(db)
    for row in rows:
        row["reorder_value"] = round(row["unit_cost"] * row["suggested_qty"], 2)
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


@router.post("")
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
    post_movement(
        db,
        sku=sku,
        movement_type="Adjustment",
        branch=body.branch,
        quantity=body.adjustment,
        notes=body.reason,
    )
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
    # Reserved quantity is derived from the open jobs themselves rather than
    # read off the stored counter, so it cannot drift from the jobs it claims to
    # describe. On PO is derived the same way from outstanding purchase orders,
    # against the branch that receives them.
    committed = committed_by_branch(db, sku)
    backordered = backordered_by_branch(db, sku)
    on_po = on_order_total(db, sku)
    return [
        {
            "id": loc.id,
            "sku": loc.sku,
            "branch": loc.branch,
            "zone": loc.zone,
            "qty_on_hand": loc.qty_on_hand,
            "committed_qty": committed.get(loc.branch, 0),
            "available_qty": max(
                0, (loc.qty_on_hand or 0) - committed.get(loc.branch, 0)
            ),
            "backorder_qty": backordered.get(loc.branch, 0),
            "on_po_qty": on_po if loc.branch == DEFAULT_BRANCH else 0,
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


@router.get("/{sku}/stats")
def get_stock_stats(
    sku: str, db: Session = Depends(get_db), _: User = Depends(require_any)
):
    """Movement velocity for the Jim2 Stock 'Stats' tab.

    Sales use type 'Sale' (negative qty); receipts use type 'Purchase'
    (positive). Windows are measured against created_at (a real timestamp),
    not the free-form `date` string. stock_cover_days answers "how many days
    of stock remain at the trailing-year sales pace" — null when nothing sold.
    """
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    movements = db.query(StockMovement).filter(StockMovement.sku == sku).all()
    now = datetime.now()

    def age_days(m: StockMovement):
        dt = m.created_at
        if dt is None:
            return None
        if dt.tzinfo is not None:
            dt = dt.replace(tzinfo=None)
        return (now - dt).total_seconds() / 86400.0

    scored = [(age_days(m), m) for m in movements]

    def sold_within(days):
        return sum(
            -(m.quantity or 0)
            for a, m in scored
            if m.type == "Sale" and a is not None and a <= days
        )

    units_sold_365 = sold_within(365)
    avg_daily = units_sold_365 / 365.0 if units_sold_365 else 0.0
    on_hand = item.stock or 0
    sale_moves = [m for a, m in scored if m.type == "Sale"]
    purchase_moves = [m for a, m in scored if m.type == "Purchase"]
    last = lambda ms: (  # noqa: E731
        max(ms, key=lambda m: m.created_at or datetime.min).date if ms else None
    )

    return {
        "sku": sku,
        "on_hand": on_hand,
        "units_sold_30": sold_within(30),
        "units_sold_90": sold_within(90),
        "units_sold_365": units_sold_365,
        "units_received_365": sum(
            (m.quantity or 0)
            for a, m in scored
            if m.type == "Purchase" and a is not None and a <= 365
        ),
        "total_sold_all_time": sum(-(m.quantity or 0) for m in sale_moves),
        "total_received_all_time": sum((m.quantity or 0) for m in purchase_moves),
        "sale_count": len(sale_moves),
        "avg_monthly_sold": round(units_sold_365 / 12.0, 2),
        "avg_daily_sold": round(avg_daily, 3),
        "stock_cover_days": round(on_hand / avg_daily, 1) if avg_daily > 0 else None,
        "last_sold": last(sale_moves),
        "last_received": last(purchase_moves),
    }


def _require_item(db: Session, sku: str):
    if not db.query(InventoryItem).filter(InventoryItem.sku == sku).first():
        raise HTTPException(status_code=404, detail="Item not found")


@router.get("/{sku}/location-summary")
def get_location_summary(
    sku: str, db: Session = Depends(get_db), _: User = Depends(require_any)
):
    """Per-branch positions plus how much on-hand has no location yet.

    Stock received before location tracking has no branch, so `unlocated` is
    expected to be non-zero on legacy items. Showing it is the point — a
    Locations tab that silently fails to add up to the item is worse than one
    that admits the gap.
    """
    _require_item(db, sku)
    return location_summary(db, sku)


@router.get("/{sku}/vendors")
def get_stock_vendors(
    sku: str, db: Session = Depends(get_db), _: User = Depends(require_any)
):
    """Suppliers who list this SKU and their prices (Jim2 'Vendors' tab)."""
    _require_item(db, sku)
    rows = (
        db.query(SupplierPriceList, Supplier)
        .outerjoin(Supplier, SupplierPriceList.supplier_id == Supplier.id)
        .filter(SupplierPriceList.sku == sku)
        .order_by(SupplierPriceList.unit_cost.asc())
        .all()
    )
    return [
        {
            "supplier_id": spl.supplier_id,
            "supplier_name": sup.name if sup else spl.supplier_id,
            "unit_cost": float(spl.unit_cost or 0),
            "min_qty": spl.min_qty,
            "currency": spl.currency,
            "lead_time_days": spl.lead_time_days,
            "valid_from": spl.valid_from,
            "valid_to": spl.valid_to,
        }
        for spl, sup in rows
    ]


@router.get("/{sku}/buying")
def get_stock_buying(
    sku: str, db: Session = Depends(get_db), _: User = Depends(require_any)
):
    """Purchase-order line history for this SKU (Jim2 'Buying' tab). Outstanding
    lines (ordered > received) drive the 'Stock On Hand' incoming view."""
    _require_item(db, sku)
    rows = (
        db.query(PurchaseOrderItem, PurchaseOrder)
        .join(PurchaseOrder, PurchaseOrderItem.order_id == PurchaseOrder.id)
        .filter(PurchaseOrderItem.sku == sku)
        .order_by(PurchaseOrder.created_at.desc())
        .all()
    )
    out = []
    for it, po in rows:
        ordered = it.qty_ordered or 0
        received = it.qty_received or 0
        out.append(
            {
                "po_id": po.id,
                "supplier_name": po.supplier_name,
                "status": po.status,
                "order_date": po.order_date,
                "expected_date": po.expected_date,
                "qty_ordered": ordered,
                "qty_received": received,
                "outstanding": max(0, ordered - received),
                "unit_cost": float(it.unit_cost or 0),
                "total": float(it.total or 0),
            }
        )
    return out


@router.get("/{sku}/sales")
def get_stock_sales(
    sku: str, db: Session = Depends(get_db), _: User = Depends(require_any)
):
    """Sale movements for this SKU with the customer/job (Jim2 'Sales' tab)."""
    _require_item(db, sku)
    rows = (
        db.query(StockMovement, Job)
        .outerjoin(Job, StockMovement.job_id == Job.id)
        .filter(StockMovement.sku == sku, StockMovement.type == "Sale")
        .order_by(StockMovement.created_at.desc())
        .all()
    )
    return [
        {
            "date": m.date,
            "job_id": m.job_id,
            "customer_name": job.customer_name if job else None,
            "reference": m.reference,
            "location_branch": m.location_branch,
            "quantity": abs(m.quantity or 0),
        }
        for m, job in rows
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
            JobItem.supply_qty > 0,
            Job.status.notin_(UNCOMMITTED_STATUSES),
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
    now_date = datetime.now().strftime("%d/%m/%Y")
    from_branch = normalize_branch(body.from_branch)
    dest_branch = normalize_branch(body.to_branch or body.from_branch)

    # You can only move what is at the branch you are moving it from. Checking
    # the company-wide total instead let a 10-unit move off a branch holding 3
    # succeed: the position floored at zero and the destination gained 10, so
    # the branches then held more than the item did.
    #
    # Stock that has no branch yet counts as available here, on the same reading
    # the stocktake uses — the operator has it in front of them. It is placed at
    # the source first so the move works on a real position rather than on a
    # figure that exists only in the item total.
    available_at_source = position_qty(db, body.from_sku, from_branch)
    if available_at_source < body.quantity:
        shortfall = body.quantity - available_at_source
        place_unlocated(
            db,
            sku=body.from_sku,
            branch=from_branch,
            quantity=min(max(0, unlocated_qty(db, body.from_sku)), shortfall),
            date=now_date,
            reference=body.reference,
            notes=f"Located at {from_branch} by transfer",
        )
        available_at_source = position_qty(db, body.from_sku, from_branch)
    if available_at_source < body.quantity:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Only {available_at_source} at {from_branch} — "
                f"cannot transfer {body.quantity}"
            ),
        )

    ref = body.reference or f"XFER-{body.from_sku}"
    now = now_date

    is_cross_sku = bool(body.to_sku and body.to_sku != body.from_sku)

    # Moving stock to where it already is is not a move. Running it anyway takes
    # the quantity off the position and puts it back, which is harmless only
    # while nothing floors in between.
    if not is_cross_sku and dest_branch == from_branch and not body.to_location:
        return {"ok": True, "from_sku": body.from_sku, "quantity": 0}

    # A cross-SKU transfer converts one product into another, so both totals
    # move. A same-SKU move only RELOCATES stock and must leave the total alone —
    # it used to decrement unconditionally, which silently destroyed stock every
    # time someone shifted it between bins.
    if is_cross_sku:
        # Checked before anything moves: a transfer to a SKU that does not exist
        # should fail without having taken stock off the source.
        if not db.query(InventoryItem).filter(InventoryItem.sku == body.to_sku).first():
            raise HTTPException(
                status_code=404, detail=f"Destination SKU '{body.to_sku}' not found"
            )
        post_movement(
            db,
            sku=body.from_sku,
            movement_type="Transfer Out",
            branch=from_branch,
            quantity=-body.quantity,
            date=now,
            reference=ref,
            notes=body.notes or f"Transfer to {body.to_sku}",
        )
        post_movement(
            db,
            sku=body.to_sku,
            movement_type="Transfer In",
            branch=dest_branch,
            quantity=body.quantity,
            date=now,
            reference=ref,
            notes=body.notes or f"Transfer from {body.from_location or body.from_sku}",
        )
    else:
        if body.to_location:
            from_item.location = body.to_location
        post_relocation(
            db,
            sku=body.from_sku,
            quantity=body.quantity,
            from_branch=from_branch,
            to_branch=dest_branch,
            date=now,
            reference=ref,
            notes=body.notes
            or f"Moved {from_branch} -> {dest_branch}"
            + (f" ({body.to_location})" if body.to_location else ""),
        )

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
        # A count is a count of one shelf, so it is measured against what the
        # system believes is on that shelf — never the company-wide total.
        # Differencing against the total and applying the result to one branch
        # destroyed what the others held: counting 38 at MELB on an item holding
        # 60 at HQ set the total to 38 and emptied MELB.
        #
        # Stock with no branch at all counts towards this shelf. It physically
        # sits somewhere, and the shelf in front of the counter is the only
        # evidence available; sweeping it in here is also what finally clears
        # the "not yet located" figure for legacy stock. On a two-branch item
        # that means whichever branch is counted first claims it — which the
        # second count then corrects, since by then nothing is unlocated.
        unlocated = max(0, unlocated_qty(db, entry.sku))
        previous = position_qty(db, entry.sku, body.branch) + unlocated
        variance = entry.counted_qty - previous

        place_unlocated(
            db,
            sku=entry.sku,
            branch=body.branch,
            quantity=unlocated,
            date=now,
            reference=ref,
            notes=f"Located by stocktake {ref}",
        )
        if variance != 0:
            post_movement(
                db,
                sku=entry.sku,
                movement_type="Stocktake",
                branch=body.branch,
                quantity=variance,
                date=now,
                reference=ref,
                notes=entry.notes
                or f"Stocktake ({body.method}): counted {entry.counted_qty}, was {previous}",
            )
        results.append(
            {
                "sku": entry.sku,
                "previous": previous,
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

    # Against the projected position, so running this two days running does not
    # raise a second order for something the first one already covered.
    needed = {row["sku"]: row for row in replenishment_rows(db)}
    low_stock = (
        db.query(InventoryItem).filter(InventoryItem.sku.in_(list(needed))).all()
        if needed
        else []
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

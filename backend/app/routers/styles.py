from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional, List

from app.database import get_db
from app.models.style import Style, StyleColour, StyleSize
from app.models.inventory import InventoryItem
from app.core.dependencies import require_any, require_staff
from app.models.user import User

router = APIRouter(prefix="/styles", tags=["styles"])


# ── Pydantic schemas ─────────────────────────────────────────────────────────


class ColourIn(BaseModel):
    code: str
    name: str
    hex: Optional[str] = None
    sort_order: int = 0


class SizeIn(BaseModel):
    code: str
    sort_order: int = 0


class StyleCreate(BaseModel):
    code: str
    name: str
    category: Optional[str] = None
    brand: Optional[str] = None
    gender: Optional[str] = None
    season: Optional[str] = None
    collection: Optional[str] = None
    description: Optional[str] = None
    base_purchase_price: float = 0
    base_sell_price: float = 0
    gst_applicable: bool = True
    image_url: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True
    colours: List[ColourIn] = []
    sizes: List[SizeIn] = []


class StyleUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    gender: Optional[str] = None
    season: Optional[str] = None
    collection: Optional[str] = None
    description: Optional[str] = None
    base_purchase_price: Optional[float] = None
    base_sell_price: Optional[float] = None
    gst_applicable: Optional[bool] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = None
    colours: Optional[List[ColourIn]] = None
    sizes: Optional[List[SizeIn]] = None


# ── Serialiser ───────────────────────────────────────────────────────────────


def _serial(s: Style, matrix: bool = False) -> dict:
    colours = [
        {
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "hex": c.hex,
            "sort_order": c.sort_order,
        }
        for c in s.colours
    ]
    sizes = [
        {"id": sz.id, "code": sz.code, "sort_order": sz.sort_order} for sz in s.sizes
    ]

    out = {
        "id": s.id,
        "code": s.code,
        "name": s.name,
        "category": s.category,
        "brand": s.brand,
        "gender": s.gender,
        "season": s.season,
        "collection": s.collection,
        "description": s.description,
        "base_purchase_price": float(s.base_purchase_price or 0),
        "base_sell_price": float(s.base_sell_price or 0),
        "gst_applicable": s.gst_applicable,
        "image_url": s.image_url,
        "notes": s.notes,
        "active": s.active,
        "colours": colours,
        "sizes": sizes,
        "sku_count": len(s.inventory_items),
        "total_stock": sum(i.stock for i in s.inventory_items),
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }

    if matrix:
        m: dict = {}
        for inv in s.inventory_items:
            cc = inv.colour_code or ""
            sc = inv.size_code or ""
            m.setdefault(cc, {})[sc] = {
                "sku": inv.sku,
                "stock": inv.stock,
                "unit_cost": float(inv.unit_cost or 0),
                "sell_price": float(inv.sell_price or 0),
            }
        out["matrix"] = m

    return out


def _load(style_id: int, db: Session) -> Style:
    s = (
        db.query(Style)
        .options(
            joinedload(Style.colours),
            joinedload(Style.sizes),
            joinedload(Style.inventory_items),
        )
        .filter(Style.id == style_id)
        .first()
    )
    if not s:
        raise HTTPException(404, "Style not found")
    return s


# ── Routes ───────────────────────────────────────────────────────────────────


@router.get("/")
def list_styles(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    brand: Optional[str] = Query(None),
    season: Optional[str] = Query(None),
    active_only: bool = Query(True),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    q = db.query(Style).options(
        joinedload(Style.colours),
        joinedload(Style.sizes),
        joinedload(Style.inventory_items),
    )
    if search:
        t = f"%{search}%"
        q = q.filter(Style.code.ilike(t) | Style.name.ilike(t) | Style.brand.ilike(t))
    if category:
        q = q.filter(Style.category == category)
    if brand:
        q = q.filter(Style.brand == brand)
    if season:
        q = q.filter(Style.season == season)
    if active_only:
        q = q.filter(Style.active.is_(True))
    return [
        _serial(s, matrix=True)
        for s in q.order_by(Style.code).offset(offset).limit(limit).all()
    ]


@router.get("/meta")
def style_meta(db: Session = Depends(get_db), _: User = Depends(require_any)):
    """Distinct filter values for categories, brands, seasons."""
    from sqlalchemy import distinct

    categories = [
        r[0]
        for r in db.query(distinct(Style.category))
        .filter(Style.category.isnot(None))
        .all()
    ]
    brands = [
        r[0]
        for r in db.query(distinct(Style.brand)).filter(Style.brand.isnot(None)).all()
    ]
    seasons = [
        r[0]
        for r in db.query(distinct(Style.season)).filter(Style.season.isnot(None)).all()
    ]
    return {
        "categories": sorted(categories),
        "brands": sorted(brands),
        "seasons": sorted(seasons),
    }


@router.post("/")
def create_style(
    data: StyleCreate, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    if db.query(Style).filter(Style.code == data.code.upper()).first():
        raise HTTPException(400, "Style code already exists")
    s = Style(
        code=data.code.upper().strip(),
        name=data.name,
        category=data.category,
        brand=data.brand,
        gender=data.gender,
        season=data.season,
        collection=data.collection,
        description=data.description,
        base_purchase_price=data.base_purchase_price,
        base_sell_price=data.base_sell_price,
        gst_applicable=data.gst_applicable,
        image_url=data.image_url,
        notes=data.notes,
        active=data.active,
    )
    db.add(s)
    db.flush()
    for i, c in enumerate(data.colours):
        db.add(
            StyleColour(
                style_id=s.id, code=c.code.upper(), name=c.name, hex=c.hex, sort_order=i
            )
        )
    for i, sz in enumerate(data.sizes):
        db.add(StyleSize(style_id=s.id, code=sz.code.upper(), sort_order=i))
    db.commit()
    return _serial(_load(s.id, db), matrix=True)


@router.get("/{style_id}")
def get_style(
    style_id: int, db: Session = Depends(get_db), _: User = Depends(require_any)
):
    return _serial(_load(style_id, db), matrix=True)


@router.put("/{style_id}")
def update_style(
    style_id: int,
    data: StyleUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    s = _load(style_id, db)
    for f in [
        "name",
        "category",
        "brand",
        "gender",
        "season",
        "collection",
        "description",
        "base_purchase_price",
        "base_sell_price",
        "gst_applicable",
        "image_url",
        "notes",
        "active",
    ]:
        v = getattr(data, f)
        if v is not None:
            setattr(s, f, v)

    if data.colours is not None:
        for c in list(s.colours):
            db.delete(c)
        db.flush()
        for i, c in enumerate(data.colours):
            db.add(
                StyleColour(
                    style_id=s.id,
                    code=c.code.upper(),
                    name=c.name,
                    hex=c.hex,
                    sort_order=i,
                )
            )

    if data.sizes is not None:
        for sz in list(s.sizes):
            db.delete(sz)
        db.flush()
        for i, sz in enumerate(data.sizes):
            db.add(StyleSize(style_id=s.id, code=sz.code.upper(), sort_order=i))

    db.commit()
    return _serial(_load(style_id, db), matrix=True)


@router.delete("/{style_id}")
def delete_style(
    style_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    s = db.query(Style).filter(Style.id == style_id).first()
    if not s:
        raise HTTPException(404, "Style not found")
    db.query(InventoryItem).filter(InventoryItem.style_id == style_id).update(
        {"style_id": None, "colour_code": None, "size_code": None}
    )
    db.delete(s)
    db.commit()
    return {"ok": True}


@router.post("/{style_id}/generate-skus")
def generate_skus(
    style_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    """Create inventory SKUs for every colour × size combo that doesn't exist yet."""
    s = _load(style_id, db)
    if not s.colours or not s.sizes:
        raise HTTPException(400, "Style needs at least one colour and one size")

    existing = {i.sku for i in s.inventory_items}
    created = 0
    for colour in s.colours:
        for size in s.sizes:
            sku = f"{s.code}-{colour.code}-{size.code}"
            if sku not in existing:
                db.add(
                    InventoryItem(
                        sku=sku,
                        name=f"{s.name} {colour.name} {size.code}",
                        category=s.category,
                        stock=0,
                        min_stock=0,
                        unit_cost=s.base_purchase_price,
                        sell_price=s.base_sell_price,
                        status="Active",
                        style_id=s.id,
                        colour_code=colour.code,
                        size_code=size.code,
                    )
                )
                created += 1
    db.commit()
    return {"created": created}

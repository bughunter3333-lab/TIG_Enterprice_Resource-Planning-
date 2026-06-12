from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.card_file import CardFile
from app.core.dependencies import require_any, require_staff
from app.models.user import User

router = APIRouter(prefix="/card-files", tags=["card-files"])


class CardFileCreate(BaseModel):
    ship_code: str
    customer_code: str
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    country: str = "AU"
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


class CardFileUpdate(BaseModel):
    customer_code: Optional[str] = None
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


@router.get("/")
def list_card_files(
    search: Optional[str] = Query(None),
    group: Optional[str] = Query(None),
    customer_code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    q = db.query(CardFile)
    if search:
        term = f"%{search}%"
        q = q.filter(
            CardFile.ship_code.ilike(term)
            | CardFile.company_name.ilike(term)
            | CardFile.customer_code.ilike(term)
            | CardFile.suburb.ilike(term)
        )
    if group:
        q = q.filter(
            CardFile.ship_code.ilike(f"{group}.%") | CardFile.ship_code.ilike(group)
        )
    if customer_code:
        q = q.filter(CardFile.customer_code == customer_code)
    return q.order_by(CardFile.ship_code).all()


@router.get("/{ship_code}")
def get_card_file(
    ship_code: str, db: Session = Depends(get_db), _: User = Depends(require_any)
):
    card = db.query(CardFile).filter(CardFile.ship_code == ship_code).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card file not found")
    return card


@router.post("/")
def create_card_file(
    body: CardFileCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    if db.query(CardFile).filter(CardFile.ship_code == body.ship_code).first():
        raise HTTPException(status_code=409, detail="Ship code already exists")
    card = CardFile(**body.model_dump())
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


@router.patch("/{ship_code}")
def update_card_file(
    ship_code: str,
    body: CardFileUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    card = db.query(CardFile).filter(CardFile.ship_code == ship_code).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card file not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(card, field, value)
    db.commit()
    db.refresh(card)
    return card


@router.delete("/{ship_code}")
def delete_card_file(
    ship_code: str, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    card = db.query(CardFile).filter(CardFile.ship_code == ship_code).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card file not found")
    db.delete(card)
    db.commit()
    return {"ok": True}

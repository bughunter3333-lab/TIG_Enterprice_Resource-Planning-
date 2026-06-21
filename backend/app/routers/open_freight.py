from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.core.dependencies import require_staff, require_any
from app.models.user import User
from app.models.open_freight import OpenFreightAccount, OpenFreightParcel

router = APIRouter(prefix="/open-freight", tags=["open-freight"])


# ── Schemas ───────────────────────────────────────────────────────────────────


class AccountUpdate(BaseModel):
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    depot: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    api_key: Optional[str] = None
    notes: Optional[str] = None


class ParcelCreate(BaseModel):
    name: str
    parcel_type: Optional[str] = None
    service: Optional[str] = None
    carrier_code: Optional[str] = None
    max_weight_kg: Optional[float] = None
    length_cm: Optional[float] = None
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    rate: Optional[float] = None
    notes: Optional[str] = None


class ParcelUpdate(BaseModel):
    name: Optional[str] = None
    parcel_type: Optional[str] = None
    service: Optional[str] = None
    carrier_code: Optional[str] = None
    max_weight_kg: Optional[float] = None
    length_cm: Optional[float] = None
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    rate: Optional[float] = None
    notes: Optional[str] = None


# ── Account (single-row settings) ─────────────────────────────────────────────


def _account_response(account) -> dict:
    """Return account data with api_key stripped; callers get api_key_set instead."""
    return {
        "id": account.id if hasattr(account, "id") else 1,
        "account_number": account.account_number or "",
        "account_name": account.account_name or "",
        "depot": account.depot or "",
        "contact_name": account.contact_name or "",
        "contact_phone": account.contact_phone or "",
        "contact_email": account.contact_email or "",
        "api_key_set": bool(account.api_key),
        "notes": account.notes or "",
    }


@router.get("/account")
def get_account(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    account = db.query(OpenFreightAccount).filter(OpenFreightAccount.id == 1).first()
    if not account:
        return {
            "id": 1,
            "account_number": "",
            "account_name": "",
            "depot": "",
            "contact_name": "",
            "contact_phone": "",
            "contact_email": "",
            "api_key_set": False,
            "notes": "",
        }
    return _account_response(account)


@router.put("/account")
def save_account(
    body: AccountUpdate, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    data = body.model_dump(exclude_none=True)
    # Never overwrite an existing key with an empty string from the frontend
    if not data.get("api_key"):
        data.pop("api_key", None)
    account = db.query(OpenFreightAccount).filter(OpenFreightAccount.id == 1).first()
    if account:
        for field, value in data.items():
            setattr(account, field, value)
    else:
        account = OpenFreightAccount(id=1, **body.model_dump())
        db.add(account)
    db.commit()
    db.refresh(account)
    return _account_response(account)


# ── Parcel types ──────────────────────────────────────────────────────────────


@router.get("/parcels")
def list_parcels(db: Session = Depends(get_db), _: User = Depends(require_any)):
    return db.query(OpenFreightParcel).order_by(OpenFreightParcel.name).all()


@router.post("/parcels")
def create_parcel(
    body: ParcelCreate, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    parcel = OpenFreightParcel(**body.model_dump())
    db.add(parcel)
    db.commit()
    db.refresh(parcel)
    return parcel


@router.patch("/parcels/{parcel_id}")
def update_parcel(
    parcel_id: int,
    body: ParcelUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    parcel = (
        db.query(OpenFreightParcel).filter(OpenFreightParcel.id == parcel_id).first()
    )
    if not parcel:
        raise HTTPException(status_code=404, detail="Parcel type not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(parcel, field, value)
    db.commit()
    db.refresh(parcel)
    return parcel


@router.delete("/parcels/{parcel_id}")
def delete_parcel(
    parcel_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    parcel = (
        db.query(OpenFreightParcel).filter(OpenFreightParcel.id == parcel_id).first()
    )
    if not parcel:
        raise HTTPException(status_code=404, detail="Parcel type not found")
    db.delete(parcel)
    db.commit()
    return {"ok": True}

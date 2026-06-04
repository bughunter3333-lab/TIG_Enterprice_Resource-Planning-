from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.customer import Customer
from app.models.customer_ship_to import CustomerShipTo
from app.core.dependencies import require_staff, require_any

router = APIRouter(prefix="/customers", tags=["ship-to"])


class ShipToCreate(BaseModel):
    code: str
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    country: str = "Australia"
    is_default: bool = False


class ShipToUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    country: Optional[str] = None
    is_default: Optional[bool] = None


@router.get("/{customer_id}/ship-tos")
def list_ship_tos(customer_id: str, db: Session = Depends(get_db), _=Depends(require_any)):
    if not db.query(Customer).filter(Customer.id == customer_id).first():
        raise HTTPException(status_code=404, detail="Customer not found")
    return db.query(CustomerShipTo).filter(CustomerShipTo.customer_id == customer_id).order_by(CustomerShipTo.code).all()


@router.post("/{customer_id}/ship-tos", status_code=201)
def create_ship_to(customer_id: str, body: ShipToCreate, db: Session = Depends(get_db), _=Depends(require_staff)):
    if not db.query(Customer).filter(Customer.id == customer_id).first():
        raise HTTPException(status_code=404, detail="Customer not found")
    existing = db.query(CustomerShipTo).filter(
        CustomerShipTo.customer_id == customer_id,
        CustomerShipTo.code == body.code,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Ship-to code '{body.code}' already exists for this customer")
    if body.is_default:
        db.query(CustomerShipTo).filter(CustomerShipTo.customer_id == customer_id).update({"is_default": False})
    ship_to = CustomerShipTo(customer_id=customer_id, **body.model_dump())
    db.add(ship_to)
    db.commit()
    db.refresh(ship_to)
    return ship_to


@router.patch("/{customer_id}/ship-tos/{ship_to_id}")
def update_ship_to(
    customer_id: str,
    ship_to_id: int,
    body: ShipToUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_staff),
):
    ship_to = db.query(CustomerShipTo).filter(
        CustomerShipTo.id == ship_to_id,
        CustomerShipTo.customer_id == customer_id,
    ).first()
    if not ship_to:
        raise HTTPException(status_code=404, detail="Ship-to address not found")
    if body.is_default:
        db.query(CustomerShipTo).filter(CustomerShipTo.customer_id == customer_id).update({"is_default": False})
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(ship_to, field, value)
    db.commit()
    db.refresh(ship_to)
    return ship_to


@router.delete("/{customer_id}/ship-tos/{ship_to_id}")
def delete_ship_to(
    customer_id: str,
    ship_to_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_staff),
):
    ship_to = db.query(CustomerShipTo).filter(
        CustomerShipTo.id == ship_to_id,
        CustomerShipTo.customer_id == customer_id,
    ).first()
    if not ship_to:
        raise HTTPException(status_code=404, detail="Ship-to address not found")
    db.delete(ship_to)
    db.commit()
    return {"ok": True}

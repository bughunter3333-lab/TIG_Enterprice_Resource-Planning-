"""Logos — a customer's decoration, held once (findings F09, F16, F31).

A logo is what a decoration line applies: its code (the one the job line
carries), method, position, stitch count, price and cost per application, who
does it — in-house, or a named decorator — and its proof. Approving the proof
here approves it for every job that applies the logo; it used to be a field on
each job, so the second job either re-proofed or pointed at the first in a
comment.
"""

from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import require_any, require_staff
from app.database import get_db
from app.models.job import Job, JobItem
from app.models.logo import Logo
from app.models.supplier import Supplier
from app.models.user import User

router = APIRouter(prefix="/logos", tags=["logos"])

MadeBy = Literal["in_house", "subcontract"]

# What a proof shows the customer. A change to any means proofing again: an
# embroidery approved as a print, or with other thread colours, or on the back,
# is not what the customer saw (F31).
_PROOFED = ("artwork_ref", "stitch_count", "decoration_type", "color_count", "position")


class LogoIn(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    customer_id: Optional[str] = None
    name: Optional[str] = Field(None, max_length=150)
    decoration_type: str = Field(min_length=1, max_length=30)
    position: Optional[str] = Field(None, max_length=30)
    stitch_count: Optional[int] = Field(None, ge=0)
    color_count: Optional[int] = Field(None, ge=0)
    artwork_ref: Optional[str] = Field(None, max_length=255)
    price_ex: float = Field(0, ge=0)
    cost_ex: float = Field(0, ge=0)
    made_by: MadeBy = "in_house"
    supplier_id: Optional[str] = None


class LogoUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=150)
    decoration_type: Optional[str] = Field(None, min_length=1, max_length=30)
    position: Optional[str] = Field(None, max_length=30)
    stitch_count: Optional[int] = Field(None, ge=0)
    color_count: Optional[int] = Field(None, ge=0)
    artwork_ref: Optional[str] = Field(None, max_length=255)
    price_ex: Optional[float] = Field(None, ge=0)
    cost_ex: Optional[float] = Field(None, ge=0)
    made_by: Optional[MadeBy] = None
    supplier_id: Optional[str] = None
    is_active: Optional[bool] = None


class ProofIn(BaseModel):
    status: Literal["sent", "approved", "rejected"]
    notes: Optional[str] = Field(None, max_length=2000)


def _row(logo: Logo, jobs: Optional[list] = None) -> dict:
    out = {
        "id": logo.id,
        "code": logo.code,
        "customer_id": logo.customer_id,
        "name": logo.name,
        "decoration_type": logo.decoration_type,
        "position": logo.position,
        "stitch_count": logo.stitch_count,
        "color_count": logo.color_count,
        "artwork_ref": logo.artwork_ref,
        "price_ex": float(logo.price_ex or 0),
        "cost_ex": float(logo.cost_ex or 0),
        "made_by": logo.made_by,
        "supplier_id": logo.supplier_id,
        "proof_status": logo.proof_status,
        "proof_notes": logo.proof_notes,
        "approved_by": logo.proof_by if logo.proof_status == "approved" else None,
        "proof_at": logo.proof_at.isoformat() if logo.proof_at else None,
        "is_active": logo.is_active,
    }
    if jobs is not None:
        out["jobs"] = jobs
    return out


def _jobs_applying(db: Session, logo: Logo) -> list:
    """The open and recent jobs with a line applying this logo."""
    rows = (
        db.query(Job.id)
        .join(JobItem, JobItem.job_id == Job.id)
        .filter(JobItem.logo_id == logo.id, Job.status != "CANCEL")
        .distinct()
        .order_by(Job.id)
    )
    return [job_id for (job_id,) in rows]


def _get(db: Session, logo_id: int) -> Logo:
    logo = db.get(Logo, logo_id)
    if logo is None:
        raise HTTPException(status_code=404, detail="Logo not found")
    return logo


def _check_decorator(db: Session, made_by: str, supplier_id: Optional[str]) -> None:
    if made_by == "subcontract" and not supplier_id:
        raise HTTPException(
            status_code=422,
            detail="A subcontracted logo names its decorator (supplier_id)",
        )
    if supplier_id and db.get(Supplier, supplier_id) is None:
        raise HTTPException(status_code=422, detail=f"No supplier {supplier_id}")


@router.get("")
def list_logos(
    customer_id: Optional[str] = Query(None),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    q = db.query(Logo)
    if customer_id:
        q = q.filter(Logo.customer_id == customer_id)
    if not include_inactive:
        q = q.filter(Logo.is_active.is_(True))
    return [_row(logo) for logo in q.order_by(Logo.code)]


@router.get("/by-code/{code}")
def get_logo_by_code(
    code: str, db: Session = Depends(get_db), _: User = Depends(require_any)
):
    logo = db.query(Logo).filter(func.lower(Logo.code) == code.strip().lower()).first()
    if logo is None:
        raise HTTPException(status_code=404, detail="Logo not found")
    return _row(logo, _jobs_applying(db, logo))


@router.get("/{logo_id}")
def get_logo(
    logo_id: int, db: Session = Depends(get_db), _: User = Depends(require_any)
):
    logo = _get(db, logo_id)
    return _row(logo, _jobs_applying(db, logo))


@router.post("", status_code=201)
def create_logo(
    body: LogoIn, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    code = body.code.strip()
    if db.query(Logo).filter(func.lower(Logo.code) == code.lower()).first():
        raise HTTPException(status_code=409, detail=f"Logo {code} already exists")
    _check_decorator(db, body.made_by, body.supplier_id)
    logo = Logo(**{**body.model_dump(), "code": code})
    db.add(logo)
    db.commit()
    db.refresh(logo)
    return _row(logo, [])


@router.patch("/{logo_id}")
def update_logo(
    logo_id: int,
    body: LogoUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    logo = _get(db, logo_id)
    changes = body.model_dump(exclude_unset=True)
    _check_decorator(
        db,
        changes.get("made_by", logo.made_by),
        changes.get("supplier_id", logo.supplier_id),
    )
    # New artwork, a different stitch-out, method, colour count or position is
    # not what the customer approved: the logo goes back to waiting for a
    # proof, for every job that applies it (F31).
    if any(
        name in changes and changes[name] != getattr(logo, name) for name in _PROOFED
    ):
        logo.proof_status = "none"
    for field, value in changes.items():
        setattr(logo, field, value)
    db.commit()
    db.refresh(logo)
    return _row(logo, _jobs_applying(db, logo))


@router.post("/{logo_id}/proof")
def record_proof(
    logo_id: int,
    body: ProofIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Sent to the customer, approved, or rejected — once, for every job."""
    logo = _get(db, logo_id)
    logo.proof_status = body.status
    logo.proof_notes = body.notes
    logo.proof_at = datetime.now(timezone.utc)
    logo.proof_by = current_user.full_name or current_user.username
    db.commit()
    db.refresh(logo)
    return _row(logo, _jobs_applying(db, logo))

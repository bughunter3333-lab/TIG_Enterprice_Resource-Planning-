"""Dispatch sessions (Jim2 'Dispatch #') — recorded despatch batches.

Creating a session dispatches every job in it (same semantics as
POST /jobs/{id}/dispatch: comment + dispatched_at + optional FINISH->INVOICE
advance with on-hand depletion) and records reviewable lines under a
sequential Dispatch #.
"""

from typing import List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.core.dependencies import require_staff
from app.models.dispatch_session import DispatchSession, DispatchSessionLine
from app.models.job import Job, JobComment
from app.models.user import User
from app.routers.jobs import _apply_status_transition, _get_initials

router = APIRouter(prefix="/dispatch-sessions", tags=["dispatch"])


class SessionLineIn(BaseModel):
    job_id: str
    ship_via: str = ""
    ship_ref: str = ""
    cartons: int = Field(default=1, ge=1)
    advance_status: bool = False


class SessionCreate(BaseModel):
    lines: List[SessionLineIn] = Field(min_length=1)


def _serialize(s: DispatchSession, include_lines: bool = True) -> dict:
    out = {
        "id": s.id,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "line_count": len(s.lines),
    }
    if include_lines:
        out["lines"] = [
            {
                "job_id": ln.job_id,
                "customer_name": ln.customer_name,
                "ship_via": ln.ship_via,
                "ship_ref": ln.ship_ref,
                "cartons": ln.cartons,
            }
            for ln in s.lines
        ]
    return out


@router.post("")
def create_dispatch_session(
    body: SessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    jobs = {
        j.id: j
        for j in db.query(Job)
        .options(joinedload(Job.items))
        .filter(Job.id.in_([ln.job_id for ln in body.lines]))
        .all()
    }
    missing = [ln.job_id for ln in body.lines if ln.job_id not in jobs]
    if missing:
        raise HTTPException(
            status_code=404, detail=f"Job(s) not found: {', '.join(missing)}"
        )

    session = DispatchSession(user_id=current_user.id)
    db.add(session)
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    for ln in body.lines:
        job = jobs[ln.job_id]
        if not job.dispatched_at:
            job.dispatched_at = today
        db.add(
            JobComment(
                job_id=job.id,
                date=now.strftime("%d/%m/%Y"),
                time=now.strftime("%H:%M"),
                initials=_get_initials(current_user),
                author_name=current_user.full_name or current_user.username,
                status=job.status,
                is_internal=True,
                comment=f"Dispatched — Ship Via: {ln.ship_via}, Ref: {ln.ship_ref}, Cartons: {ln.cartons}",
            )
        )
        if ln.advance_status and job.status == "FINISH":
            # Same transition the status endpoint runs — hand-rolling it here
            # missed invoice_status and the customer's AR balance.
            _apply_status_transition(job, "INVOICE", db)
        session.lines.append(
            DispatchSessionLine(
                job_id=job.id,
                customer_name=job.customer_name,
                ship_via=ln.ship_via,
                ship_ref=ln.ship_ref,
                cartons=ln.cartons,
            )
        )
    db.commit()
    db.refresh(session)
    return _serialize(session)


@router.get("")
def list_dispatch_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    sessions = (
        db.query(DispatchSession)
        .options(joinedload(DispatchSession.lines))
        .order_by(DispatchSession.id.desc())
        .limit(100)
        .all()
    )
    return [_serialize(s, include_lines=False) for s in sessions]


@router.get("/{session_id}")
def get_dispatch_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    s = (
        db.query(DispatchSession)
        .options(joinedload(DispatchSession.lines))
        .filter(DispatchSession.id == session_id)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Dispatch session not found")
    return _serialize(s)

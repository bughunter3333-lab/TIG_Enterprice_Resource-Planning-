"""Dispatch sessions (Jim2 'Dispatch #') — recorded despatch batches.

Creating a session despatches every job in it, each exactly as
POST /jobs/{id}/dispatch does (`_record_despatch`: a packed job becomes FINISH,
the connote goes on the job, where it went goes on the line, and an optional
advance to INVOICE), under a sequential Dispatch #.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.core.dependencies import require_staff
from app.models.dispatch_session import DispatchSession
from app.models.job import Job
from app.models.user import User
from app.routers.jobs import _record_despatch

router = APIRouter(prefix="/dispatch-sessions", tags=["dispatch"])


class SessionLineIn(BaseModel):
    job_id: str
    ship_via: str = Field("", max_length=100)
    ship_ref: str = Field("", max_length=100)
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
                "ship_to": ln.ship_to,
                "address": ln.address,
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

    # All or nothing. A batch where some jobs went and some did not would leave
    # the despatcher working out which half went out; refusing it whole, naming
    # each job that cannot go and why, is one thing to fix.
    savepoint = db.begin_nested()
    refused = []
    session = DispatchSession(user_id=current_user.id)
    db.add(session)
    for ln in body.lines:
        try:
            _record_despatch(
                jobs[ln.job_id],
                db,
                current_user,
                session,
                ship_via=ln.ship_via,
                ship_ref=ln.ship_ref,
                cartons=ln.cartons,
                advance=ln.advance_status,
            )
        except HTTPException as exc:
            refused.append((exc.status_code, f"{ln.job_id}: {exc.detail}"))
    if refused:
        savepoint.rollback()
        raise HTTPException(
            status_code=refused[0][0],
            detail="Nothing was despatched. "
            + "; ".join(reason for _, reason in refused),
        )
    savepoint.commit()
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

"""How long a job may sit at each status: read by anyone, set by admins.

docs/superpowers/specs/2026-11-09-status-times.md.
"""

from typing import Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictInt
from sqlalchemy.orm import Session

from app.core import status_times
from app.core.dependencies import require_admin, require_any
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/status-allowances", tags=["jobs"])


class Allowances(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Whole working days; 0 is no limit.
    allowances: Dict[str, StrictInt] = Field(min_length=1)


@router.get("")
def get_allowances(db: Session = Depends(get_db), _: User = Depends(require_any)):
    """Every open status with the working days a job may sit at it (0: no limit)."""
    return status_times.allowances(db)


@router.put("")
def set_allowances(
    body: Allowances,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    unknown = sorted(set(body.allowances) - set(status_times.DEFAULT_ALLOWANCES))
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Not an open status with an allowance: {', '.join(unknown)}.",
        )
    wrong = sorted(
        s
        for s, days in body.allowances.items()
        if not 0 <= days <= status_times.MAX_DAYS
    )
    if wrong:
        raise HTTPException(
            status_code=422,
            detail=(
                f"An allowance is 0 (no limit) to {status_times.MAX_DAYS} working days: "
                f"{', '.join(wrong)}."
            ),
        )
    return status_times.save(db, body.allowances)

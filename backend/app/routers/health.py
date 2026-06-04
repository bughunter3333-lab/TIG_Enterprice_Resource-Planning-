from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone

from app.database import get_db

router = APIRouter(tags=["health"])

_startup_time = datetime.now(timezone.utc)


@router.get("/health", include_in_schema=False)
def liveness():
    """Kubernetes liveness probe — app process is alive."""
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@router.get("/health/ready", include_in_schema=False)
def readiness(db: Session = Depends(get_db)):
    """Kubernetes readiness probe — DB connection is healthy."""
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    uptime = round((datetime.now(timezone.utc) - _startup_time).total_seconds(), 1)
    payload = {
        "status": "ready" if db_ok else "not_ready",
        "database": "ok" if db_ok else "error",
        "uptime_seconds": uptime,
    }
    return JSONResponse(content=payload, status_code=200 if db_ok else 503)

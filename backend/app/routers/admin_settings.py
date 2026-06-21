from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.core.dependencies import require_any, require_admin
from app.models.admin_setting import AdminSetting

router = APIRouter(prefix="/admin/settings", tags=["admin"])


class SettingUpsert(BaseModel):
    value: Optional[str] = None


def _to_dict(row: AdminSetting) -> dict:
    return {"key": row.key, "value": row.value}


@router.get("/{key}")
def get_setting(key: str, db: Session = Depends(get_db), _=Depends(require_any)):
    row = db.query(AdminSetting).filter(AdminSetting.key == key).first()
    if row is None:
        return {"key": key, "value": None}
    return _to_dict(row)


@router.put("/{key}")
def upsert_setting(
    key: str,
    body: SettingUpsert,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    row = db.query(AdminSetting).filter(AdminSetting.key == key).first()
    if row is None:
        row = AdminSetting(key=key, value=body.value)
        db.add(row)
    else:
        row.value = body.value
    db.commit()
    db.refresh(row)
    return _to_dict(row)

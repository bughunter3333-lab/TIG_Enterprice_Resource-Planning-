"""Server-synced nav-tree lists (Jim2: per-user saved lists, max 25 per node).

The frontend previously kept these in localStorage; storing them per user makes
lists follow the user across machines (office PC / warehouse PC).
"""

import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.saved_list import SavedList
from app.models.user import User

router = APIRouter(prefix="/saved-lists", tags=["saved-lists"])

MAX_LISTS_PER_NODE = 25
ALLOWED_NODES = {"jobs", "quotes", "stock", "purchases"}


class SavedListCreate(BaseModel):
    id: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=100)
    node: str
    filter: Optional[dict[str, Any]] = None


class SavedListUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    filter: Optional[dict[str, Any]] = None


def _serialize(row: SavedList) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "node": row.node,
        "filter": json.loads(row.filter_json) if row.filter_json else None,
    }


@router.get("")
def list_saved_lists(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(SavedList)
        .filter(SavedList.user_id == current_user.id)
        .order_by(SavedList.created_at)
        .all()
    )
    return [_serialize(r) for r in rows]


@router.post("")
def create_saved_list(
    body: SavedListCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.node not in ALLOWED_NODES:
        raise HTTPException(status_code=422, detail=f"Unknown node '{body.node}'")
    node_count = (
        db.query(SavedList)
        .filter(SavedList.user_id == current_user.id, SavedList.node == body.node)
        .count()
    )
    if node_count >= MAX_LISTS_PER_NODE:
        raise HTTPException(
            status_code=409,
            detail=f"Maximum {MAX_LISTS_PER_NODE} lists on this node — delete one first.",
        )
    if db.query(SavedList).filter(SavedList.id == body.id).first():
        raise HTTPException(status_code=409, detail="List id already exists")
    row = SavedList(
        id=body.id,
        user_id=current_user.id,
        node=body.node,
        name=body.name,
        filter_json=json.dumps(body.filter) if body.filter is not None else None,
    )
    db.add(row)
    db.commit()
    return _serialize(row)


@router.patch("/{list_id}")
def update_saved_list(
    list_id: str,
    body: SavedListUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(SavedList)
        .filter(SavedList.id == list_id, SavedList.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="List not found")
    if body.name is not None:
        row.name = body.name
    if body.filter is not None:
        row.filter_json = json.dumps(body.filter)
    db.commit()
    return _serialize(row)


@router.delete("/{list_id}")
def delete_saved_list(
    list_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(SavedList)
        .filter(SavedList.id == list_id, SavedList.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="List not found")
    db.delete(row)
    db.commit()
    return {"deleted": list_id}

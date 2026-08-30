"""Stationery layouts, designed in the app.

One row per document type. These are company stationery rather than a per-user
preference — whoever prints a delivery note prints the same one — so they are
not scoped to a user, and writing one is an admin action.
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.core.dependencies import require_admin, require_any
from app.database import get_db
from app.models.document_template import DocumentTemplate
from app.models.user import User

router = APIRouter(prefix="/document-templates", tags=["document-templates"])

# The renderer knows these; the server only refuses ones it has never heard of,
# so a typo cannot quietly create a sixth document nothing prints.
DOC_TYPES = {
    "jobSheet",
    "deliveryNote",
    "consignmentNote",
    "pickingList",
    "shipLabel",
}


class TemplateIn(BaseModel):
    name: str
    spec: dict

    @field_validator("spec")
    @classmethod
    def spec_has_bands(cls, v: dict) -> dict:
        """A template with no bands renders a blank page.

        The shape is otherwise the renderer's business and is stored opaquely,
        but an empty one is always a mistake and is cheap to catch here rather
        than at the printer.
        """
        bands = v.get("bands")
        if not isinstance(bands, dict) or not any(bands.values()):
            raise ValueError("spec.bands must contain at least one non-empty band")
        return v


@router.get("")
def list_templates(
    db: Session = Depends(get_db), _: User = Depends(require_any)
) -> dict:
    """Every saved template, keyed by document type.

    A type that is absent has never been edited and the client falls back to its
    built-in default, which is why this returns a map rather than a list.
    """
    rows = db.query(DocumentTemplate).all()
    return {r.doc_type: json.loads(r.spec) for r in rows}


@router.put("/{doc_type}")
def save_template(
    doc_type: str,
    body: TemplateIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    if doc_type not in DOC_TYPES:
        raise HTTPException(
            status_code=400, detail=f"Unknown document type: {doc_type}"
        )

    row = db.query(DocumentTemplate).filter_by(doc_type=doc_type).first()
    if row is None:
        row = DocumentTemplate(doc_type=doc_type)
        db.add(row)
    row.name = body.name
    row.spec = json.dumps(body.spec)
    db.commit()
    return {"docType": doc_type, "saved": True}


@router.delete("/{doc_type}")
def reset_template(
    doc_type: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    """Drop the saved layout so the built-in default applies again."""
    row = db.query(DocumentTemplate).filter_by(doc_type=doc_type).first()
    if row is not None:
        db.delete(row)
        db.commit()
    return {"docType": doc_type, "reset": True}

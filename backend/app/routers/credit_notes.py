"""Customer credit notes and returns.

docs/superpowers/specs/2026-11-09-returns-credit-notes.md. Only managers and
admins raise or apply a credit note (owner decision 2026-11-09); staff read
them and inspect the goods that come back; the warehouse's list of goods
waiting at RET carries no money, so anyone signed in reads it.
"""

from datetime import date
from decimal import Decimal
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, selectinload

from app.core import credit_notes, shop_day
from app.core.credit_note_document import adjustment_note_pdf
from app.core.branches import DEFAULT_BRANCH
from app.core.dependencies import require_any, require_manager, require_staff
from app.core.ledger import LedgerError, lock_date
from app.core.ledger_postings import sync_credit_application, sync_credit_note
from app.database import get_db
from app.models.credit_note import CreditNoteLine, CustomerCreditNote
from app.models.job import Job
from app.models.user import User
from app.routers.jobs import (
    _recalculate_customer_balance,
    _settle_money,
    _system_comment,
)

router = APIRouter()
_TAG = ["credit-notes"]


class CreditLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_id: int
    qty: int = Field(gt=0, le=100_000)
    goods_back: bool = False


class RaiseCreditNote(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Lines of the invoice, or an amount inc GST — one or the other. An
    # invoice imported from Jim2 as a header has no lines to credit.
    lines: List[CreditLineIn] = Field(default_factory=list, max_length=500)
    amount: Optional[Decimal] = Field(
        default=None, gt=0, max_digits=10, decimal_places=2
    )
    reason: str = Field(min_length=1, max_length=500)
    credit_date: Optional[date] = None


class ApplyCredit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: str = Field(min_length=1, max_length=20)
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)


class Inspect(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: Literal["restock", "scrap"]


def _who(user: User) -> str:
    return user.full_name or user.username


def _today() -> str:
    """The shop's day (Sydney), not the UTC server's."""
    return shop_day.today().isoformat()


def _locked_job(db: Session, job_id: str) -> Job:
    job = (
        db.query(Job)
        .filter(Job.id == job_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job


def _note(db: Session, note_id: str, lock: bool = False) -> CustomerCreditNote:
    q = db.query(CustomerCreditNote).filter(CustomerCreditNote.id == note_id)
    if lock:
        q = q.with_for_update().populate_existing()
    note = q.first()
    if not note:
        raise HTTPException(status_code=404, detail=f"Credit note {note_id} not found")
    return note


def _money(value) -> float:
    return float(value or 0)


def _out(note: CustomerCreditNote) -> dict:
    return {
        "id": note.id,
        "customer_id": note.customer_id,
        "job_id": note.job_id,
        "credit_date": note.credit_date,
        "reason": note.reason,
        "total_ex": _money(note.total_ex),
        "tax": _money(note.tax),
        "total_inc": _money(note.total_inc),
        "applied": float(credit_notes.applied(note)),
        "unapplied": float(credit_notes.unapplied(note)),
        "created_by": note.created_by,
        "lines": [
            {
                "id": line.id,
                "job_item_id": line.job_item_id,
                "stock_code": line.stock_code,
                "description": line.description,
                "qty": line.qty,
                "total_ex": _money(line.total_ex),
                "tax": _money(line.tax),
                "total_inc": _money(line.total_inc),
                "goods_back": bool(line.goods_back),
                "restockable": bool(line.restockable),
                "inspection": line.inspection,
                "inspected_by": line.inspected_by,
            }
            for line in note.lines
        ],
        "applications": [
            {
                "job_id": a.job_id,
                "amount": _money(a.amount),
                "applied_on": a.applied_on,
                "applied_by": a.applied_by,
            }
            for a in note.applications
        ],
    }


def _posted(db: Session, post, *args, by: str) -> None:
    """Post to the ledger, a refusal (the books locked) as a 409."""
    try:
        post(db, *args, created_by=by)
    except LedgerError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


def _credit_day(db: Session, body: RaiseCreditNote, job: Job) -> str:
    """Today or earlier, not before the invoice, and in an open period.

    "Today" is the shop's (`shop_day`): the API runs on UTC, a day behind
    Sydney each morning. A day in a locked period would be posted to the
    ledger on another day while the documents kept this one, and change a
    lodged BAS on paper.
    """
    today = shop_day.today()
    wanted = body.credit_date or today
    if wanted > today:
        raise HTTPException(
            status_code=422, detail="A credit note is dated today or earlier."
        )
    invoiced = (job.invoice_date or "")[:10]
    if invoiced and wanted.isoformat() < invoiced:
        raise HTTPException(
            status_code=422,
            detail=f"Job {job.id} was invoiced on {invoiced} — a credit note comes after it.",
        )
    locked = lock_date(db)
    if locked and wanted <= locked:
        raise HTTPException(
            status_code=422,
            detail=(
                f"The books are locked up to {locked.isoformat()} — date the "
                "credit note after that."
            ),
        )
    return wanted.isoformat()


@router.post("/jobs/{job_id}/credit-notes", tags=_TAG)
def raise_credit_note(
    job_id: str,
    body: RaiseCreditNote,
    db: Session = Depends(get_db),
    user: User = Depends(require_manager),
):
    """Credit lines of an invoice, or an amount; applied to it up to what it
    owes, the rest on the customer's account. Plain goods coming back wait at
    RET for inspection."""
    job = _locked_job(db, job_id)
    by = _who(user)
    note = credit_notes.raise_note(
        db,
        job,
        [credit_notes.Credit(c.item_id, c.qty, c.goods_back) for c in body.lines],
        reason=body.reason,
        credit_date=_credit_day(db, body, job),
        by=by,
        amount=body.amount,
    )
    used = min(credit_notes.owed(job), note.total_inc)
    application = credit_notes.apply(db, note, job, used, on=note.credit_date, by=by)
    _settle_money(job)
    _posted(db, sync_credit_note, note, by=by)
    if application is not None:
        _posted(db, sync_credit_application, application, note, by=by)
    left = credit_notes.unapplied(note)
    said = f"Credit note {note.id} raised for ${note.total_inc:.2f} — {note.reason}"
    if left > 0:
        said += f". ${left:.2f} is credit on the customer's account"
    db.add(_system_comment(job, said, by=user))
    _recalculate_customer_balance(job.customer_id, db)
    db.commit()
    db.refresh(note)
    return _out(note)


@router.get("/jobs/{job_id}/credit-notes", tags=_TAG)
def job_credit_notes(
    job_id: str, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    """The credit notes raised against a job."""
    notes = (
        db.query(CustomerCreditNote)
        .options(
            selectinload(CustomerCreditNote.lines),
            selectinload(CustomerCreditNote.applications),
        )
        .filter(CustomerCreditNote.job_id == job_id)
        .order_by(CustomerCreditNote.id)
        .all()
    )
    return [_out(note) for note in notes]


@router.get("/credit-notes", tags=_TAG)
def list_credit_notes(
    customer_id: Optional[str] = Query(None, max_length=20),
    with_credit: bool = Query(False, description="only those with credit left"),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Credit notes, a customer's when asked; with credit left to apply when asked."""
    q = db.query(CustomerCreditNote).options(
        selectinload(CustomerCreditNote.lines),
        selectinload(CustomerCreditNote.applications),
    )
    if customer_id:
        q = q.filter(CustomerCreditNote.customer_id == customer_id)
    notes = [_out(n) for n in q.order_by(CustomerCreditNote.id.desc()).limit(500)]
    return [n for n in notes if n["unapplied"] > 0] if with_credit else notes


@router.get("/credit-notes/{note_id}", tags=_TAG)
def get_credit_note(
    note_id: str, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    return _out(_note(db, note_id))


@router.post("/credit-notes/{note_id}/apply", tags=_TAG)
def apply_credit(
    note_id: str,
    body: ApplyCredit,
    db: Session = Depends(get_db),
    user: User = Depends(require_manager),
):
    """Use credit on the customer's account against another of their invoices."""
    note = _note(db, note_id, lock=True)
    job = _locked_job(db, body.job_id)
    credit_notes.check_application(note, job, body.amount)
    by = _who(user)
    # Never dated before its own note (a note may be dated later than today's
    # UTC date, and an application before it would read as credit unraised).
    on = max(_today(), note.credit_date)
    application = credit_notes.apply(db, note, job, body.amount, on=on, by=by)
    _settle_money(job)
    # Its own entry: the note's stands as it was raised (ledger_postings).
    _posted(db, sync_credit_application, application, note, by=by)
    db.add(
        _system_comment(
            job, f"Credit note {note.id} applied: ${Decimal(body.amount):.2f}", by=user
        )
    )
    _recalculate_customer_balance(job.customer_id, db)
    db.commit()
    db.refresh(note)
    return _out(note)


@router.post("/credit-notes/{note_id}/lines/{line_id}/inspect", tags=["returns"])
def inspect_return(
    note_id: str,
    line_id: int,
    body: Inspect,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
):
    """Goods back at RET, inspected: back to the job's branch, or written off."""
    note = _note(db, note_id)
    line = (
        db.query(CreditNoteLine)
        .filter(CreditNoteLine.id == line_id, CreditNoteLine.credit_note_id == note.id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not line:
        raise HTTPException(
            status_code=404, detail="Line not found on that credit note"
        )
    job = db.query(Job).filter(Job.id == note.job_id).first()
    credit_notes.inspect(
        db,
        note,
        line,
        body.outcome,
        to_branch=(job.branch if job else None) or DEFAULT_BRANCH,
        on=_today(),
        by=_who(user),
    )
    if job is not None:
        done = "restocked" if body.outcome == "restock" else "written off"
        db.add(
            _system_comment(
                job,
                f"{line.qty} × {line.stock_code} back on {note.id}: {done}",
                by=user,
            )
        )
    db.commit()
    db.refresh(note)
    return _out(note)


@router.get("/returns", tags=["returns"])
def returns_waiting(
    status: Literal["waiting", "restocked", "scrapped"] = Query("waiting"),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Goods back on credit notes, by inspection: the warehouse's list. No money."""
    rows = (
        db.query(CreditNoteLine, CustomerCreditNote, Job)
        .join(
            CustomerCreditNote, CustomerCreditNote.id == CreditNoteLine.credit_note_id
        )
        .join(Job, Job.id == CustomerCreditNote.job_id)
        .filter(CreditNoteLine.inspection == status)
        # Waiting: the oldest first, to be seen to; done: the latest first.
        .order_by(
            *(
                (CustomerCreditNote.credit_date, CreditNoteLine.id)
                if status == "waiting"
                else (CreditNoteLine.inspected_at.desc(), CreditNoteLine.id.desc())
            )
        )
        .limit(500)
        .all()
    )
    return [
        {
            "credit_note_id": note.id,
            "line_id": line.id,
            "job_id": job.id,
            "customer": job.customer_name,
            "credit_date": note.credit_date,
            "stock_code": line.stock_code,
            "description": line.description,
            "qty": line.qty,
            "inspection": line.inspection,
            "inspected_by": line.inspected_by,
            "branch": job.branch,
        }
        for line, note, job in rows
    ]


@router.get("/credit-notes/{note_id}/pdf", tags=_TAG)
def credit_note_pdf(
    note_id: str, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    """The adjustment note — the ATO's name for a GST credit note."""
    note = _note(db, note_id)
    job = db.query(Job).filter(Job.id == note.job_id).first()
    return Response(
        content=adjustment_note_pdf(db, note, job),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{note.id}.pdf"'},
    )

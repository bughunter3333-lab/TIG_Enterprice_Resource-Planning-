"""Customer credit notes and the goods that come back with them.

docs/superpowers/specs/2026-11-09-returns-credit-notes.md. A credit note (the
ATO's adjustment note) credits lines of an invoiced job, priced as the job
prices them (`core/job_totals.py`). It is applied to that invoice up to what it
still owes; the rest is credit on the customer's account, applied later to
another of their invoices. What an invoice owes is its total less payments
(`deposit`) less the credit applied to it (`credited`).

A credit note credits job lines, or an amount (an invoice imported from Jim2
as a header has no lines; a price adjustment needs none).

Plain goods that come back wait in the returns area (RET) for inspection and
are not stock while they wait: nothing can promise, pick or reorder against
goods nobody has looked at. Inspected, they are restocked — into stock at the
job's branch, a `Return` movement — or written off, never having been stock.
Decorated goods are credited and never come back into stock (owner decision
S2-07, 2026-11-06).

This module works out and records; the router settles what the job owes, posts
the ledger and recalculates the customer's balance around it.
"""

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core import job_totals
from app.core.invoice_numbers import _lock_sequence
from app.core.ledger import ZERO, money
from app.core.ledger_postings import INVOICED_STATUSES
from app.core.stock_ledger import post_movement
from app.models.credit_note import (
    CreditNoteApplication,
    CreditNoteLine,
    CustomerCreditNote,
)
from app.models.inventory import InventoryItem
from app.models.job import Job, JobItem

PREFIX = "CN-"
WAITING, RESTOCKED, SCRAPPED = "waiting", "restocked", "scrapped"
OUTCOMES = {"restock": RESTOCKED, "scrap": SCRAPPED}
_NUMBER = re.compile(rf"^{re.escape(PREFIX)}(\d+)$")
_NO_DECORATION = {None, "", "None"}


@dataclass(frozen=True)
class Credit:
    """One job line to credit: how many, and whether the goods are coming back."""

    item_id: int
    qty: int
    goods_back: bool = False


def owed(job: Job) -> Decimal:
    """What an invoice still owes: its total less payments less credit applied."""
    left = money(job.total_inc) - money(job.deposit) - money(job.credited)
    return max(ZERO, left)


def applied(note: CustomerCreditNote) -> Decimal:
    return sum((money(a.amount) for a in note.applications), ZERO)


def unapplied(note: CustomerCreditNote) -> Decimal:
    """Credit on the customer's account: what has not been used on an invoice."""
    return money(note.total_inc) - applied(note)


def customer_unapplied(db: Session, customer_id: Optional[str]) -> Decimal:
    """All of a customer's credit not yet used on an invoice."""
    if not customer_id:
        return ZERO
    raised = (
        db.query(func.coalesce(func.sum(CustomerCreditNote.total_inc), 0))
        .filter(CustomerCreditNote.customer_id == customer_id)
        .scalar()
    )
    used = (
        db.query(func.coalesce(func.sum(CreditNoteApplication.amount), 0))
        .join(
            CustomerCreditNote,
            CustomerCreditNote.id == CreditNoteApplication.credit_note_id,
        )
        .filter(CustomerCreditNote.customer_id == customer_id)
        .scalar()
    )
    return money(raised) - money(used)


def has_credit_notes(db: Session, job_id: str) -> Optional[str]:
    """The number of a credit note raised against or applied to this job, if any."""
    raised = (
        db.query(CustomerCreditNote.id)
        .filter(CustomerCreditNote.job_id == job_id)
        .first()
    )
    if raised:
        return raised[0]
    used = (
        db.query(CreditNoteApplication.credit_note_id)
        .filter(CreditNoteApplication.job_id == job_id)
        .first()
    )
    return used[0] if used else None


def _next_number(db: Session) -> str:
    """CN-0001, CN-0002 …: the next after the highest used, under the lock every
    document number takes (`invoice_numbers._lock_sequence`)."""
    _lock_sequence(db)
    highest = 0
    for (number,) in db.query(CustomerCreditNote.id):
        found = _NUMBER.match(number or "")
        if found:
            highest = max(highest, int(found.group(1)))
    return f"{PREFIX}{highest + 1:04d}"


def decorated(item: JobItem, items: Iterable[JobItem]) -> bool:
    """A garment with work done to it — never back into stock.

    Its own decoration type; a logo or alteration line that applies to it; or
    a logo line that names no garment, which decorates every garment on the
    job, as the production board reads it (`production_board.decorations`).
    """
    if (item.decoration_type or None) not in _NO_DECORATION:
        return True
    for other in items:
        if other is item:
            continue
        if other.applies_to_item_id == item.id:
            return True
        if other.logo_id is not None and other.applies_to_item_id is None:
            return True
    return False


def _already(db: Session, item_id: int, goods_back_only: bool = False) -> int:
    q = db.query(func.coalesce(func.sum(CreditNoteLine.qty), 0)).filter(
        CreditNoteLine.job_item_id == item_id
    )
    if goods_back_only:
        q = q.filter(CreditNoteLine.goods_back.is_(True))
    return int(q.scalar() or 0)


def _stand_in(item: JobItem, qty: int) -> SimpleNamespace:
    """The line at the credited quantity, for the job's own pricing rule."""
    return SimpleNamespace(
        order_qty=qty,
        price_ex=item.price_ex,
        price_inc=item.price_inc,
        priced_inc=bool(item.priced_inc),
    )


def _credited_before(db: Session, job_id: str) -> job_totals.Totals:
    ex, tax, inc = (
        db.query(
            func.coalesce(func.sum(CustomerCreditNote.total_ex), 0),
            func.coalesce(func.sum(CustomerCreditNote.tax), 0),
            func.coalesce(func.sum(CustomerCreditNote.total_inc), 0),
        )
        .filter(CustomerCreditNote.job_id == job_id)
        .one()
    )
    return job_totals.Totals(money(ex), money(tax), money(inc))


def left_to_credit(db: Session, job: Job) -> job_totals.Totals:
    """What of an invoice no credit note has credited yet."""
    before = _credited_before(db, job.id)
    return job_totals.Totals(
        money(job.total_ex) - before.ex,
        money(job.tax) - before.tax,
        money(job.total_inc) - before.inc,
    )


def _note_totals(
    db: Session, job: Job, stand_ins: list, credits_all: bool
) -> job_totals.Totals:
    """The note's money: its lines at the job's pricing rule, never more than
    the invoice has left to credit. The note that credits everything left takes
    exactly what is left, so an invoice credited in full nets to the cent."""
    left = left_to_credit(db, job)
    worked = job_totals.from_lines(stand_ins)
    if credits_all or worked.inc > left.inc:
        return left
    return worked


def _amount_totals(db: Session, job: Job, amount: Decimal) -> job_totals.Totals:
    """An amount (inc GST) credited with no lines: GST in the invoice's own
    proportion of what is left, so a GST-free invoice credits no GST; the whole
    of what is left takes it to the cent."""
    left = left_to_credit(db, job)
    amount = money(amount)
    if amount > left.inc:
        raise HTTPException(
            status_code=422,
            detail=f"Job {job.id} has ${left.inc:.2f} left to credit.",
        )
    if amount == left.inc:
        return left
    tax = money(amount * left.tax / left.inc) if left.inc > ZERO else ZERO
    return job_totals.Totals(amount - tax, tax, amount)


def _check_line(db: Session, job: Job, item: Optional[JobItem], credit: Credit):
    if item is None or item.job_id != job.id:
        raise HTTPException(
            status_code=422,
            detail=f"Line {credit.item_id} is not on job {job.id}.",
        )
    left = int(item.order_qty or 0) - _already(db, item.id)
    if credit.qty > left:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{item.stock_code or 'Line'}: {credit.qty} credited, but only "
                f"{max(left, 0)} of it is left to credit."
            ),
        )
    if not credit.goods_back:
        return
    if item.is_service:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{item.stock_code or 'This line'} is a decoration or a charge — "
                "it is credited as money only; nothing comes back."
            ),
        )
    sent = int(item.supply_qty or 0) - _already(db, item.id, goods_back_only=True)
    if credit.qty > sent:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{item.stock_code}: {credit.qty} coming back, but only "
                f"{max(sent, 0)} went out on this job and has not come back."
            ),
        )


def raise_note(
    db: Session,
    job: Job,
    credits: list[Credit],
    *,
    reason: Optional[str],
    credit_date: str,
    by: str,
    amount: Optional[Decimal] = None,
) -> CustomerCreditNote:
    """Credit lines of an invoiced job, or an amount; plain goods back wait in
    the returns area for inspection.

    The caller holds the job locked, and applies the note (`apply`).
    """
    if job.status not in INVOICED_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"Job {job.id} is {job.status} — only an invoice is credited.",
        )
    if bool(credits) == (amount is not None):
        raise HTTPException(
            status_code=422,
            detail="Credit lines of the invoice, or an amount — one or the other.",
        )
    if amount is not None:
        totals = _amount_totals(db, job, amount)
        return _record(db, job, totals, reason, credit_date, by)
    if len({c.item_id for c in credits}) != len(credits):
        raise HTTPException(
            status_code=422, detail="Each line is credited once on a credit note."
        )
    items = {item.id: item for item in job.items}
    for credit in credits:
        _check_line(db, job, items.get(credit.item_id), credit)

    stand_ins = [_stand_in(items[c.item_id], c.qty) for c in credits]
    credits_all = all(
        int(item.order_qty or 0) - _already(db, item.id)
        == next((c.qty for c in credits if c.item_id == item.id), 0)
        for item in job.items
        if int(item.order_qty or 0) > 0
    )
    totals = _note_totals(db, job, stand_ins, credits_all)
    note = _record(db, job, totals, reason, credit_date, by)
    for credit, stand_in in zip(credits, stand_ins):
        item = items[credit.item_id]
        line_totals = job_totals.from_lines([stand_in])
        plain = credit.goods_back and not decorated(item, job.items)
        line = CreditNoteLine(
            credit_note_id=note.id,
            job_item_id=item.id,
            stock_code=item.stock_code,
            description=item.description,
            qty=credit.qty,
            total_ex=line_totals.ex,
            tax=line_totals.tax,
            total_inc=line_totals.inc,
            goods_back=credit.goods_back,
            restockable=False,
            inspection=None,
        )
        # Waiting, not stock: it enters stock only when inspected and restocked.
        # A code that is no stock item (an indent) has no shelf to go back to.
        if plain and _stock_item(db, item.stock_code):
            line.restockable = True
            line.inspection = WAITING
        note.lines.append(line)
    db.flush()
    return note


def _stock_item(db: Session, sku: Optional[str]) -> bool:
    if not sku:
        return False
    found = db.query(InventoryItem.sku).filter(InventoryItem.sku == sku).first()
    return found is not None


def _record(
    db: Session,
    job: Job,
    totals: job_totals.Totals,
    reason: Optional[str],
    credit_date: str,
    by: str,
) -> CustomerCreditNote:
    if totals.inc <= ZERO:
        raise HTTPException(status_code=422, detail="There is nothing to credit.")
    note = CustomerCreditNote(
        id=_next_number(db),
        customer_id=job.customer_id,
        job_id=job.id,
        credit_date=credit_date,
        reason=(reason or "").strip() or None,
        total_ex=totals.ex,
        tax=totals.tax,
        total_inc=totals.inc,
        created_by=by,
    )
    db.add(note)
    db.flush()
    return note


def apply(
    db: Session,
    note: CustomerCreditNote,
    job: Job,
    amount: Decimal,
    *,
    on: str,
    by: str,
) -> Optional[CreditNoteApplication]:
    """Use `amount` of the note's credit on `job`'s invoice.

    The caller holds both locked and has checked the amount; this records it on
    the invoice (`credited`). Nothing at all is a no-op, not an application.
    """
    amount = money(amount)
    if amount <= ZERO:
        return None
    application = CreditNoteApplication(
        credit_note_id=note.id,
        job_id=job.id,
        amount=amount,
        applied_on=on,
        applied_by=by,
    )
    note.applications.append(application)
    job.credited = money(job.credited) + amount
    db.flush()
    return application


def check_application(note: CustomerCreditNote, job: Job, amount: Decimal) -> None:
    """Credit on account goes on another invoice of the same customer, up to
    what it owes and what is left of the credit."""
    if job.customer_id != note.customer_id:
        raise HTTPException(
            status_code=409,
            detail=f"Job {job.id} is another customer's — credit stays with its customer.",
        )
    if job.status not in INVOICED_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"Job {job.id} is {job.status} — credit is used on an invoice.",
        )
    amount = money(amount)
    if amount <= ZERO:
        raise HTTPException(status_code=422, detail="Apply an amount above nothing.")
    if amount > unapplied(note):
        raise HTTPException(
            status_code=422,
            detail=f"{note.id} has ${unapplied(note):.2f} left to apply.",
        )
    if amount > owed(job):
        raise HTTPException(
            status_code=422,
            detail=f"Job {job.id} owes ${owed(job):.2f}.",
        )


def inspect(
    db: Session,
    note: CustomerCreditNote,
    line: CreditNoteLine,
    outcome: str,
    *,
    to_branch: str,
    on: str,
    by: str,
) -> None:
    """Restock goods waiting for inspection into stock at `to_branch`, or
    write them off — they were never stock, so nothing moves.

    Once only: the goods are either back on a shelf or gone.
    """
    if line.inspection != WAITING:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{line.stock_code} on {note.id} is "
                f"{line.inspection or 'not waiting for inspection'}."
            ),
        )
    if outcome == "restock":
        back = post_movement(
            db,
            sku=line.stock_code,
            movement_type="Return",
            branch=to_branch,
            quantity=int(line.qty),
            date=on,
            reference=note.id,
            job_id=note.job_id,
            notes=f"Returned on {note.id}, inspected and restocked",
        )
        if back is None:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"{line.stock_code} is no longer a stock item — write it off, "
                    "or set the stock item up again first."
                ),
            )
    line.inspection = OUTCOMES[outcome]
    line.inspected_by = by
    line.inspected_at = datetime.now(timezone.utc)


# ── Reports ──────────────────────────────────────────────────────────────────


def in_period(
    db: Session,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    customer_id: Optional[str] = None,
) -> list[CustomerCreditNote]:
    """Credit notes dated in a period (ISO days, either end open): what the
    sales and GST reports take off the invoices of the same period."""
    q = db.query(CustomerCreditNote)
    if date_from:
        q = q.filter(CustomerCreditNote.credit_date >= date_from[:10])
    if date_to:
        q = q.filter(CustomerCreditNote.credit_date <= date_to[:10])
    if customer_id:
        q = q.filter(CustomerCreditNote.customer_id == customer_id)
    return q.order_by(CustomerCreditNote.credit_date, CustomerCreditNote.id).all()


def statement_line(note: CustomerCreditNote) -> dict:
    """A credit note on a customer's statement: its credit, what of it has been
    used on invoices, and what is left on their account — so amount less used
    is the balance, as for an invoice amount less what settled it."""
    return {
        "job_id": note.job_id,
        "invoice_no": note.id,
        "date": note.credit_date,
        "due": None,
        "description": f"Credit note — {note.reason or ''}".rstrip(" —"),
        "total_inc": -float(money(note.total_inc)),
        "paid": -float(applied(note)),
        "credited": 0.0,
        "balance": -float(unapplied(note)),
        "status": "CREDIT",
    }

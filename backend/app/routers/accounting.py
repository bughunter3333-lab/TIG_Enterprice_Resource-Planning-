"""The general ledger's API: chart, journals, statements, lock date, backfill.

Reading is for admins and managers — a profit and loss with wages in it is not
for every account. Writing anything that changes the books by hand (a manual
journal, the chart, the lock date, bringing history in) is for admins.
Automatic entries are never written here; they come from invoices, payments
and bills, and are corrected by correcting those.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session, joinedload

from app.core import ledger, ledger_reports
from app.core.dependencies import require_admin, require_manager, require_staff
from app.core.fiscal import current_fiscal_year
from app.core.ledger import CATEGORIES, MANUAL, Line, LedgerError, money
from app.core.ledger_postings import (
    INVOICED_STATUSES,
    sync_bill,
    sync_bill_payment,
    sync_invoice,
    sync_payment,
)
from app.database import get_db
from app.models.job import Job
from app.models.job_payment import JobPayment
from app.models.ledger import JournalEntry, JournalLine, LedgerAccount
from app.models.supplier_bill import SupplierBill
from app.models.user import User

router = APIRouter(prefix="/accounting", tags=["accounting"])


def _refuse(exc: LedgerError) -> HTTPException:
    return HTTPException(status_code=409, detail=str(exc))


def _day(value: Optional[str], default: date) -> date:
    if not value:
        return default
    parsed = ledger.parse_date(value)
    if parsed is None:
        raise HTTPException(status_code=400, detail=f"Not a date: {value!r}")
    return parsed


# ── Chart of accounts ────────────────────────────────────────────────────────


def _account(a: LedgerAccount, balance=None) -> dict:
    return {
        "id": a.id,
        "code": a.code,
        "name": a.name,
        "category": a.category,
        "role": a.role,
        "is_active": a.is_active,
        "description": a.description,
        "balance": ledger_reports.f(balance) if balance is not None else None,
    }


class AccountCreate(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=100)
    category: str
    description: Optional[str] = None

    @field_validator("category")
    @classmethod
    def known_category(cls, v: str) -> str:
        if v not in CATEGORIES:
            raise ValueError(f"category must be one of {', '.join(CATEGORIES)}")
        return v


class AccountUpdate(BaseModel):
    # No category: moving an account that has postings between, say, expense
    # and asset would silently rewrite every past profit and loss.
    code: Optional[str] = Field(default=None, min_length=1, max_length=20)
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/accounts")
def list_accounts(
    as_at: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    balances = ledger_reports.account_balances(db, _day(as_at, date.today()))
    accounts = db.query(LedgerAccount).order_by(LedgerAccount.code).all()
    db.commit()  # keeps the chart if this was the first read and it was seeded
    return [_account(a, balances.get(a.id)) for a in accounts]


@router.get("/accounts/options")
def account_options(
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    """The accounts a bill can be coded to — names only, no balances.

    Staff enter bills, and the full chart is manager-only because it carries
    balances, the bank's among them. This is the least a bill form needs.
    """
    ledger.ensure_chart(db)
    accounts = (
        db.query(LedgerAccount)
        .filter(
            LedgerAccount.is_active.is_(True),
            LedgerAccount.category.in_(["cost_of_sales", "expense"]),
        )
        .order_by(LedgerAccount.code)
        .all()
    )
    db.commit()
    return [
        {"id": a.id, "code": a.code, "name": a.name, "category": a.category}
        for a in accounts
    ]


@router.post("/accounts", status_code=201)
def create_account(
    body: AccountCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    ledger.ensure_chart(db)
    if db.query(LedgerAccount).filter(LedgerAccount.code == body.code).first():
        raise HTTPException(
            status_code=409, detail=f"Account {body.code} already exists"
        )
    account = LedgerAccount(
        code=body.code.strip(),
        name=body.name.strip(),
        category=body.category,
        role=None,
        is_active=True,
        description=body.description,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return _account(account)


@router.patch("/accounts/{account_id}")
def update_account(
    account_id: int,
    body: AccountUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    account = db.get(LedgerAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if body.is_active is False and account.role:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{account.name} is where the system posts {account.role.replace('_', ' ')} "
                "and cannot be deactivated"
            ),
        )
    if body.code and body.code != account.code:
        if db.query(LedgerAccount).filter(LedgerAccount.code == body.code).first():
            raise HTTPException(
                status_code=409, detail=f"Account {body.code} already exists"
            )
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return _account(account)


# ── Journals ─────────────────────────────────────────────────────────────────


def _entry(e: JournalEntry) -> dict:
    total = sum((money(ln.debit) for ln in e.lines), ledger.ZERO)
    return {
        "id": e.id,
        "number": ledger.entry_number(e),
        "date": e.entry_date.isoformat(),
        "memo": e.memo,
        "source_type": e.source_type,
        "source_id": e.source_id,
        "reverses_id": e.reverses_id,
        "reversed_by_id": e.reversed_by_id,
        "created_by": e.created_by,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "total": ledger_reports.f(total),
        "lines": [
            {
                "id": ln.id,
                "account_id": ln.account_id,
                "account_code": ln.account.code,
                "account_name": ln.account.name,
                "debit": ledger_reports.f(ln.debit),
                "credit": ledger_reports.f(ln.credit),
                "description": ln.description,
                "party_type": ln.party_type,
                "party_id": ln.party_id,
                "job_id": ln.job_id,
            }
            for ln in e.lines
        ],
    }


@router.get("/journals")
def list_journals(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
    account_id: Optional[int] = Query(None),
    source_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    q = db.query(JournalEntry).options(
        joinedload(JournalEntry.lines).joinedload(JournalLine.account)
    )
    if date_from:
        q = q.filter(JournalEntry.entry_date >= _day(date_from, date.today()))
    if date_to:
        q = q.filter(JournalEntry.entry_date <= _day(date_to, date.today()))
    if source_type:
        q = q.filter(JournalEntry.source_type == source_type)
    if source_id:
        q = q.filter(JournalEntry.source_id == source_id)
    if account_id:
        q = q.filter(
            JournalEntry.id.in_(
                db.query(JournalLine.entry_id).filter(
                    JournalLine.account_id == account_id
                )
            )
        )
    total = q.order_by(None).count()
    entries = (
        q.order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {"total": total, "entries": [_entry(e) for e in entries]}


@router.get("/journals/{entry_id}")
def get_journal(
    entry_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    entry = db.get(JournalEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return _entry(entry)


class JournalLineIn(BaseModel):
    account_id: int
    debit: float = 0
    credit: float = 0
    description: Optional[str] = None


class JournalIn(BaseModel):
    entry_date: str
    memo: str = Field(min_length=1, max_length=255)
    lines: list[JournalLineIn] = Field(min_length=2)


@router.post("/journals", status_code=201)
def post_manual_journal(
    body: JournalIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """A journal a person writes: rent, wages, bank fees, depreciation."""
    lines = []
    for i, line in enumerate(body.lines, start=1):
        debit, credit = money(line.debit), money(line.credit)
        # Checked here rather than left to the netting in post(): a line with
        # both sides filled in is a typing mistake, not a net amount.
        if debit < 0 or credit < 0:
            raise HTTPException(
                status_code=400, detail=f"Line {i}: amounts cannot be negative"
            )
        if debit > 0 and credit > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Line {i}: a line is a debit or a credit, not both",
            )
        account = db.get(LedgerAccount, line.account_id)
        if account is None:
            raise HTTPException(status_code=400, detail=f"Line {i}: no such account")
        lines.append(Line(account, debit - credit, line.description))
    try:
        entry = ledger.post(
            db,
            entry_date=_day(body.entry_date, date.today()),
            memo=body.memo,
            lines=lines,
            created_by=current_user.full_name or current_user.username,
        )
    except LedgerError as exc:
        raise _refuse(exc) from exc
    db.commit()
    return _entry(db.get(JournalEntry, entry.id))


class ReverseIn(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=200)


@router.post("/journals/{entry_id}/reverse", status_code=201)
def reverse_manual_journal(
    entry_id: int,
    body: ReverseIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    entry = db.get(JournalEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    if entry.source_type != MANUAL:
        # An invoice's entry belongs to the invoice. Reversing it here would
        # leave the job saying "invoiced" and the ledger saying otherwise.
        raise HTTPException(
            status_code=409,
            detail=(
                f"This entry was posted by {entry.source_type.replace('_', ' ')} "
                f"{entry.source_id}. Change or cancel that instead, and the ledger follows."
            ),
        )
    try:
        mirror = ledger.reverse(
            db,
            entry,
            created_by=current_user.full_name or current_user.username,
            reason=body.reason,
        )
    except LedgerError as exc:
        raise _refuse(exc) from exc
    db.commit()
    return _entry(db.get(JournalEntry, mirror.id))


# ── Reports ──────────────────────────────────────────────────────────────────


def _fy_range(date_from: Optional[str], date_to: Optional[str]) -> tuple[date, date]:
    fy_start, fy_end = current_fiscal_year()
    return _day(date_from, fy_start), _day(date_to, min(fy_end, date.today()))


@router.get("/reports/trial-balance")
def trial_balance(
    as_at: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    return ledger_reports.trial_balance(db, _day(as_at, date.today()))


@router.get("/reports/profit-loss")
def profit_loss(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    return ledger_reports.profit_and_loss(db, *_fy_range(date_from, date_to))


@router.get("/reports/balance-sheet")
def balance_sheet(
    as_at: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    return ledger_reports.balance_sheet(db, _day(as_at, date.today()))


@router.get("/reports/general-ledger/{account_id}")
def general_ledger(
    account_id: int,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    account = db.get(LedgerAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return ledger_reports.general_ledger(db, account, *_fy_range(date_from, date_to))


@router.get("/reports/bas")
def bas(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    return ledger_reports.bas(db, *_fy_range(date_from, date_to))


@router.get("/health")
def health(db: Session = Depends(get_db), _: User = Depends(require_manager)):
    return ledger_reports.health(db)


# ── Lock date ────────────────────────────────────────────────────────────────


class LockDateIn(BaseModel):
    lock_date: Optional[str] = None


@router.get("/lock-date")
def get_lock_date(db: Session = Depends(get_db), _: User = Depends(require_manager)):
    locked = ledger.lock_date(db)
    return {"lock_date": locked.isoformat() if locked else None}


@router.put("/lock-date")
def put_lock_date(
    body: LockDateIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    value = _day(body.lock_date, date.today()) if body.lock_date else None
    if value is not None and value >= date.today():
        # A lock that covers today stops the shop invoicing, taking payments
        # and entering bills — every automatic entry would be refused.
        raise HTTPException(
            status_code=400,
            detail="The lock date must be before today, or nothing could be invoiced or paid",
        )
    ledger.set_lock_date(db, value)
    db.commit()
    return {"lock_date": value.isoformat() if value else None}


# ── Bringing history into the ledger ─────────────────────────────────────────


@router.post("/backfill")
def backfill(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Post every invoice, payment and bill that predates the ledger.

    Safe to run more than once: each document is synced, and a document whose
    entry already stands is left alone. Anything dated inside a locked period is
    posted on today's date instead, and counted separately so it is visible.
    """
    who = f"Backfill by {current_user.full_name or current_user.username}"
    before = db.query(JournalEntry).count()
    try:
        for job in db.query(Job).filter(Job.status.in_(list(INVOICED_STATUSES))):
            sync_invoice(db, job, created_by=who)
        jobs = {j.id: j for j in db.query(Job)}
        for payment in db.query(JobPayment).order_by(JobPayment.id):
            sync_payment(db, payment, jobs.get(payment.job_id), created_by=who)
        for bill in db.query(SupplierBill).order_by(SupplierBill.id):
            sync_bill(db, bill, created_by=who)
            sync_bill_payment(db, bill, created_by=who)
    except LedgerError as exc:
        db.rollback()
        raise _refuse(exc) from exc
    created = db.query(JournalEntry).count() - before
    db.commit()
    return {"entries_posted": created, "health": ledger_reports.health(db)}

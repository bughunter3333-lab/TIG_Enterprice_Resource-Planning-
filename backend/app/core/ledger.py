"""The general ledger's one door.

Every journal entry is written by `post()`, and `post()` is where the rules
live. They are the rules every open-source ERP reviewed for this design agrees
on (ERPNext, Odoo, Tryton — see docs/superpowers/specs/2026-09-25-general-
ledger-design.md):

- an entry has at least two lines, each a debit or a credit to one account;
- amounts are whole cents and never negative on either side;
- total debits equal total credits, exactly;
- every account exists and is active;
- nothing is dated on or before the lock date;
- an entry is never edited or deleted — `reverse()` writes its mirror image.

Lines are built as signed amounts (positive debits, negative credits) and split
by sign on the way in. A negative invoice therefore becomes a credit note with
no special case anywhere.
"""

from dataclasses import dataclass
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models.admin_setting import AdminSetting
from app.models.ledger import JournalEntry, JournalLine, LedgerAccount

CENT = Decimal("0.01")
ZERO = Decimal("0.00")

CATEGORIES = ("asset", "liability", "equity", "income", "cost_of_sales", "expense")
# The side on which an account in each category normally carries its balance.
DEBIT_NORMAL = frozenset({"asset", "cost_of_sales", "expense"})

LOCK_DATE_KEY = "ledger_lock_date"
MANUAL = "manual"

# Australian small-business chart, Xero-style numbering. The fourth column is
# the role the posting code asks for; accounts without one are there for people
# to post manual journals and bills to.
DEFAULT_CHART = (
    ("1000", "Business Bank Account", "asset", "bank"),
    ("1100", "Accounts Receivable", "asset", "receivable"),
    ("1200", "Inventory", "asset", "inventory"),
    ("1400", "GST Paid", "asset", "gst_paid"),
    ("2000", "Accounts Payable", "liability", "payable"),
    ("2100", "GST Collected", "liability", "gst_collected"),
    ("2200", "PAYG Withholding Payable", "liability", None),
    ("2300", "Superannuation Payable", "liability", None),
    ("3000", "Owner's Capital", "equity", None),
    ("3100", "Retained Earnings", "equity", "retained_earnings"),
    ("3900", "Opening Balance Equity", "equity", "opening_balance"),
    ("4000", "Sales", "income", "sales"),
    ("4900", "Other Income", "income", None),
    ("5000", "Purchases", "cost_of_sales", "purchases"),
    ("5100", "Decoration Subcontract", "cost_of_sales", None),
    ("5200", "Freight Inwards", "cost_of_sales", None),
    ("6000", "General Expenses", "expense", "default_expense"),
    ("6100", "Rent", "expense", None),
    ("6200", "Wages & Salaries", "expense", None),
    ("6210", "Superannuation", "expense", None),
    ("6300", "Bank Fees", "expense", None),
    ("6400", "Utilities", "expense", None),
    ("6500", "Motor Vehicle", "expense", None),
    ("6900", "Rounding", "expense", "rounding"),
)


class LedgerError(ValueError):
    """A posting that would break one of the ledger's rules."""


class LedgerLocked(LedgerError):
    """A posting dated inside a period that has been closed."""


def money(value) -> Decimal:
    """Whole cents, rounded half-up — the way a person rounds money."""
    if value is None or value == "":
        return ZERO
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def parse_date(value) -> Optional[date]:
    """The operational tables hold dates as text, in more than one shape."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt, width in (("%Y-%m-%d", 10), ("%d/%m/%Y", 10)):
        try:
            return datetime.strptime(text[:width], fmt).date()
        except ValueError:
            continue
    return None


@dataclass(frozen=True)
class Line:
    """One line before it is posted. Positive is a debit, negative a credit."""

    account: LedgerAccount
    amount: Decimal
    description: Optional[str] = None
    party_type: Optional[str] = None
    party_id: Optional[str] = None
    job_id: Optional[str] = None


# ── Chart ────────────────────────────────────────────────────────────────────


def ensure_chart(db: Session) -> None:
    """Create any default account whose role or code is missing. Idempotent."""
    have_roles = {r for (r,) in db.query(LedgerAccount.role) if r}
    have_codes = {c for (c,) in db.query(LedgerAccount.code)}
    for code, name, category, role in DEFAULT_CHART:
        if (role and role in have_roles) or code in have_codes:
            continue
        db.add(
            LedgerAccount(
                code=code,
                name=name,
                category=category,
                role=role,
                is_active=True,
                description=None,
            )
        )
    db.flush()


def account_for(db: Session, role: str) -> LedgerAccount:
    account = db.query(LedgerAccount).filter(LedgerAccount.role == role).first()
    if account is None:
        ensure_chart(db)
        account = db.query(LedgerAccount).filter(LedgerAccount.role == role).first()
    if account is None:
        raise LedgerError(f"No account holds the {role!r} role")
    return account


def normal_balance(account: LedgerAccount, debit: Decimal, credit: Decimal) -> Decimal:
    """A balance expressed on the side the account normally carries it."""
    return debit - credit if account.category in DEBIT_NORMAL else credit - debit


# ── Lock date ────────────────────────────────────────────────────────────────


def lock_date(db: Session) -> Optional[date]:
    row = db.get(AdminSetting, LOCK_DATE_KEY)
    return parse_date(row.value) if row and row.value else None


def set_lock_date(db: Session, value: Optional[date]) -> None:
    row = db.get(AdminSetting, LOCK_DATE_KEY)
    text = value.isoformat() if value else None
    if row is None:
        db.add(AdminSetting(key=LOCK_DATE_KEY, value=text))
    else:
        row.value = text
    db.flush()


def open_date(db: Session, wanted: Optional[date]) -> date:
    """The date to post on: the one asked for, unless its period is closed.

    A document dated inside a locked period — an invoice re-issued after its
    month was closed, say — posts on today's date instead of being refused. The
    period stays closed, and the shop can still invoice.
    """
    today = date.today()
    wanted = wanted or today
    locked = lock_date(db)
    if locked and wanted <= locked:
        return today
    return wanted


# ── Entries ──────────────────────────────────────────────────────────────────


def entry_number(entry: JournalEntry) -> str:
    return f"JE-{entry.id:06d}"


def active_entry(
    db: Session, source_type: str, source_id: str
) -> Optional[JournalEntry]:
    """The one entry currently standing for a document, if any."""
    return (
        db.query(JournalEntry)
        .filter(
            JournalEntry.source_type == source_type,
            JournalEntry.source_id == str(source_id),
            JournalEntry.reverses_id.is_(None),
            JournalEntry.reversed_by_id.is_(None),
        )
        .first()
    )


def _split(lines: Iterable[Line]) -> list[tuple[Line, Decimal, Decimal]]:
    """Each non-zero line with its amount on the right side, in whole cents."""
    split = []
    for line in lines:
        amount = money(line.amount)
        if amount == ZERO:
            continue
        debit, credit = (amount, ZERO) if amount > 0 else (ZERO, -amount)
        split.append((line, debit, credit))
    return split


def post(
    db: Session,
    *,
    entry_date: date,
    memo: Optional[str],
    lines: Iterable[Line],
    created_by: str,
    source_type: str = MANUAL,
    source_id: Optional[str] = None,
    reverses: Optional[JournalEntry] = None,
) -> JournalEntry:
    """Write one balanced entry, or refuse. Nothing is written on refusal."""
    split = _split(lines)
    if len(split) < 2:
        raise LedgerError("An entry needs at least two non-zero lines")

    debits = sum((d for _, d, _ in split), ZERO)
    credits = sum((c for _, _, c in split), ZERO)
    if debits != credits:
        raise LedgerError(
            f"Debits ({debits}) do not equal credits ({credits}); "
            f"out by {abs(debits - credits)}"
        )

    for line, _, _ in split:
        if line.account is None or not line.account.is_active:
            name = line.account.name if line.account else "missing account"
            raise LedgerError(f"Cannot post to an inactive account: {name}")

    locked = lock_date(db)
    if locked and entry_date <= locked:
        raise LedgerLocked(
            f"The books are locked up to {locked.isoformat()}; "
            f"an entry dated {entry_date.isoformat()} cannot be posted"
        )

    if source_type != MANUAL and source_id is not None and reverses is None:
        if active_entry(db, source_type, source_id) is not None:
            raise LedgerError(
                f"{source_type} {source_id} already has a posted entry; "
                "reverse it before posting again"
            )

    entry = JournalEntry(
        entry_date=entry_date,
        memo=(memo or "")[:255] or None,
        source_type=source_type,
        source_id=str(source_id) if source_id is not None else None,
        reverses_id=reverses.id if reverses is not None else None,
        created_by=created_by,
    )
    db.add(entry)
    db.flush()
    for line, debit, credit in split:
        db.add(
            JournalLine(
                entry_id=entry.id,
                account_id=line.account.id,
                debit=debit,
                credit=credit,
                description=(line.description or "")[:255] or None,
                party_type=line.party_type,
                party_id=str(line.party_id) if line.party_id is not None else None,
                job_id=str(line.job_id) if line.job_id is not None else None,
            )
        )
    db.flush()
    db.refresh(entry)
    return entry


def reverse(
    db: Session,
    entry: JournalEntry,
    *,
    created_by: str,
    entry_date: Optional[date] = None,
    reason: Optional[str] = None,
) -> JournalEntry:
    """Post the mirror image of `entry`, dated when the correction is made.

    Dated today rather than on the original date, so a correction never
    reaches back into a period that has been closed.
    """
    if entry.reverses_id is not None:
        raise LedgerError(f"{entry_number(entry)} is itself a reversal")
    if entry.reversed_by_id is not None:
        raise LedgerError(f"{entry_number(entry)} has already been reversed")

    memo = f"Reversal of {entry_number(entry)}"
    if reason:
        memo += f": {reason}"
    mirror = post(
        db,
        entry_date=entry_date or date.today(),
        memo=memo,
        lines=[
            Line(
                account=line.account,
                amount=money(line.credit) - money(line.debit),
                description=line.description,
                party_type=line.party_type,
                party_id=line.party_id,
                job_id=line.job_id,
            )
            for line in entry.lines
        ],
        created_by=created_by,
        source_type=entry.source_type,
        source_id=entry.source_id,
        reverses=entry,
    )
    entry.reversed_by_id = mirror.id
    db.flush()
    return mirror


def matches(entry: JournalEntry, lines: Iterable[Line]) -> bool:
    """Whether an existing entry already says what these lines would say."""

    def key(account_id, debit, credit, party_type, party_id, job_id):
        return (
            account_id,
            money(debit),
            money(credit),
            party_type,
            str(party_id) if party_id is not None else None,
            str(job_id) if job_id is not None else None,
        )

    wanted = sorted(
        key(ln.account.id, d, c, ln.party_type, ln.party_id, ln.job_id)
        for ln, d, c in _split(lines)
    )
    have = sorted(
        key(ln.account_id, ln.debit, ln.credit, ln.party_type, ln.party_id, ln.job_id)
        for ln in entry.lines
    )
    return wanted == have


def sync(
    db: Session,
    *,
    source_type: str,
    source_id: str,
    lines: Optional[list[Line]],
    entry_date: Optional[date],
    memo: str,
    created_by: str,
) -> Optional[JournalEntry]:
    """Make the ledger say what a document currently says.

    `lines` of None means the document should have no entry standing — it was
    un-invoiced, deleted, or zeroed. Otherwise the standing entry is kept if it
    already matches, and reversed and replaced if it does not. Every hook into
    an operational document calls this rather than `post()`, which is what makes
    the hooks safe to call more than once: a second call with nothing changed
    writes nothing.
    """
    current = active_entry(db, source_type, source_id)
    if lines is None or len(_split(lines)) < 2:
        if current is not None:
            reverse(db, current, created_by=created_by, reason=f"{memo} withdrawn")
        return None
    if current is not None:
        if matches(current, lines):
            return current
        reverse(db, current, created_by=created_by, reason=f"{memo} changed")
    return post(
        db,
        entry_date=open_date(db, entry_date),
        memo=memo,
        lines=lines,
        created_by=created_by,
        source_type=source_type,
        source_id=source_id,
    )


def balanced(db: Session, lines: list[Line], description: str) -> list[Line]:
    """Add a rounding line for whatever cent-level residue the source carries.

    A job whose total, ex-GST amount and GST disagree by a cent is a data
    problem worth surfacing — it shows up as a balance on the Rounding account —
    but not one worth refusing to invoice over.
    """
    residue = -sum((money(line.amount) for line in lines), ZERO)
    if residue != ZERO:
        lines = [*lines, Line(account_for(db, "rounding"), residue, description)]
    return lines

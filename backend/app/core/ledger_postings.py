"""What each operational document says to the ledger.

One function per document describes the entry it should have standing right
now — or `None` for no entry — and `ledger.sync` makes the ledger agree. The
hooks in the job, payment and bill endpoints call only the `sync_*` functions,
never `ledger.post` directly, so calling one twice with nothing changed writes
nothing, and calling it after an edit replaces a stale entry with a correct one.

Amounts are derived so an automatic entry always balances without a rounding
line: the customer's total including GST is what they owe, GST is what the
invoice states, and the income is the difference. The GST figure — the one BAS
reads — is therefore always exactly what the document says.
"""

from typing import Optional

from sqlalchemy.orm import Session

from app.core.ledger import (
    ZERO,
    Line,
    LedgerError,
    account_for,
    active_entry,
    money,
    parse_date,
    sync,
)
from app.models.ledger import JournalEntry, LedgerAccount

SYSTEM = "System"

# The statuses in which a job has been invoiced. The same boundary stock uses
# for "shipped" (`_DEPLETED_STATUSES` in routers/jobs.py) — a test holds the two
# equal, so un-invoicing puts back the revenue exactly when it puts back stock.
INVOICED_STATUSES = frozenset({"INVOICE", "PAID"})


def _customer_total(total_inc, total_ex, tax):
    total_inc, total_ex, tax = money(total_inc), money(total_ex), money(tax)
    # An invoice whose inclusive total was never computed still owes ex + GST.
    return (total_inc if total_inc != ZERO else total_ex + tax), tax


# ── Invoices ─────────────────────────────────────────────────────────────────


def invoice_lines(db: Session, job) -> Optional[list[Line]]:
    if job.status not in INVOICED_STATUSES:
        return None
    owed, gst = _customer_total(job.total_inc, job.total_ex, job.tax)
    if owed == ZERO and gst == ZERO:
        return None
    label = f"Invoice {job.id}"
    return [
        Line(
            account_for(db, "receivable"),
            owed,
            label,
            "customer",
            job.customer_id,
            job.id,
        ),
        Line(
            account_for(db, "sales"),
            -(owed - gst),
            label,
            "customer",
            job.customer_id,
            job.id,
        ),
        Line(
            account_for(db, "gst_collected"),
            -gst,
            f"GST on {label.lower()}",
            None,
            None,
            job.id,
        ),
    ]


def sync_invoice(db: Session, job, created_by: str = SYSTEM) -> Optional[JournalEntry]:
    return sync(
        db,
        source_type="invoice",
        source_id=job.id,
        lines=invoice_lines(db, job),
        entry_date=parse_date(job.invoice_date),
        memo=f"Invoice {job.id} — {job.customer_name or job.customer_id or 'customer'}",
        created_by=created_by,
    )


# ── Customer payments ────────────────────────────────────────────────────────


def payment_lines(db: Session, payment, job) -> Optional[list[Line]]:
    amount = money(payment.amount)
    if amount == ZERO:
        return None
    customer = job.customer_id if job is not None else None
    how = " ".join(p for p in (payment.method, payment.reference) if p)
    return [
        Line(
            account_for(db, "bank"),
            amount,
            f"Payment {how}".strip(),
            "customer",
            customer,
            payment.job_id,
        ),
        Line(
            account_for(db, "receivable"),
            -amount,
            f"Payment on {payment.job_id}",
            "customer",
            customer,
            payment.job_id,
        ),
    ]


def sync_payment(
    db: Session, payment, job, created_by: str = SYSTEM
) -> Optional[JournalEntry]:
    return sync(
        db,
        source_type="payment",
        source_id=str(payment.id),
        lines=payment_lines(db, payment, job),
        entry_date=parse_date(payment.received_date),
        memo=f"Payment received on {payment.job_id}",
        created_by=created_by,
    )


# ── Supplier bills ───────────────────────────────────────────────────────────


def _supplier(bill) -> Optional[str]:
    return bill.supplier_id or bill.supplier_name


def bill_account(db: Session, bill) -> LedgerAccount:
    """Where a bill's cost goes: the account chosen on it, else by its kind.

    A bill against a purchase order is stock bought for jobs, so it is cost of
    sales; anything else lands in general expenses until someone chooses.
    """
    if getattr(bill, "account_id", None):
        chosen = db.get(LedgerAccount, bill.account_id)
        if chosen is None or not chosen.is_active:
            raise LedgerError(
                "The account chosen for this bill is not an active account"
            )
        return chosen
    return account_for(db, "purchases" if bill.po_id else "default_expense")


def bill_lines(db: Session, bill) -> Optional[list[Line]]:
    owed, gst = _customer_total(bill.amount_inc, bill.amount_ex, bill.tax)
    if owed == ZERO and gst == ZERO:
        return None
    label = f"Bill {bill.bill_number or bill.id}"
    return [
        Line(bill_account(db, bill), owed - gst, label, "supplier", _supplier(bill)),
        Line(account_for(db, "gst_paid"), gst, f"GST on {label.lower()}"),
        Line(account_for(db, "payable"), -owed, label, "supplier", _supplier(bill)),
    ]


def sync_bill(db: Session, bill, created_by: str = SYSTEM) -> Optional[JournalEntry]:
    return sync(
        db,
        source_type="bill",
        source_id=str(bill.id),
        lines=bill_lines(db, bill),
        entry_date=parse_date(bill.bill_date),
        memo=f"Bill {bill.bill_number or bill.id} — {bill.supplier_name or bill.supplier_id or 'supplier'}",
        created_by=created_by,
    )


def bill_payment_lines(db: Session, bill) -> Optional[list[Line]]:
    if bill.status != "paid":
        return None
    amount = money(bill.paid_amount)
    if amount == ZERO:
        return None
    label = f"Payment of bill {bill.bill_number or bill.id}"
    return [
        Line(account_for(db, "payable"), amount, label, "supplier", _supplier(bill)),
        Line(account_for(db, "bank"), -amount, label, "supplier", _supplier(bill)),
    ]


def sync_bill_payment(
    db: Session, bill, created_by: str = SYSTEM
) -> Optional[JournalEntry]:
    return sync(
        db,
        source_type="bill_payment",
        source_id=str(bill.id),
        lines=bill_payment_lines(db, bill),
        entry_date=parse_date(bill.paid_date),
        memo=f"Paid bill {bill.bill_number or bill.id}",
        created_by=created_by,
    )


def withdraw_bill(db: Session, bill, created_by: str = SYSTEM) -> None:
    """Reverse everything a bill posted, before the bill itself is deleted."""
    for source_type in ("bill_payment", "bill"):
        sync(
            db,
            source_type=source_type,
            source_id=str(bill.id),
            lines=None,
            entry_date=None,
            memo=f"Bill {bill.bill_number or bill.id}",
            created_by=created_by,
        )


def has_posted_invoice(db: Session, job_id: str) -> bool:
    return active_entry(db, "invoice", job_id) is not None

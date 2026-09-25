"""Financial statements, read from journal lines and nothing else.

Every figure here is a sum of posted lines. None of it goes back to jobs or
bills — that independence is the point, because it lets a report computed from
the operational tables be checked against one computed from the ledger. When
the two agree, both are right; when they disagree, one of them has found a bug.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.fiscal import get_fiscal_year_bounds
from app.core.ledger import DEBIT_NORMAL, ZERO, account_for, ensure_chart, money
from app.models.job import Job
from app.models.job_payment import JobPayment
from app.models.ledger import JournalEntry, JournalLine, LedgerAccount
from app.models.supplier_bill import SupplierBill

PROFIT_AND_LOSS = ("income", "cost_of_sales", "expense")
BALANCE_SHEET = ("asset", "liability", "equity")


def f(value: Decimal) -> float:
    """JSON carries money as numbers, the way the rest of this API does."""
    return float(money(value))


def _totals(
    db: Session,
    *,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    source_types: Optional[Iterable[str]] = None,
) -> dict[int, tuple[Decimal, Decimal]]:
    """Summed debits and credits per account over a date range."""
    q = db.query(
        JournalLine.account_id,
        func.coalesce(func.sum(JournalLine.debit), 0),
        func.coalesce(func.sum(JournalLine.credit), 0),
    ).join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
    if date_from is not None:
        q = q.filter(JournalEntry.entry_date >= date_from)
    if date_to is not None:
        q = q.filter(JournalEntry.entry_date <= date_to)
    if source_types is not None:
        q = q.filter(JournalEntry.source_type.in_(list(source_types)))
    return {
        account_id: (money(debit), money(credit))
        for account_id, debit, credit in q.group_by(JournalLine.account_id)
    }


def _accounts(db: Session) -> list[LedgerAccount]:
    ensure_chart(db)
    return db.query(LedgerAccount).order_by(LedgerAccount.code).all()


def _signed(account: LedgerAccount, debit: Decimal, credit: Decimal) -> Decimal:
    return debit - credit if account.category in DEBIT_NORMAL else credit - debit


def _row(account: LedgerAccount, amount: Decimal) -> dict:
    return {
        "account_id": account.id,
        "code": account.code,
        "name": account.name,
        "category": account.category,
        "amount": f(amount),
    }


def account_balances(db: Session, as_at: Optional[date] = None) -> dict[int, Decimal]:
    """Each account's balance on its normal side, as at a date."""
    totals = _totals(db, date_to=as_at)
    return {a.id: _signed(a, *totals.get(a.id, (ZERO, ZERO))) for a in _accounts(db)}


# ── Trial balance ────────────────────────────────────────────────────────────


def trial_balance(db: Session, as_at: date) -> dict:
    totals = _totals(db, date_to=as_at)
    rows, total_debit, total_credit = [], ZERO, ZERO
    for account in _accounts(db):
        debit, credit = totals.get(account.id, (ZERO, ZERO))
        net = debit - credit
        if net == ZERO:
            continue
        side_debit, side_credit = (net, ZERO) if net > 0 else (ZERO, -net)
        total_debit += side_debit
        total_credit += side_credit
        rows.append(
            {
                "account_id": account.id,
                "code": account.code,
                "name": account.name,
                "category": account.category,
                "debit": f(side_debit),
                "credit": f(side_credit),
            }
        )
    return {
        "as_at": as_at.isoformat(),
        "rows": rows,
        "total_debit": f(total_debit),
        "total_credit": f(total_credit),
        "balanced": total_debit == total_credit,
    }


# ── Profit and loss ──────────────────────────────────────────────────────────


def _profit(db: Session, date_from: Optional[date], date_to: Optional[date]) -> Decimal:
    totals = _totals(db, date_from=date_from, date_to=date_to)
    profit = ZERO
    for account in _accounts(db):
        if account.category not in PROFIT_AND_LOSS:
            continue
        debit, credit = totals.get(account.id, (ZERO, ZERO))
        profit += credit - debit  # income raises it, costs lower it
    return profit


def profit_and_loss(db: Session, date_from: date, date_to: date) -> dict:
    totals = _totals(db, date_from=date_from, date_to=date_to)
    sections = {c: [] for c in PROFIT_AND_LOSS}
    sums = {c: ZERO for c in PROFIT_AND_LOSS}
    for account in _accounts(db):
        if account.category not in PROFIT_AND_LOSS:
            continue
        amount = _signed(account, *totals.get(account.id, (ZERO, ZERO)))
        if amount == ZERO:
            continue
        sections[account.category].append(_row(account, amount))
        sums[account.category] += amount
    gross = sums["income"] - sums["cost_of_sales"]
    net = gross - sums["expense"]
    return {
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "income": sections["income"],
        "total_income": f(sums["income"]),
        "cost_of_sales": sections["cost_of_sales"],
        "total_cost_of_sales": f(sums["cost_of_sales"]),
        "gross_profit": f(gross),
        "expenses": sections["expense"],
        "total_expenses": f(sums["expense"]),
        "net_profit": f(net),
    }


# ── Balance sheet ────────────────────────────────────────────────────────────


def balance_sheet(db: Session, as_at: date) -> dict:
    """Assets = liabilities + equity, with earnings not yet closed to equity.

    There is no year-end closing entry, so profit is carried into equity here:
    everything earned before the current Australian financial year as retained
    earnings, and this year's so far as current year earnings. That is the same
    figure a closing entry would have moved, computed instead of posted.
    """
    fy_start, _ = get_fiscal_year_bounds(as_at)
    totals = _totals(db, date_to=as_at)
    sections = {c: [] for c in BALANCE_SHEET}
    sums = {c: ZERO for c in BALANCE_SHEET}
    for account in _accounts(db):
        if account.category not in BALANCE_SHEET:
            continue
        amount = _signed(account, *totals.get(account.id, (ZERO, ZERO)))
        if amount == ZERO:
            continue
        sections[account.category].append(_row(account, amount))
        sums[account.category] += amount

    prior = _profit(db, None, fy_start - timedelta(days=1))
    current = _profit(db, fy_start, as_at)
    equity_total = sums["equity"] + prior + current
    return {
        "as_at": as_at.isoformat(),
        "financial_year_start": fy_start.isoformat(),
        "assets": sections["asset"],
        "total_assets": f(sums["asset"]),
        "liabilities": sections["liability"],
        "total_liabilities": f(sums["liability"]),
        "equity": sections["equity"],
        "retained_earnings_prior_years": f(prior),
        "current_year_earnings": f(current),
        "total_equity": f(equity_total),
        "balanced": sums["asset"] == sums["liability"] + equity_total,
    }


# ── General ledger ───────────────────────────────────────────────────────────


def general_ledger(
    db: Session, account: LedgerAccount, date_from: date, date_to: date
) -> dict:
    opening_d, opening_c = _totals(db, date_to=date_from - timedelta(days=1)).get(
        account.id, (ZERO, ZERO)
    )
    running = _signed(account, opening_d, opening_c)
    opening = running
    rows = (
        db.query(JournalLine, JournalEntry)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .filter(
            JournalLine.account_id == account.id,
            JournalEntry.entry_date >= date_from,
            JournalEntry.entry_date <= date_to,
        )
        .order_by(JournalEntry.entry_date, JournalEntry.id, JournalLine.id)
        .all()
    )
    lines = []
    for line, entry in rows:
        running += _signed(account, money(line.debit), money(line.credit))
        lines.append(
            {
                "entry_id": entry.id,
                "number": f"JE-{entry.id:06d}",
                "date": entry.entry_date.isoformat(),
                "memo": entry.memo,
                "description": line.description,
                "source_type": entry.source_type,
                "source_id": entry.source_id,
                "debit": f(line.debit),
                "credit": f(line.credit),
                "balance": f(running),
            }
        )
    return {
        "account": {
            "id": account.id,
            "code": account.code,
            "name": account.name,
            "category": account.category,
        },
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "opening_balance": f(opening),
        "lines": lines,
        "closing_balance": f(running),
    }


# ── BAS ──────────────────────────────────────────────────────────────────────


def bas(db: Session, date_from: date, date_to: date) -> dict:
    """GST for a period, on the accrual basis, read off the GST accounts.

    1A is what the GST Collected account received in the period and 1B what the
    GST Paid account did — so 1B comes from the tax invoices entered as bills,
    which is what the ATO allows a credit for, and never from purchase orders.
    """
    totals = _totals(db, date_from=date_from, date_to=date_to)
    collected = account_for(db, "gst_collected")
    paid = account_for(db, "gst_paid")
    d, c = totals.get(collected.id, (ZERO, ZERO))
    gst_on_sales = c - d
    d, c = totals.get(paid.id, (ZERO, ZERO))
    gst_on_purchases = d - c

    receivable = account_for(db, "receivable")
    d, c = _totals(
        db, date_from=date_from, date_to=date_to, source_types=["invoice"]
    ).get(receivable.id, (ZERO, ZERO))
    total_sales = d - c

    payable = account_for(db, "payable")
    d, c = _totals(db, date_from=date_from, date_to=date_to, source_types=["bill"]).get(
        payable.id, (ZERO, ZERO)
    )
    total_purchases = c - d

    return {
        "basis": "accrual",
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "G1": f(total_sales),
        "G11": f(total_purchases),
        "1A": f(gst_on_sales),
        "1B": f(gst_on_purchases),
        "net_gst": f(gst_on_sales - gst_on_purchases),
    }


# ── Health ───────────────────────────────────────────────────────────────────


def health(db: Session) -> dict:
    """Does the ledger agree with the documents it summarises?

    The receivables account should equal what customers owe according to their
    jobs, and the payables account what the business owes according to its
    bills. Each disagreement is listed by document, because a total that is out
    by $300 is not something anyone can act on.
    """
    from app.core.ledger_postings import INVOICED_STATUSES, invoice_lines

    receivable = account_for(db, "receivable")
    payable = account_for(db, "payable")
    balances = account_balances(db)

    # Receivables, job by job: invoiced total less payments recorded.
    paid_by_job: dict[str, Decimal] = {}
    for job_id, amount in db.query(JobPayment.job_id, JobPayment.amount):
        paid_by_job[job_id] = paid_by_job.get(job_id, ZERO) + money(amount)
    ledger_by_job: dict[str, Decimal] = {}
    for job_id, debit, credit in (
        db.query(
            JournalLine.job_id,
            func.coalesce(func.sum(JournalLine.debit), 0),
            func.coalesce(func.sum(JournalLine.credit), 0),
        )
        .filter(JournalLine.account_id == receivable.id)
        .group_by(JournalLine.job_id)
    ):
        ledger_by_job[job_id] = money(debit) - money(credit)

    expected_by_job: dict[str, Decimal] = {}
    unposted, paid_with_balance, undated = [], [], []
    for job in db.query(Job).filter(Job.status.in_(list(INVOICED_STATUSES))):
        lines = invoice_lines(db, job)
        owed = money(lines[0].amount) if lines else ZERO
        expected_by_job[job.id] = owed - paid_by_job.get(job.id, ZERO)
        if lines and job.id not in ledger_by_job:
            unposted.append(
                {"job_id": job.id, "customer": job.customer_name, "total": f(owed)}
            )
        if lines and not job.invoice_date:
            # Posted on the day it was brought into the ledger, because there
            # was no other date to use — which may be the wrong BAS quarter.
            undated.append(
                {"job_id": job.id, "customer": job.customer_name, "total": f(owed)}
            )
        if job.status == "PAID" and owed - paid_by_job.get(job.id, ZERO) > ZERO:
            paid_with_balance.append(
                {
                    "job_id": job.id,
                    "customer": job.customer_name,
                    "unpaid": f(owed - paid_by_job.get(job.id, ZERO)),
                }
            )
    for job_id, paid in paid_by_job.items():
        expected_by_job.setdefault(job_id, -paid)

    mismatched = []
    for job_id in sorted(set(expected_by_job) | set(ledger_by_job), key=str):
        if job_id is None:
            continue
        want = expected_by_job.get(job_id, ZERO)
        have = ledger_by_job.get(job_id, ZERO)
        if want != have:
            mismatched.append(
                {"job_id": job_id, "expected": f(want), "ledger": f(have)}
            )

    ar_expected = sum(expected_by_job.values(), ZERO)
    ap_expected = ZERO
    for bill in db.query(SupplierBill):
        owed = money(bill.amount_inc) or money(bill.amount_ex) + money(bill.tax)
        settled = money(bill.paid_amount) if bill.status == "paid" else ZERO
        ap_expected += owed - settled

    return {
        "receivables": {
            "ledger": f(balances[receivable.id]),
            "documents": f(ar_expected),
            "difference": f(balances[receivable.id] - ar_expected),
        },
        "payables": {
            "ledger": f(balances[payable.id]),
            "documents": f(ap_expected),
            "difference": f(balances[payable.id] - ap_expected),
        },
        "unposted_invoices": unposted,
        "mismatched_jobs": mismatched,
        "paid_with_balance_owing": paid_with_balance,
        "invoiced_without_date": undated,
        "in_agreement": (
            balances[receivable.id] == ar_expected
            and balances[payable.id] == ap_expected
            and not unposted
            and not mismatched
        ),
    }

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
from app.models.credit_note import CreditNoteApplication, CustomerCreditNote
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
        db,
        date_from=date_from,
        date_to=date_to,
        source_types=["invoice", "credit_note"],
    ).get(receivable.id, (ZERO, ZERO))
    # Less credit notes in the period: an adjustment note reduces sales as it
    # reduces the GST collected that 1A reads.
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

    # Receivables, job by job: invoiced total less payments recorded, less
    # credit notes applied; credit not applied is owed back on account.
    paid_by_job: dict[str, Decimal] = {}
    for job_id, amount in db.query(JobPayment.job_id, JobPayment.amount):
        paid_by_job[job_id] = paid_by_job.get(job_id, ZERO) + money(amount)
    for job_id, amount in db.query(
        CreditNoteApplication.job_id, CreditNoteApplication.amount
    ):
        paid_by_job[job_id] = paid_by_job.get(job_id, ZERO) + money(amount)
    raised = money(
        db.query(func.coalesce(func.sum(CustomerCreditNote.total_inc), 0)).scalar()
    )
    used = money(
        db.query(func.coalesce(func.sum(CreditNoteApplication.amount), 0)).scalar()
    )
    on_account = raised - used
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
    unposted, paid_with_balance, undated, overpaid = [], [], [], []
    for job in db.query(Job).filter(Job.status.in_(list(INVOICED_STATUSES))):
        lines = invoice_lines(db, job)
        owed = money(lines[0].amount) if lines else ZERO
        # Paid and credited past what it owes (the invoice's own figure: an
        # older invoice with no inclusive total owes ex + GST): what it owes is
        # clamped at nothing, so the excess shows nowhere else.
        over = money(job.deposit) + money(job.credited) - owed
        if lines and over > ZERO:
            overpaid.append(
                {"job_id": job.id, "customer": job.customer_name, "over": f(over)}
            )
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

    ar_expected = sum(expected_by_job.values(), ZERO) - on_account
    totals_off, balances_off = _documents_disagreeing_with_themselves(db)
    ap_expected = ZERO
    for bill in db.query(SupplierBill):
        owed = money(bill.amount_inc) or money(bill.amount_ex) + money(bill.tax)
        # Every payment counts, a part-payment included: each one posted its
        # own entry, so the ledger has already taken it off what is owed.
        ap_expected += owed - money(bill.paid_amount)

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
        "paid_and_credited_past_total": overpaid,
        "invoiced_without_date": undated,
        "totals_disagree_with_lines": totals_off,
        "balances_disagree_with_invoices": balances_off,
        "po_totals_disagree_with_lines": _purchase_orders_disagreeing_with_their_lines(
            db
        ),
        "portal_orders_booked_twice": _portal_orders_booked_twice(db),
        "in_agreement": (
            balances[receivable.id] == ar_expected
            and balances[payable.id] == ap_expected
            and not unposted
            and not mismatched
            and not overpaid
        ),
    }


def _documents_disagreeing_with_themselves(db: Session) -> tuple[list, list]:
    """Invoices whose header is not their lines; customers whose balance is not
    their invoices.

    Both are kept true by construction now — the server totals a job from its
    lines (`app/core/job_totals.py`), and the balance is recalculated on every
    move across the invoiced boundary — but neither was ever checked, and both
    were found broken (F04, F06). Older records may still disagree; listing
    them is how they get looked at, rather than being trusted.
    """
    from sqlalchemy.orm import selectinload

    from app.core import job_totals
    from app.core.ledger_postings import INVOICED_STATUSES
    from app.models.customer import Customer

    totals_off = []
    owed_by_customer: dict[str, Decimal] = {}
    invoiced = (
        db.query(Job)
        .options(selectinload(Job.items))
        .filter(Job.status.in_(list(INVOICED_STATUSES)))
        .order_by(Job.id)
    )
    for job in invoiced:
        if job.customer_id:
            owed_by_customer[job.customer_id] = owed_by_customer.get(
                job.customer_id, ZERO
            ) + money(job.balance_due)
        if not job.items:
            continue  # a header-only import: there are no lines to disagree with
        lines = job_totals.from_lines(job.items).ex
        if lines != money(job.total_ex):
            totals_off.append(
                {
                    "job_id": job.id,
                    "customer": job.customer_name,
                    "header": f(job.total_ex),
                    "lines": f(lines),
                }
            )

    # Less each customer's credit on account (credit notes not yet applied).
    for customer_id, total in db.query(
        CustomerCreditNote.customer_id, func.sum(CustomerCreditNote.total_inc)
    ).group_by(CustomerCreditNote.customer_id):
        owed_by_customer[customer_id] = owed_by_customer.get(customer_id, ZERO) - money(
            total
        )
    for customer_id, amount in (
        db.query(CustomerCreditNote.customer_id, func.sum(CreditNoteApplication.amount))
        .join(
            CreditNoteApplication,
            CreditNoteApplication.credit_note_id == CustomerCreditNote.id,
        )
        .group_by(CustomerCreditNote.customer_id)
    ):
        owed_by_customer[customer_id] = owed_by_customer.get(customer_id, ZERO) + money(
            amount
        )

    balances_off = []
    for customer in db.query(Customer).order_by(Customer.id):
        balance = money(customer.balance)
        invoices = owed_by_customer.get(customer.id, ZERO)
        if balance != invoices:
            balances_off.append(
                {
                    "customer_id": customer.id,
                    "customer": customer.name,
                    "balance": f(balance),
                    "invoices": f(invoices),
                }
            )
    return totals_off, balances_off


def _purchase_orders_disagreeing_with_their_lines(db: Session) -> list:
    """POs whose stored totals are not their lines (F15).

    Every PO write totals its lines now (`app/core/po_totals.py`), but
    auto-reorder used to set only an ex-GST `total`, leaving the GST and
    inc-GST totals that payables and committed spend read at zero. Those POs
    are still in the data; listed, they get looked at instead of trusted.
    """
    from sqlalchemy.orm import selectinload

    from app.core import po_totals
    from app.models.purchase_order import PurchaseOrder

    off = []
    for po in (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .order_by(PurchaseOrder.id)
    ):
        if not po.items:
            continue  # no lines to disagree with
        lines = po_totals.from_lines(po.items)
        stored = (money(po.total_ex), money(po.tax_total), money(po.total_inc))
        if stored != tuple(lines):
            off.append(
                {
                    "po_id": po.id,
                    "supplier": po.supplier_name,
                    "header": f(money(po.total_inc)),
                    "lines": f(lines.inc),
                }
            )
    return off


def _portal_orders_booked_twice(db: Session) -> list:
    """Online-store orders booked as more than one job (F01).

    A retry is refused now, but a repeat booked before that is still in the
    data, and a unique index on the order number would fail the deploy on it.
    Same customer and order number, not cancelled — the order number read the
    way the refusal reads it, so this lists what it would have refused.
    """
    from app.routers.jobs import PORTAL_ITEM_NO, _order_number

    by_order: dict[tuple, list] = {}
    for job in (
        db.query(Job)
        .filter(Job.item_no == PORTAL_ITEM_NO, Job.status != "CANCEL")
        .order_by(Job.id)
    ):
        number = _order_number(job.serial_no)
        if number:
            by_order.setdefault((job.customer_id, number.lower()), []).append(
                (job, number)
            )
    return [
        {
            "customer_id": jobs[0][0].customer_id,
            "customer": jobs[0][0].customer_name,
            "order_no": jobs[0][1],
            "job_ids": [job.id for job, _ in jobs],
        }
        for jobs in by_order.values()
        if len(jobs) > 1
    ]

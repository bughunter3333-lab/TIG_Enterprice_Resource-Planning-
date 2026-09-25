"""The general ledger, end to end.

What has to hold for the ledger to be trusted, and is asserted here through the
same HTTP paths the app uses:

- the engine refuses anything unbalanced, one-sided, inactive or locked, and
  never edits a posted entry — it reverses it;
- invoicing, un-invoicing, payments and bills each post exactly what the
  document says, and changing the document replaces its entry rather than
  adding a second one;
- the statements are internally consistent (trial balance and balance sheet
  balance) and consistent with the rest of the system — the ledger's BAS must
  equal the BAS report computed straight from jobs and bills, two independent
  calculations of the same figures;
- history that predates the ledger can be brought in, and bringing it in twice
  posts nothing the second time.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.core import ledger
from app.core.ledger import Line, LedgerError, LedgerLocked, account_for, money
from app.core.ledger_postings import INVOICED_STATUSES
from app.models.customer import Customer
from app.models.job import Job
from app.models.ledger import JournalEntry, JournalLine, LedgerAccount
from app.models.purchase_order import PurchaseOrder

TODAY = date.today()


def _job(
    db, job_id, customer_id="LCUST", status="FINISH", ex=100.0, gst=10.0, inc=110.0
):
    """A job ready to invoice, written straight to the table — so, like jobs
    from before the ledger existed, it has posted nothing."""
    if not db.query(Customer).filter_by(id=customer_id).first():
        db.add(
            Customer(id=customer_id, name=f"Cust {customer_id}", credit_limit=100000.0)
        )
    job = Job(
        id=job_id,
        customer_id=customer_id,
        customer_name=f"Cust {customer_id}",
        status=status,
        date_in=TODAY.isoformat(),
        invoice=f"INV-{job_id}",
        total_ex=ex,
        tax=gst,
        total_inc=inc,
        deposit=0,
        balance_due=inc,
    )
    db.add(job)
    db.commit()
    return job


def _invoice(client, job_id):
    r = client.post(f"/jobs/{job_id}/status", json={"status": "INVOICE"})
    assert r.status_code == 200, r.text
    return r


def _entries(db, source_type, source_id):
    return (
        db.query(JournalEntry)
        .filter_by(source_type=source_type, source_id=str(source_id))
        .order_by(JournalEntry.id)
        .all()
    )


def _balance(db, role, job_id=None):
    """An account's net debit balance, optionally for one job only."""
    account = account_for(db, role)
    q = db.query(JournalLine).filter(JournalLine.account_id == account.id)
    if job_id is not None:
        q = q.filter(JournalLine.job_id == job_id)
    return sum((money(ln.debit) - money(ln.credit) for ln in q), Decimal("0"))


def _bill(client, **fields):
    body = {
        "supplier_name": "Fly Apparel",
        "bill_number": "B-1",
        "bill_date": TODAY.isoformat(),
        "amount_ex": 200.0,
        "tax": 20.0,
        "amount_inc": 220.0,
        **fields,
    }
    r = client.post("/ap/bills", json=body)
    assert r.status_code == 201, r.text
    return r.json()


# ── The engine ───────────────────────────────────────────────────────────────


@pytest.mark.integration
class TestTheEngine:
    def test_an_unbalanced_entry_is_refused(self, db):
        bank, sales = account_for(db, "bank"), account_for(db, "sales")
        with pytest.raises(LedgerError, match="do not equal"):
            ledger.post(
                db,
                entry_date=TODAY,
                memo="off by a cent",
                lines=[Line(bank, Decimal("10.00")), Line(sales, Decimal("-9.99"))],
                created_by="t",
            )
        assert db.query(JournalEntry).count() == 0

    def test_a_single_line_is_not_an_entry(self, db):
        with pytest.raises(LedgerError, match="at least two"):
            ledger.post(
                db,
                entry_date=TODAY,
                memo="one line",
                lines=[Line(account_for(db, "bank"), Decimal("5"))],
                created_by="t",
            )

    def test_an_inactive_account_cannot_be_posted_to(self, db):
        bank = account_for(db, "bank")
        spare = LedgerAccount(
            code="6999", name="Old", category="expense", is_active=False
        )
        db.add(spare)
        db.flush()
        with pytest.raises(LedgerError, match="inactive"):
            ledger.post(
                db,
                entry_date=TODAY,
                memo="x",
                lines=[Line(spare, Decimal("5")), Line(bank, Decimal("-5"))],
                created_by="t",
            )

    def test_nothing_posts_into_a_locked_period(self, db):
        ledger.set_lock_date(db, TODAY - timedelta(days=10))
        bank, sales = account_for(db, "bank"), account_for(db, "sales")
        with pytest.raises(LedgerLocked):
            ledger.post(
                db,
                entry_date=TODAY - timedelta(days=10),
                memo="x",
                lines=[Line(bank, Decimal("5")), Line(sales, Decimal("-5"))],
                created_by="t",
            )
        # A document dated in the locked period posts on today instead.
        assert ledger.open_date(db, TODAY - timedelta(days=30)) == TODAY
        assert ledger.open_date(db, TODAY - timedelta(days=5)) == TODAY - timedelta(
            days=5
        )

    def test_a_reversal_is_a_mirror_and_happens_once(self, db):
        bank, sales = account_for(db, "bank"), account_for(db, "sales")
        entry = ledger.post(
            db,
            entry_date=TODAY,
            memo="sale",
            lines=[Line(bank, Decimal("50")), Line(sales, Decimal("-50"))],
            created_by="t",
        )
        mirror = ledger.reverse(db, entry, created_by="t", reason="typo")
        assert mirror.reverses_id == entry.id and entry.reversed_by_id == mirror.id
        assert {
            (ln.account_id, money(ln.debit), money(ln.credit)) for ln in mirror.lines
        } == {
            (bank.id, Decimal("0.00"), Decimal("50.00")),
            (sales.id, Decimal("50.00"), Decimal("0.00")),
        }
        with pytest.raises(LedgerError, match="already been reversed"):
            ledger.reverse(db, entry, created_by="t")
        with pytest.raises(LedgerError, match="itself a reversal"):
            ledger.reverse(db, mirror, created_by="t")

    def test_money_rounds_half_up_to_the_cent(self):
        assert money("10.005") == Decimal("10.01")
        assert money(0.1 + 0.2) == Decimal("0.30")

    def test_the_database_refuses_a_line_with_both_sides(self, db):
        """The rule is held at the database too, not only in post()."""
        bank = account_for(db, "bank")
        entry = JournalEntry(entry_date=TODAY, source_type="manual", created_by="t")
        db.add(entry)
        db.flush()
        db.add(JournalLine(entry_id=entry.id, account_id=bank.id, debit=5, credit=5))
        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()

    def test_the_chart_seeds_once(self, db):
        ledger.ensure_chart(db)
        count = db.query(LedgerAccount).count()
        ledger.ensure_chart(db)
        assert db.query(LedgerAccount).count() == count >= 20


# ── Invoices ─────────────────────────────────────────────────────────────────


@pytest.mark.integration
class TestInvoices:
    def test_invoicing_posts_what_the_customer_owes(self, client, db):
        _job(db, "L-INV1", ex=100.0, gst=10.0, inc=110.0)
        _invoice(client, "L-INV1")
        (entry,) = _entries(db, "invoice", "L-INV1")
        lines = {
            ln.account.role: (money(ln.debit), money(ln.credit)) for ln in entry.lines
        }
        assert lines == {
            "receivable": (Decimal("110.00"), Decimal("0.00")),
            "sales": (Decimal("0.00"), Decimal("100.00")),
            "gst_collected": (Decimal("0.00"), Decimal("10.00")),
        }
        assert all(ln.job_id == "L-INV1" for ln in entry.lines)

    def test_unprint_reverses_and_reinvoicing_posts_again(self, client, db):
        _job(db, "L-INV2")
        _invoice(client, "L-INV2")
        assert client.post("/jobs/L-INV2/unprint").status_code == 200
        assert _balance(db, "receivable", "L-INV2") == 0
        _invoice(client, "L-INV2")
        history = _entries(db, "invoice", "L-INV2")
        # posted, reversed, posted — the ledger tells the story in order
        assert [e.reverses_id is not None for e in history] == [False, True, False]
        assert _balance(db, "receivable", "L-INV2") == Decimal("110.00")

    def test_invoicing_twice_through_paid_posts_once(self, client, db):
        _job(db, "L-INV3")
        _invoice(client, "L-INV3")
        assert (
            client.post("/jobs/L-INV3/status", json={"status": "PAID"}).status_code
            == 200
        )
        assert len(_entries(db, "invoice", "L-INV3")) == 1

    def test_a_negative_invoice_posts_as_a_credit_note(self, client, db):
        """The invoice screen refuses a total at or below zero, but an import
        can carry a credit note — and it must post the other way round."""
        _job(db, "L-CN1", status="INVOICE", ex=-50.0, gst=-5.0, inc=-55.0)
        client.post("/accounting/backfill")
        assert _balance(db, "receivable", "L-CN1") == Decimal("-55.00")
        assert _balance(db, "gst_collected", "L-CN1") == Decimal("5.00")

    def test_an_invoiced_job_cannot_be_deleted(self, client, db):
        _job(db, "L-DEL1")
        _invoice(client, "L-DEL1")
        # Refused by the existing "settled" guard before the ledger's is reached;
        # the ledger's covers the case that one does not — see TestPayments.
        assert client.delete("/jobs/L-DEL1").status_code == 409

    def test_the_invoiced_boundary_is_the_stock_boundary(self):
        from app.routers.jobs import _DEPLETED_STATUSES

        assert INVOICED_STATUSES == frozenset(_DEPLETED_STATUSES)


# ── Payments ─────────────────────────────────────────────────────────────────


@pytest.mark.integration
class TestPayments:
    def test_a_payment_clears_the_receivable(self, client, db):
        _job(db, "L-PAY1")
        _invoice(client, "L-PAY1")
        r = client.post("/jobs/L-PAY1/payment", json={"amount": 110.0, "method": "EFT"})
        assert r.status_code == 200, r.text
        assert _balance(db, "receivable", "L-PAY1") == 0
        assert _balance(db, "bank") == Decimal("110.00")

    def test_part_payments_leave_the_rest_owing(self, client, db):
        _job(db, "L-PAY2")
        _invoice(client, "L-PAY2")
        client.post("/jobs/L-PAY2/payment", json={"amount": 40.0, "method": "Card"})
        assert _balance(db, "receivable", "L-PAY2") == Decimal("70.00")

    def test_a_job_paid_against_cannot_be_deleted_once_uninvoiced(self, client, db):
        """Unprinting takes a job out of the statuses the older guard checks,
        so a job that has taken money could otherwise be deleted, leaving cash
        in the bank that no document explains."""
        _job(db, "L-PAY3")
        _invoice(client, "L-PAY3")
        client.post("/jobs/L-PAY3/payment", json={"amount": 10.0, "method": "Cash"})
        assert client.post("/jobs/L-PAY3/unprint").status_code == 200
        r = client.delete("/jobs/L-PAY3")
        assert r.status_code == 409
        assert r.json()["detail"]["error"] == "has_ledger_history"


# ── Bills ────────────────────────────────────────────────────────────────────


@pytest.mark.integration
class TestBills:
    def test_a_bill_posts_cost_gst_and_payable(self, client, db):
        bill = _bill(client)
        (entry,) = _entries(db, "bill", bill["id"])
        lines = {
            ln.account.role: (money(ln.debit), money(ln.credit)) for ln in entry.lines
        }
        assert lines == {
            "default_expense": (Decimal("200.00"), Decimal("0.00")),
            "gst_paid": (Decimal("20.00"), Decimal("0.00")),
            "payable": (Decimal("0.00"), Decimal("220.00")),
        }

    def test_a_bill_against_a_purchase_order_is_cost_of_sales(self, client, db):
        db.add(PurchaseOrder(id="PO-L1", supplier_name="Fly Apparel", status="Draft"))
        db.commit()
        bill = _bill(client, po_id="PO-L1")
        (entry,) = _entries(db, "bill", bill["id"])
        assert "purchases" in {ln.account.role for ln in entry.lines}

    def test_the_account_chosen_on_a_bill_is_used(self, client, db):
        ledger.ensure_chart(db)
        db.commit()
        rent = db.query(LedgerAccount).filter_by(code="6100").one()
        bill = _bill(client, account_id=rent.id)
        (entry,) = _entries(db, "bill", bill["id"])
        assert rent.id in {ln.account_id for ln in entry.lines}

    def test_editing_a_bill_replaces_its_entry(self, client, db):
        bill = _bill(client)
        client.patch(
            f"/ap/bills/{bill['id']}",
            json={"amount_ex": 300.0, "tax": 30.0, "amount_inc": 330.0},
        )
        history = _entries(db, "bill", bill["id"])
        assert len(history) == 3  # posted, reversed, posted
        assert _balance(db, "payable") == Decimal("-330.00")

    def test_an_edit_that_changes_nothing_writes_nothing(self, client, db):
        bill = _bill(client)
        client.patch(f"/ap/bills/{bill['id']}", json={"notes": "checked"})
        assert len(_entries(db, "bill", bill["id"])) == 1

    def test_paying_then_deleting_a_bill_leaves_nothing_owed(self, client, db):
        bill = _bill(client)
        assert (
            client.post(
                f"/ap/bills/{bill['id']}/pay", json={"paid_amount": 220.0}
            ).status_code
            == 200
        )
        assert _balance(db, "payable") == 0
        assert _balance(db, "bank") == Decimal("-220.00")
        assert client.delete(f"/ap/bills/{bill['id']}").status_code == 204
        assert _balance(db, "payable") == 0 and _balance(db, "bank") == 0
        # ...and the ledger still records that the bill existed.
        assert len(_entries(db, "bill", bill["id"])) == 2


# ── Manual journals and permissions ──────────────────────────────────────────


@pytest.mark.integration
class TestManualJournals:
    def _rent_journal(self, db, amount=1000.0):
        ledger.ensure_chart(db)
        db.commit()
        rent = db.query(LedgerAccount).filter_by(code="6100").one()
        bank = account_for(db, "bank")
        return {
            "entry_date": TODAY.isoformat(),
            "memo": "September rent",
            "lines": [
                {"account_id": rent.id, "debit": amount},
                {"account_id": bank.id, "credit": amount},
            ],
        }

    def test_a_balanced_journal_posts(self, client, db):
        r = client.post("/accounting/journals", json=self._rent_journal(db))
        assert r.status_code == 201, r.text
        assert r.json()["number"].startswith("JE-") and r.json()["total"] == 1000.0

    def test_an_unbalanced_journal_is_refused(self, client, db):
        body = self._rent_journal(db)
        body["lines"][1]["credit"] = 999.0
        assert client.post("/accounting/journals", json=body).status_code == 409

    def test_a_line_with_both_sides_is_refused(self, client, db):
        body = self._rent_journal(db)
        body["lines"][0]["credit"] = 5.0
        assert client.post("/accounting/journals", json=body).status_code == 400

    def test_a_manual_journal_can_be_reversed(self, client, db):
        je = client.post("/accounting/journals", json=self._rent_journal(db)).json()
        r = client.post(
            f"/accounting/journals/{je['id']}/reverse", json={"reason": "wrong month"}
        )
        assert r.status_code == 201
        assert r.json()["reverses_id"] == je["id"]

    def test_an_invoice_entry_cannot_be_reversed_by_hand(self, client, db):
        _job(db, "L-MAN1")
        _invoice(client, "L-MAN1")
        (entry,) = _entries(db, "invoice", "L-MAN1")
        r = client.post(f"/accounting/journals/{entry.id}/reverse", json={})
        assert r.status_code == 409
        assert "invoice L-MAN1" in r.json()["detail"]

    def test_staff_cannot_read_the_ledger(self, staff_client):
        assert staff_client.get("/accounting/reports/profit-loss").status_code == 403

    def test_a_system_account_cannot_be_deactivated(self, client, db):
        bank = account_for(db, "bank")
        db.commit()
        r = client.patch(f"/accounting/accounts/{bank.id}", json={"is_active": False})
        assert r.status_code == 409

    def test_the_lock_date_cannot_cover_today(self, client):
        r = client.put("/accounting/lock-date", json={"lock_date": TODAY.isoformat()})
        assert r.status_code == 400
        yesterday = (TODAY - timedelta(days=1)).isoformat()
        assert client.put(
            "/accounting/lock-date", json={"lock_date": yesterday}
        ).json() == {"lock_date": yesterday}


# ── Statements ───────────────────────────────────────────────────────────────


def _a_month_of_trading(client, db):
    """Two invoices, one paid; a stock bill and an expense bill, one paid; rent."""
    _job(db, "L-T1", "LT-A", ex=1000.0, gst=100.0, inc=1100.0)
    _job(db, "L-T2", "LT-B", ex=500.0, gst=50.0, inc=550.0)
    _invoice(client, "L-T1")
    _invoice(client, "L-T2")
    client.post("/jobs/L-T1/payment", json={"amount": 1100.0, "method": "EFT"})
    db.add(PurchaseOrder(id="PO-LT", supplier_name="Fly Apparel", status="Draft"))
    db.commit()
    stock = _bill(
        client,
        po_id="PO-LT",
        bill_number="B-STOCK",
        amount_ex=400.0,
        tax=40.0,
        amount_inc=440.0,
    )
    _bill(client, bill_number="B-POWER", amount_ex=90.0, tax=9.0, amount_inc=99.0)
    client.post(f"/ap/bills/{stock['id']}/pay", json={"paid_amount": 440.0})
    ledger.ensure_chart(db)
    db.commit()
    rent = db.query(LedgerAccount).filter_by(code="6100").one()
    client.post(
        "/accounting/journals",
        json={
            "entry_date": TODAY.isoformat(),
            "memo": "Rent",
            "lines": [
                {"account_id": rent.id, "debit": 300.0},
                {"account_id": account_for(db, "bank").id, "credit": 300.0},
            ],
        },
    )


@pytest.mark.integration
class TestStatements:
    def test_the_trial_balance_balances(self, client, db):
        _a_month_of_trading(client, db)
        tb = client.get("/accounting/reports/trial-balance").json()
        assert tb["balanced"] and tb["total_debit"] == tb["total_credit"] > 0

    def test_profit_and_loss(self, client, db):
        _a_month_of_trading(client, db)
        pl = client.get(
            "/accounting/reports/profit-loss",
            params={"date_from": TODAY.isoformat(), "date_to": TODAY.isoformat()},
        ).json()
        assert pl["total_income"] == 1500.0
        assert pl["total_cost_of_sales"] == 400.0
        assert pl["gross_profit"] == 1100.0
        assert pl["total_expenses"] == 390.0  # power 90 + rent 300
        assert pl["net_profit"] == 710.0

    def test_the_balance_sheet_balances(self, client, db):
        _a_month_of_trading(client, db)
        bs = client.get("/accounting/reports/balance-sheet").json()
        assert bs["balanced"]
        assert bs["current_year_earnings"] == 710.0
        # bank: +1100 received, -440 paid, -300 rent
        bank = next(r for r in bs["assets"] if r["code"] == "1000")
        assert bank["amount"] == 360.0

    def test_the_general_ledger_runs_a_balance(self, client, db):
        _a_month_of_trading(client, db)
        bank = account_for(db, "bank")
        db.commit()
        gl = client.get(f"/accounting/reports/general-ledger/{bank.id}").json()
        assert gl["closing_balance"] == 360.0
        assert gl["lines"][-1]["balance"] == 360.0

    def test_the_ledger_bas_equals_the_bas_report(self, client, db):
        """Two independent calculations — one from the GST accounts, one from
        jobs and bills — must produce the same three figures."""
        _a_month_of_trading(client, db)
        period = {"date_from": TODAY.isoformat(), "date_to": TODAY.isoformat()}
        from_ledger = client.get("/accounting/reports/bas", params=period).json()
        from_documents = client.get("/reports/bas-summary", params=period).json()
        assert from_ledger["G1"] == from_documents["G1"] == 1650.0
        assert from_ledger["1A"] == from_documents["1A"] == 150.0
        assert from_ledger["1B"] == from_documents["1B"] == 49.0
        assert from_ledger["net_gst"] == 101.0

    def test_the_bas_claims_gst_on_bills_not_on_purchase_orders(self, client, db):
        """A purchase order is not a tax invoice. One raised and never billed
        must not reduce the GST payable."""
        db.add(
            PurchaseOrder(
                id="PO-NEVER", supplier_name="X", status="Draft", tax_total=500
            )
        )
        db.commit()
        period = {"date_from": TODAY.isoformat(), "date_to": TODAY.isoformat()}
        assert client.get("/reports/bas-summary", params=period).json()["1B"] == 0


# ── Agreement with the documents, and bringing history in ────────────────────


@pytest.mark.integration
class TestHealthAndBackfill:
    def test_the_ledger_agrees_with_the_documents(self, client, db):
        _a_month_of_trading(client, db)
        health = client.get("/accounting/health").json()
        assert health["in_agreement"], health
        assert health["receivables"]["ledger"] == 550.0
        assert health["payables"]["ledger"] == 99.0

    def test_a_job_marked_paid_without_a_payment_is_reported(self, client, db):
        _job(db, "L-H1")
        _invoice(client, "L-H1")
        client.post("/jobs/L-H1/status", json={"status": "PAID"})
        health = client.get("/accounting/health").json()
        assert [row["job_id"] for row in health["paid_with_balance_owing"]] == ["L-H1"]

    def test_history_is_brought_in_once(self, client, db):
        # Jobs invoiced before the ledger existed: written straight to the table.
        _job(db, "L-OLD1", status="INVOICE")
        _job(db, "L-OLD2", status="PAID")
        health = client.get("/accounting/health").json()
        assert {r["job_id"] for r in health["unposted_invoices"]} == {
            "L-OLD1",
            "L-OLD2",
        }

        first = client.post("/accounting/backfill").json()
        assert first["entries_posted"] == 2
        assert first["health"]["unposted_invoices"] == []

        again = client.post("/accounting/backfill").json()
        assert again["entries_posted"] == 0

    def test_a_locked_period_invoice_posts_on_today(self, client, db):
        job = _job(db, "L-LOCK1", status="INVOICE")
        job.invoice_date = (TODAY - timedelta(days=60)).isoformat()
        db.commit()
        client.put(
            "/accounting/lock-date",
            json={"lock_date": (TODAY - timedelta(days=30)).isoformat()},
        )
        client.post("/accounting/backfill")
        (entry,) = _entries(db, "invoice", "L-LOCK1")
        assert entry.entry_date == TODAY


@pytest.mark.integration
class TestCodingABill:
    def test_staff_can_see_what_to_code_a_bill_to_but_not_balances(self, staff_client):
        r = staff_client.get("/accounting/accounts/options")
        assert r.status_code == 200
        options = r.json()
        assert {"Rent", "General Expenses", "Purchases"} <= {o["name"] for o in options}
        assert all("balance" not in o for o in options)
        # Only what a cost can be coded to — never the bank or receivables.
        assert {o["category"] for o in options} <= {"expense", "cost_of_sales"}
        assert staff_client.get("/accounting/accounts").status_code == 403

    def test_a_bill_can_go_back_to_deciding_by_kind(self, client, db):
        ledger.ensure_chart(db)
        db.commit()
        rent = db.query(LedgerAccount).filter_by(code="6100").one()
        bill = _bill(client, account_id=rent.id)
        r = client.patch(f"/ap/bills/{bill['id']}", json={"account_id": None})
        assert r.status_code == 200 and r.json()["account_id"] is None
        standing = [
            e
            for e in _entries(db, "bill", bill["id"])
            if not e.reverses_id and not e.reversed_by_id
        ]
        assert "default_expense" in {ln.account.role for ln in standing[0].lines}

    def test_an_update_that_does_not_mention_the_account_keeps_it(self, client, db):
        ledger.ensure_chart(db)
        db.commit()
        rent = db.query(LedgerAccount).filter_by(code="6100").one()
        bill = _bill(client, account_id=rent.id)
        client.patch(f"/ap/bills/{bill['id']}", json={"notes": "approved"})
        assert client.get(f"/ap/bills/{bill['id']}").json()["account_id"] == rent.id

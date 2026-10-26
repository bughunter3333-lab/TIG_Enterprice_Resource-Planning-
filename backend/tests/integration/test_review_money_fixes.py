"""Money defects a review reproduced, each pinned by the failure it found.

- an imported paid or part-paid invoice was posted with no payment, so the
  ledger's receivables grew by every paid invoice in a history import;
- re-importing an invoiced job rewrote its totals with no re-post and no
  recalculation of what the customer owes;
- the import had no Desp/Ready, so a job waiting for the carrier came in as
  FINISH, ready to invoice;
- a remittance could name one invoice twice and pay it twice over, and could
  pay a quote or a cancelled job;
- the customer statements counted uninvoiced FINISH jobs as owed, against the
  customer's balance and aged receivables;
- overseas staff could read the JSON copy of the customer statement;
- the invoice/quote email put portal-supplied text into its HTML raw;
- the bill-payments migration's downgrade left a bill paid in several runs
  where the old code could not see it, so the old code posted it again.
"""

import importlib.util
import io
import pathlib
from decimal import Decimal

import pytest

from app.core.ledger import Line, account_for, matches, money
from app.models.customer import Customer
from app.models.job import Job
from app.models.job_payment import JobPayment
from app.models.ledger import JournalEntry, JournalLine
from app.models.settings import CompanySettings
from app.models.supplier_bill import SupplierBill
from app.routers.import_data import translate_status

CUSTOMER = "RV-C"


def _customer(db, customer=CUSTOMER):
    if not db.get(Customer, customer):
        db.add(Customer(id=customer, name=f"Cust {customer}", credit_limit=99999.0))
        db.commit()


def _job(db, job_id, status, inc=110.0, customer=CUSTOMER, **fields):
    _customer(db, customer)
    db.add(
        Job(
            id=job_id,
            customer_id=customer,
            customer_name=f"Cust {customer}",
            status=status,
            total_ex=round(inc / 1.1, 2),
            tax=round(inc - inc / 1.1, 2),
            total_inc=inc,
            deposit=0,
            balance_due=inc,
            **fields,
        )
    )
    db.commit()


def _health(client):
    return client.get("/accounting/health").json()


def _bank(db):
    account = account_for(db, "bank")
    lines = db.query(JournalLine).filter(JournalLine.account_id == account.id)
    return sum((money(ln.debit) - money(ln.credit) for ln in lines), Decimal("0"))


# ── Importing jobs ───────────────────────────────────────────────────────────

_HEAD = (
    "Job#,Cust#,Customer,Status,Inv#,Inv Date,Total Ex,Tax,Total Inc,Invoice Paid $\n"
)


def _import(client, *rows):
    body = io.BytesIO((_HEAD + "\n".join(rows) + "\n").encode())
    r = client.post("/import/jobs", files={"file": ("jobs.csv", body, "text/csv")})
    assert r.status_code == 200, r.text
    return r.json()


def _payments(db, job_id):
    return [money(p.amount) for p in db.query(JobPayment).filter_by(job_id=job_id)]


@pytest.mark.integration
class TestAnImportedPaidAmountIsAPayment:
    def test_a_paid_invoice_comes_in_with_its_payment(self, client, db):
        _customer(db)
        result = _import(
            client, "RV-P1,RV-C,Cust RV-C,PAID,J2-9,01/10/2026,100,10,110,110"
        )
        assert result["inserted"] == 1, result
        db.expire_all()
        assert _payments(db, "RV-P1") == [Decimal("110.00")]
        assert float(db.get(Job, "RV-P1").balance_due) == 0
        assert float(db.get(Customer, CUSTOMER).balance) == 0
        health = _health(client)
        assert health["receivables"] == {
            "ledger": 0.0,
            "documents": 0.0,
            "difference": 0.0,
        }
        assert health["paid_with_balance_owing"] == []

    def test_a_part_paid_invoice_owes_only_the_rest(self, client, db):
        _customer(db)
        result = _import(
            client, "RV-P2,RV-C,Cust RV-C,INVOICE,J2-10,01/10/2026,100,10,110,40"
        )
        assert result["inserted"] == 1, result
        db.expire_all()
        job = db.get(Job, "RV-P2")
        assert _payments(db, "RV-P2") == [Decimal("40.00")]
        assert float(job.balance_due) == 70.0
        assert job.payment_status == "partial"
        assert float(db.get(Customer, CUSTOMER).balance) == 70.0
        assert _health(client)["receivables"]["ledger"] == 70.0

    def test_importing_it_again_takes_no_second_payment(self, client, db):
        _customer(db)
        row = "RV-P3,RV-C,Cust RV-C,PAID,J2-11,01/10/2026,100,10,110,110"
        _import(client, row)
        again = _import(client, row)
        assert again["errors"] == [], again
        db.expire_all()
        assert _payments(db, "RV-P3") == [Decimal("110.00")]
        assert _health(client)["receivables"]["ledger"] == 0.0

    def test_a_paid_job_whose_paid_amount_is_short_is_refused(self, client, db):
        _customer(db)
        result = _import(
            client, "RV-P4,RV-C,Cust RV-C,PAID,J2-12,01/10/2026,100,10,110,"
        )
        assert result["inserted"] == 0
        assert "paid" in result["errors"][0]["error"].lower()
        assert db.get(Job, "RV-P4") is None


@pytest.mark.integration
class TestAnInvoicedJobIsNotRewrittenByAnImport:
    def test_new_totals_on_an_invoiced_job_are_refused(self, client, db):
        _customer(db)
        _import(client, "RV-I1,RV-C,Cust RV-C,INVOICE,J2-1,01/10/2026,100,10,110,")
        result = _import(
            client, "RV-I1,RV-C,Cust RV-C,INVOICE,J2-1,01/10/2026,200,20,220,"
        )
        assert result["updated"] == 0
        assert "invoiced" in result["errors"][0]["error"]
        db.expire_all()
        assert float(db.get(Job, "RV-I1").total_inc) == 110.0
        health = _health(client)
        assert health["receivables"]["difference"] == 0.0
        assert health["mismatched_jobs"] == []
        assert health["balances_disagree_with_invoices"] == []

    def test_an_invoice_paid_since_takes_the_payment(self, client, db):
        _customer(db)
        _import(client, "RV-I2,RV-C,Cust RV-C,INVOICE,J2-2,01/10/2026,100,10,110,")
        result = _import(
            client, "RV-I2,RV-C,Cust RV-C,PAID,J2-2,01/10/2026,100,10,110,110"
        )
        assert result["errors"] == [], result
        db.expire_all()
        job = db.get(Job, "RV-I2")
        assert job.status == "PAID"
        assert _payments(db, "RV-I2") == [Decimal("110.00")]
        assert float(db.get(Customer, CUSTOMER).balance) == 0
        assert _health(client)["receivables"]["ledger"] == 0.0


@pytest.mark.integration
class TestDespReadyIsImported:
    def test_the_status_is_known(self):
        assert translate_status("Desp/Ready") == "Desp/Ready"

    def test_a_job_waiting_for_the_carrier_lands_there(self, client, db):
        _customer(db)
        result = _import(client, "RV-D1,RV-C,Cust RV-C,Desp/Ready,,,100,10,110,")
        assert result["inserted"] == 1, result
        db.expire_all()
        assert db.get(Job, "RV-D1").status == "Desp/Ready"


# ── Remittances ──────────────────────────────────────────────────────────────


def _remit(client, **body):
    return client.post(
        f"/customers/{CUSTOMER}/remittances",
        json={"method": "EFT", "reference": "RV-REMIT", **body},
    )


@pytest.mark.integration
class TestARemittancePaysEachInvoiceOnce:
    def test_the_same_invoice_twice_cannot_overpay_it(self, client, db):
        _job(db, "RM-1", "INVOICE", 100.0, invoice="INV-RM-1")
        r = _remit(
            client,
            amount=120.00,
            allocations=[
                {"job_id": "RM-1", "amount": 60.00},
                {"job_id": "RM-1", "amount": 60.00},
            ],
        )
        assert r.status_code == 422, r.text
        assert db.query(JobPayment).count() == 0

    def test_two_shares_within_what_it_owes_are_one_payment(self, client, db):
        _job(db, "RM-2", "INVOICE", 100.0, invoice="INV-RM-2")
        r = _remit(
            client,
            amount=100.00,
            allocations=[
                {"job_id": "RM-2", "amount": 40.00},
                {"job_id": "RM-2", "amount": 60.00},
            ],
        )
        assert r.status_code == 200, r.text
        assert [(p["job_id"], p["amount"]) for p in r.json()["payments"]] == [
            ("RM-2", 100.0)
        ]
        db.expire_all()
        assert float(db.get(Job, "RM-2").balance_due) == 0

    @pytest.mark.parametrize("status", ["CANCEL", "QUOTE", "FINISH"])
    def test_only_an_invoice_can_be_paid(self, client, db, status):
        _job(db, "RM-3", status, 110.0)
        r = _remit(
            client, amount=110.00, allocations=[{"job_id": "RM-3", "amount": 110.00}]
        )
        assert r.status_code == 422, r.text
        assert db.query(JobPayment).count() == 0
        assert _bank(db) == 0


# ── Customer statements ──────────────────────────────────────────────────────


@pytest.fixture
def invoiced_and_finished(db):
    _job(db, "ST-INV", "INVOICE", 110.0, invoice="INV-ST", invoice_date="2026-10-01")
    _job(db, "ST-FIN", "FINISH", 110.0, date_in="2026-10-02")


@pytest.mark.integration
class TestAStatementIsWhatHasBeenInvoiced:
    def test_the_reports_statement(self, client, invoiced_and_finished):
        body = client.get(f"/reports/customers/{CUSTOMER}/statement").json()
        assert [line["job_id"] for line in body["lines"]] == ["ST-INV"]
        assert body["totals"]["outstanding"] == 110.0

    def test_the_customers_statement(self, client, invoiced_and_finished):
        body = client.get(f"/customers/{CUSTOMER}/statement").json()
        assert [line["job_id"] for line in body["lines"]] == ["ST-INV"]
        assert body["totals"]["outstanding"] == 110.0

    def test_the_statement_pdf(self, client, invoiced_and_finished, monkeypatch):
        from app.routers import pdf

        seen = {}

        def _capture(customer, lines, totals, *rest):
            seen.update(lines=lines, totals=totals)
            return b"%PDF-1.4"

        monkeypatch.setattr(pdf, "_build_statement", _capture)
        r = client.get(f"/customers/{CUSTOMER}/statement.pdf")
        assert r.status_code == 200, r.text
        assert [line["job_id"] for line in seen["lines"]] == ["ST-INV"]
        assert seen["totals"]["outstanding"] == 110.0


@pytest.mark.integration
class TestTheStatementIsAMoneyRead:
    def test_overseas_staff_are_refused_and_staff_answered(self, client_as, db):
        _customer(db)
        with client_as("overseas_staff") as c:
            assert c.get(f"/customers/{CUSTOMER}/statement").status_code == 403
        with client_as("staff") as c:
            assert c.get(f"/customers/{CUSTOMER}/statement").status_code == 200


# ── The invoice / quote email ────────────────────────────────────────────────


@pytest.mark.integration
class TestTheEmailEscapesWhatItIsGiven:
    def test_job_and_caller_text_is_not_markup(self):
        from app.routers.email_router import _build_email_body

        job = Job(
            id="RV-E1",
            customer_name="<b>Acme</b>",
            invoice="<u>INV-1</u>",
            date_in="<s>2026-10-01</s>",
            due="<i>Friday</i>",
            total_ex=0,
            tax=0,
            total_inc=0,
            balance_due=0,
        )
        body = _build_email_body(
            job, CompanySettings(company_name="TIG"), "invoice", "<script>x</script>"
        )
        for raw in (
            "<b>Acme</b>",
            "<u>INV-1</u>",
            "<s>2026-10-01</s>",
            "<i>Friday</i>",
            "<script>",
        ):
            assert raw not in body, raw
        assert "&lt;b&gt;Acme&lt;/b&gt;" in body


# ── The bill-payments migration, going back ──────────────────────────────────


def _migration():
    path = (
        pathlib.Path(__file__).resolve().parents[2]
        / "alembic"
        / "versions"
        / "c9d0e1f2a3b4_supplier_bill_payments.py"
    )
    spec = importlib.util.spec_from_file_location("bill_payments_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _bill(client, number):
    r = client.post(
        "/ap/bills",
        json={
            "supplier_name": "Western Workwear",
            "bill_number": number,
            "amount_ex": 167.50,
            "tax": 16.75,
            "amount_inc": 184.25,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _pay(client, bill_id, amount):
    r = client.post(f"/ap/bills/{bill_id}/pay", json={"paid_amount": amount})
    assert r.status_code == 200, r.text


def _standing(db, source_type, source_id=None):
    q = db.query(JournalEntry).filter(
        JournalEntry.source_type == source_type,
        JournalEntry.reverses_id.is_(None),
        JournalEntry.reversed_by_id.is_(None),
    )
    if source_id is not None:
        q = q.filter(JournalEntry.source_id == str(source_id))
    return q.all()


def _what_the_old_code_posts(db, bill):
    """`bill_payment_lines` as it was before the migration (git HEAD)."""
    amount = money(bill.paid_amount)
    label = f"Payment of bill {bill.bill_number or bill.id}"
    party = bill.supplier_id or bill.supplier_name
    return [
        Line(account_for(db, "payable"), amount, label, "supplier", party),
        Line(account_for(db, "bank"), -amount, label, "supplier", party),
    ]


@pytest.mark.integration
class TestGoingBackToOnePaymentPerBill:
    def test_a_bill_paid_in_two_runs_has_the_one_entry_the_old_code_expects(
        self, client, db
    ):
        bill_id = _bill(client, "RV-B1")
        _pay(client, bill_id, 100.00)
        _pay(client, bill_id, 84.25)
        _migration().restore_one_entry_per_bill(db.connection())
        db.expire_all()

        bill = db.get(SupplierBill, bill_id)
        (entry,) = _standing(db, "bill_payment", bill_id)
        # So the old code's next sync of the bill keeps it, and posts nothing.
        assert matches(entry, _what_the_old_code_posts(db, bill))
        assert _standing(db, "supplier_payment") == []
        assert _bank(db) == Decimal("-184.25")

    def test_a_bill_paid_once_keeps_its_entry(self, client, db):
        bill_id = _bill(client, "RV-B2")
        _pay(client, bill_id, 184.25)
        (before,) = _standing(db, "supplier_payment")
        _migration().restore_one_entry_per_bill(db.connection())
        db.expire_all()

        (entry,) = _standing(db, "bill_payment", bill_id)
        assert entry.id == before.id
        assert _bank(db) == Decimal("-184.25")

    def test_a_part_payment_is_left_where_the_old_code_cannot_reverse_it(
        self, client, db
    ):
        """The old code posts no payment for a bill that is not paid, and
        reverses one it finds. Re-keyed, the part-payment would vanish from the
        bank on the bill's next save."""
        bill_id = _bill(client, "RV-B3")
        _pay(client, bill_id, 100.00)
        _migration().restore_one_entry_per_bill(db.connection())
        db.expire_all()

        assert _standing(db, "bill_payment", bill_id) == []
        assert len(_standing(db, "supplier_payment")) == 1
        assert _bank(db) == Decimal("-100.00")

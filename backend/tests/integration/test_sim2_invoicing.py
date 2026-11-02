"""Who an invoice bills and when it falls due: the 2026-11-01 simulation.

docs/backlog.md, SIM2:

- S2-01: a job booked by the online store carried no customer name, so its
  tax invoice named no buyer and aged receivables listed it as 'Unknown';
- S2-13: the invoice printed the goods' due date and the company's terms; a
  change to the customer's terms re-dated every open invoice; and aged
  receivables 'as at' a past date listed invoices raised after it.
"""

import importlib.util
import pathlib
from datetime import date, timedelta

import pytest
from reportlab.platypus import Paragraph
from sqlalchemy import text

from app.core import payment_terms
from app.models.customer import Customer
from app.models.job import Job
from app.models.job_payment import JobPayment
from app.routers import pdf

TODAY = date.today()


@pytest.fixture(autouse=True)
def customers(db):
    db.add(
        Customer(
            id="RICOH",
            name="Ricoh Australia",
            abn="51 824 753 556",
            payment_terms="30 EOM",
            credit_limit=99999.0,
        )
    )
    db.add(Customer(id="CLUB", name="Club Co", payment_terms="COD", credit_limit=9999))
    db.commit()


def _invoice(client, customer_id="RICOH", **fields):
    r = client.post(
        "/jobs",
        json={
            "customer_id": customer_id,
            "status": "INVOICE",
            "items": [{"description": "Polo", "order_qty": 1, "price_ex": 100}],
            **fields,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def _printed(client, monkeypatch, job_id):
    printed = []

    def spy(text, *args, **kwargs):
        printed.append(str(text))
        return Paragraph(text, *args, **kwargs)

    monkeypatch.setattr(pdf, "Paragraph", spy)
    r = client.get(f"/jobs/{job_id}/pdf?type=invoice")
    assert r.status_code == 200, r.text
    return " ".join(printed)


def _aged_lines(client, **params):
    r = client.get("/reports/aged-receivables", params=params)
    assert r.status_code == 200, r.text
    return {line["job_id"]: line for row in r.json()["rows"] for line in row["lines"]}


# ── S2-01: the buyer is named ────────────────────────────────────────────────


@pytest.mark.integration
class TestTheBuyerIsNamed:
    def test_a_portal_order_takes_the_customers_name(self, client_as):
        portal = client_as("portal")
        r = portal.post(
            "/jobs",
            json={
                "customer_id": "RICOH",
                "status": "New",
                "serial_no": "R501",
                "items": [{"description": "Polo", "order_qty": 1, "price_ex": 30}],
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["customer_name"] == "Ricoh Australia"

    def test_a_name_keyed_by_staff_is_kept(self, client):
        job = _invoice(client, customer_name="Ricoh Aust. — Brisbane")
        assert job["customer_name"] == "Ricoh Aust. — Brisbane"

    def test_moving_a_job_to_another_customer_takes_its_name(self, client):
        made = client.post(
            "/jobs", json={"customer_id": "RICOH", "status": "QUOTE", "items": []}
        ).json()
        r = client.patch(f"/jobs/{made['id']}", json={"customer_id": "CLUB"})
        assert r.status_code == 200, r.text
        assert r.json()["customer_name"] == "Club Co"

    def test_aged_receivables_names_the_customer(self, client):
        _invoice(client)
        rows = client.get("/reports/aged-receivables").json()["rows"]
        assert [r["customer_name"] for r in rows] == ["Ricoh Australia"]

    def test_the_migration_names_jobs_saved_without_one(self, db):
        path = (
            pathlib.Path(__file__).resolve().parents[2]
            / "alembic"
            / "versions"
            / "e7f8a9b0c1d2_sim2_invoice_terms_inc_prices_credits.py"
        )
        spec = importlib.util.spec_from_file_location("sim2_migration", path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        db.add(Job(id="OLD-1", customer_id="RICOH", customer_name=None))
        db.add(Job(id="OLD-2", customer_id="RICOH", customer_name="  "))
        db.add(Job(id="OLD-3", customer_id="RICOH", customer_name="Ricoh Brisbane"))
        db.commit()
        db.execute(text(migration.FILL_CUSTOMER_NAMES))
        db.expire_all()
        assert [db.get(Job, f"OLD-{n}").customer_name for n in (1, 2, 3)] == [
            "Ricoh Australia",
            "Ricoh Australia",
            "Ricoh Brisbane",
        ]

    def test_the_invoice_names_the_buyer_and_its_abn_from_the_master(
        self, client, db, monkeypatch
    ):
        # A job saved before this, with no name of its own.
        job = _invoice(client)
        db.get(Job, job["id"]).customer_name = None
        db.commit()
        text = _printed(client, monkeypatch, job["id"])
        assert "Ricoh Australia" in text
        assert "ABN: 51 824 753 556" in text


# ── S2-13: an invoice keeps the terms it was issued on ───────────────────────


@pytest.mark.integration
class TestAnInvoiceKeepsItsTerms:
    def test_invoicing_stamps_the_customers_terms_and_due_date(self, client, db):
        job = _invoice(client)
        stored = db.get(Job, job["id"])
        assert stored.invoice_terms == "30 EOM"
        assert stored.invoice_due_date == (
            payment_terms.due_date(TODAY, "30 EOM").isoformat()
        )

    def test_changing_the_customers_terms_does_not_redate_it(self, client):
        job = _invoice(client, customer_id="CLUB")
        before = _aged_lines(client)[job["id"]]["due_date"]
        assert before == TODAY.isoformat()  # COD
        r = client.patch("/customers/CLUB", json={"payment_terms": "30DAYSINV"})
        assert r.status_code == 200, r.text
        assert _aged_lines(client)[job["id"]]["due_date"] == before

    def test_the_pdf_prints_the_invoices_terms_and_due_date_not_the_goods(
        self, client, monkeypatch
    ):
        job = _invoice(client, due="2099-12-15")
        text = _printed(client, monkeypatch, job["id"])
        assert "Terms: <b>30 EOM</b>" in text
        assert payment_terms.due_date(TODAY, "30 EOM").isoformat() in text
        assert "2099-12-15" not in text

    def test_an_invoice_from_before_still_prints_terms_and_a_due_date(
        self, client, db, monkeypatch
    ):
        job = _invoice(client)
        stored = db.get(Job, job["id"])
        stored.invoice_terms = stored.invoice_due_date = None
        stored.invoice_date = "2026-03-15"
        db.commit()
        text = _printed(client, monkeypatch, job["id"])
        assert "Terms: <b>30 EOM</b>" in text
        assert "2026-04-30" in text

    def test_recalled_and_reissued_it_takes_the_terms_of_that_day(self, client, db):
        job = _invoice(client, customer_id="CLUB")
        client.patch("/customers/CLUB", json={"payment_terms": "Net 14"})
        assert (
            client.post(f"/jobs/{job['id']}/status", json={"status": "FINISH"})
        ).status_code == 200
        assert (
            client.post(f"/jobs/{job['id']}/status", json={"status": "INVOICE"})
        ).status_code == 200
        db.expire_all()
        assert db.get(Job, job["id"]).invoice_terms == "Net 14"


@pytest.mark.integration
class TestReceivablesAsAtADate:
    def test_an_invoice_raised_after_the_date_is_not_listed(self, client):
        job = _invoice(client)
        yesterday = (TODAY - timedelta(days=1)).isoformat()
        assert job["id"] not in _aged_lines(client, as_at=yesterday)
        assert job["id"] in _aged_lines(client, as_at=TODAY.isoformat())

    def test_an_invoice_paid_since_is_listed_at_what_was_owed_then(self, client, db):
        job = _invoice(client)
        stored = db.get(Job, job["id"])
        stored.invoice_date = "2026-09-01"
        stored.invoice_due_date = "2026-10-31"
        db.commit()
        r = client.post(f"/jobs/{job['id']}/payment", json={"amount": 110})
        assert r.status_code == 200, r.text
        # The payment is dated today, so as at the end of September the whole
        # invoice was still owed — and today none of it is.
        line = _aged_lines(client, as_at="2026-09-30")[job["id"]]
        assert line["balance_due"] == 110.0
        assert job["id"] not in _aged_lines(client)

    def test_a_payment_dated_before_the_date_counts(self, client, db):
        job = _invoice(client)
        stored = db.get(Job, job["id"])
        stored.invoice_date = "2026-09-01"
        db.add(
            JobPayment(
                job_id=job["id"], amount=40, method="EFT", received_date="2026-09-10"
            )
        )
        stored.deposit = 40
        stored.balance_due = 70
        db.commit()
        assert _aged_lines(client, as_at="2026-09-30")[job["id"]]["balance_due"] == 70

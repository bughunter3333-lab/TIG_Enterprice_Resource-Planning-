"""One customer remittance, paying several invoices (finding F35).

Portal clients pay many small per-employee invoices in one EFT. Recording it
meant a payment per job, each typed by the caller, with the remittance's
reference retyped on each. Now the remittance is recorded once — allocated as
given, or to the customer's oldest invoices first — and comes out as one
payment per job, posted to the ledger like any other.
"""

from decimal import Decimal

import pytest

from app.core.ledger import account_for, money
from app.models.customer import Customer
from app.models.job import Job
from app.models.job_payment import JobPayment
from app.models.ledger import JournalLine


def _invoice(db, job_id, inc, invoiced, customer="CFG"):
    if not db.get(Customer, customer):
        db.add(Customer(id=customer, name=f"Cust {customer}", credit_limit=99999.0))
    db.add(
        Job(
            id=job_id,
            customer_id=customer,
            customer_name=f"Cust {customer}",
            status="INVOICE",
            invoice=f"INV-{job_id}",
            invoice_date=invoiced,
            total_ex=round(inc / 1.1, 2),
            tax=round(inc - inc / 1.1, 2),
            total_inc=inc,
            deposit=0,
            balance_due=inc,
        )
    )
    db.commit()


def _remit(client, customer="CFG", **body):
    return client.post(
        f"/customers/{customer}/remittances",
        json={"method": "EFT", "reference": "CFG-REMIT-0042", **body},
    )


def _bank(db):
    account = account_for(db, "bank")
    lines = db.query(JournalLine).filter(JournalLine.account_id == account.id)
    return sum((money(ln.debit) - money(ln.credit) for ln in lines), Decimal("0"))


@pytest.fixture
def three(db):
    _invoice(db, "R-1", 110.00, "2026-09-01")
    _invoice(db, "R-2", 220.00, "2026-09-15")
    _invoice(db, "R-3", 330.00, "2026-10-01")


@pytest.mark.integration
class TestOneRemittanceManyInvoices:
    def test_it_pays_each_invoice_it_names(self, client, db, three):
        r = _remit(
            client,
            amount=660.00,
            allocations=[
                {"job_id": "R-1", "amount": 110.00},
                {"job_id": "R-2", "amount": 220.00},
                {"job_id": "R-3", "amount": 330.00},
            ],
        )
        assert r.status_code == 200, r.text
        assert [(p["job_id"], p["amount"]) for p in r.json()["payments"]] == [
            ("R-1", 110.0),
            ("R-2", 220.0),
            ("R-3", 330.0),
        ]
        db.expire_all()
        assert {j.id: float(j.balance_due) for j in db.query(Job)} == {
            "R-1": 0,
            "R-2": 0,
            "R-3": 0,
        }
        assert {p.reference for p in db.query(JobPayment)} == {"CFG-REMIT-0042"}
        assert float(db.get(Customer, "CFG").balance) == 0
        assert _bank(db) == Decimal("660.00")

    def test_left_to_itself_it_pays_the_oldest_first(self, client, db, three):
        r = _remit(client, amount=400.00)
        assert r.status_code == 200, r.text
        assert [(p["job_id"], p["amount"]) for p in r.json()["payments"]] == [
            ("R-1", 110.0),
            ("R-2", 220.0),
            ("R-3", 70.0),
        ]
        assert r.json()["customer_balance"] == 260.0

    def test_an_allocation_that_does_not_add_up_is_refused(self, client, db, three):
        r = _remit(
            client, amount=500.00, allocations=[{"job_id": "R-1", "amount": 110.00}]
        )
        assert r.status_code == 422
        assert db.query(JobPayment).count() == 0

    def test_more_than_is_owed_is_refused(self, client, db, three):
        r = _remit(client, amount=700.00)
        assert r.status_code == 422
        assert "660.00" in r.json()["detail"]
        assert db.query(JobPayment).count() == 0

    def test_more_than_an_invoice_owes_is_refused(self, client, db, three):
        r = _remit(
            client,
            amount=200.00,
            allocations=[
                {"job_id": "R-1", "amount": 150.00},
                {"job_id": "R-2", "amount": 50.00},
            ],
        )
        assert r.status_code == 422
        assert "R-1" in r.json()["detail"]

    def test_another_customers_job_is_not_theirs_to_pay(self, client, db, three):
        _invoice(db, "OTHER-1", 50.00, "2026-09-01", customer="OTH")
        r = _remit(
            client, amount=50.00, allocations=[{"job_id": "OTHER-1", "amount": 50.00}]
        )
        assert r.status_code == 422
        assert db.query(JobPayment).count() == 0

    def test_nothing_is_taken_if_any_part_is_refused(self, client, db, three):
        r = _remit(
            client,
            amount=120.00,
            allocations=[
                {"job_id": "R-1", "amount": 110.00},
                {"job_id": "NOPE", "amount": 10.00},
            ],
        )
        assert r.status_code == 422
        db.expire_all()
        assert float(db.get(Job, "R-1").balance_due) == 110.0

    def test_overseas_staff_do_not_take_money(self, client_as, three):
        r = client_as("overseas_staff").post(
            "/customers/CFG/remittances", json={"amount": 110.0, "method": "EFT"}
        )
        assert r.status_code == 403

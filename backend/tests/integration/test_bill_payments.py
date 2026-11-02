"""Paying a supplier bill in more than one run (simulation finding F07).

A $184.25 bill paid as $100.00 and then $84.25 used to finish with
paid_amount 84.25 and status 'paid' after the first run: each payment overwrote
the last, so the ledger recorded $84.25 leaving the bank when $184.25 had, and
the accounting health check agreed with it because it read the same field.

Each payment is now its own record with its own ledger entry on its own date,
the bill is 'paid' only once its payments cover it, and a payment that would
overpay it is refused.
"""

import importlib.util
import pathlib
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.core.ledger import ZERO, account_for, money
from app.models.ledger import JournalEntry, JournalLine
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.supplier_bill import SupplierBill
from app.models.supplier_bill_payment import SupplierBillPayment

TODAY = date.today()


def _bill(client, **fields):
    body = {
        "supplier_name": "Western Workwear",
        "bill_number": "WWS-INV-44120",
        "bill_date": TODAY.isoformat(),
        "due_date": (TODAY + timedelta(days=30)).isoformat(),
        "amount_ex": 167.50,
        "tax": 16.75,
        "amount_inc": 184.25,
        **fields,
    }
    r = client.post("/ap/bills", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _pay(client, bill_id, amount, paid_date=None):
    return client.post(
        f"/ap/bills/{bill_id}/pay",
        json={"paid_amount": amount, "paid_date": paid_date},
    )


def _balance(db, role):
    account = account_for(db, role)
    lines = db.query(JournalLine).filter(JournalLine.account_id == account.id)
    return sum((money(ln.debit) - money(ln.credit) for ln in lines), Decimal("0"))


def _standing_payment_entries(db):
    return (
        db.query(JournalEntry)
        .filter(
            JournalEntry.source_type == "supplier_payment",
            JournalEntry.reverses_id.is_(None),
            JournalEntry.reversed_by_id.is_(None),
        )
        .all()
    )


@pytest.mark.integration
class TestPartPayments:
    def test_two_payments_add_up(self, client, db):
        bill = _bill(client)
        first = _pay(client, bill["id"], 100.00)
        assert first.status_code == 200, first.text
        assert first.json()["paid_amount"] == 100.00
        assert first.json()["status"] == "pending"

        second = _pay(client, bill["id"], 84.25)
        assert second.status_code == 200, second.text
        assert second.json()["paid_amount"] == 184.25
        assert second.json()["status"] == "paid"

    def test_the_ledger_records_every_payment(self, client, db):
        bill = _bill(client)
        _pay(client, bill["id"], 100.00)
        _pay(client, bill["id"], 84.25)
        assert _balance(db, "payable") == 0
        assert _balance(db, "bank") == Decimal("-184.25")
        assert len(_standing_payment_entries(db)) == 2

    def test_each_payment_posts_on_its_own_date(self, client, db):
        bill = _bill(client)
        earlier = (TODAY - timedelta(days=3)).isoformat()
        _pay(client, bill["id"], 100.00, earlier)
        _pay(client, bill["id"], 84.25)
        dates = sorted(e.entry_date.isoformat() for e in _standing_payment_entries(db))
        assert dates == [earlier, TODAY.isoformat()]

    def test_a_payment_that_would_overpay_is_refused(self, client, db):
        bill = _bill(client)
        _pay(client, bill["id"], 100.00)
        r = _pay(client, bill["id"], 100.00)
        assert r.status_code == 409
        assert "84.25" in r.json()["detail"]
        assert _balance(db, "bank") == Decimal("-100.00")

    def test_a_paid_bill_takes_no_more_payments(self, client, db):
        bill = _bill(client)
        _pay(client, bill["id"], 184.25)
        assert _pay(client, bill["id"], 0.01).status_code == 409

    def test_a_payment_must_be_positive(self, client, db):
        bill = _bill(client)
        assert _pay(client, bill["id"], 0).status_code == 422
        assert _pay(client, bill["id"], -5).status_code == 422

    def test_the_bill_lists_its_payments(self, client, db):
        bill = _bill(client)
        _pay(client, bill["id"], 100.00)
        _pay(client, bill["id"], 84.25)
        payments = client.get(f"/ap/bills/{bill['id']}").json()["payments"]
        assert [p["amount"] for p in payments] == [100.00, 84.25]
        assert all(p["paid_by"] for p in payments)

    def test_the_health_check_sees_the_payments(self, client, db):
        bill = _bill(client)
        _pay(client, bill["id"], 100.00)
        health = client.get("/accounting/health").json()
        assert health["payables"]["documents"] == 84.25
        assert health["payables"]["difference"] == 0


@pytest.mark.integration
class TestTakingAPaymentBack:
    def test_deleting_a_payment_reverses_it_and_reopens_the_bill(self, client, db):
        bill = _bill(client)
        _pay(client, bill["id"], 100.00)
        paid = _pay(client, bill["id"], 84.25).json()
        payment_id = paid["payments"][-1]["id"]

        r = client.delete(f"/ap/bills/{bill['id']}/payments/{payment_id}")
        assert r.status_code == 200, r.text
        assert r.json()["paid_amount"] == 100.00
        assert r.json()["status"] == "approved"
        assert _balance(db, "bank") == Decimal("-100.00")

    def test_a_payment_of_another_bill_is_not_found(self, client, db):
        one = _bill(client)
        other = _bill(client, bill_number="B-OTHER")
        payment_id = _pay(client, one["id"], 10).json()["payments"][0]["id"]
        r = client.delete(f"/ap/bills/{other['id']}/payments/{payment_id}")
        assert r.status_code == 404

    def test_deleting_the_bill_reverses_its_payments(self, client, db):
        bill = _bill(client)
        _pay(client, bill["id"], 100.00)
        _pay(client, bill["id"], 84.25)
        assert client.delete(f"/ap/bills/{bill['id']}").status_code == 204
        assert _balance(db, "payable") == 0 and _balance(db, "bank") == 0
        assert _standing_payment_entries(db) == []


@pytest.mark.integration
class TestPaidIsDerived:
    def test_a_bill_cannot_be_created_already_paid(self, client):
        r = client.post(
            "/ap/bills",
            json={"supplier_name": "X", "amount_inc": 50, "status": "paid"},
        )
        assert r.status_code == 400

    def test_a_bill_cannot_be_marked_paid_by_hand(self, client):
        bill = _bill(client)
        r = client.patch(f"/ap/bills/{bill['id']}", json={"status": "paid"})
        assert r.status_code == 400
        assert client.get(f"/ap/bills/{bill['id']}").json()["status"] == "pending"

    def test_a_bill_cannot_be_cut_below_what_has_been_paid(self, client):
        bill = _bill(client)
        _pay(client, bill["id"], 100.00)
        r = client.patch(
            f"/ap/bills/{bill['id']}",
            json={"amount_ex": 50.0, "tax": 5.0, "amount_inc": 55.0},
        )
        assert r.status_code == 409

    def test_raising_a_paid_bill_reopens_it(self, client):
        bill = _bill(client)
        _pay(client, bill["id"], 184.25)
        r = client.patch(
            f"/ap/bills/{bill['id']}",
            json={"amount_ex": 200.0, "tax": 20.0, "amount_inc": 220.0},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"


@pytest.mark.integration
class TestTheSummaryCountsWhatIsStillOwed:
    def test_a_part_paid_bill_counts_its_balance(self, client):
        bill = _bill(client)
        _pay(client, bill["id"], 100.00)
        summary = client.get("/ap/summary").json()
        assert summary["total_open_count"] == 1
        assert summary["total_open_amount"] == 84.25

    def test_an_overdue_part_paid_bill_is_overdue_for_its_balance(self, client):
        bill = _bill(client, due_date=(TODAY - timedelta(days=1)).isoformat())
        _pay(client, bill["id"], 100.00)
        summary = client.get("/ap/summary").json()
        assert summary["overdue_count"] == 1
        assert summary["overdue_amount"] == 84.25


@pytest.mark.integration
class TestABillAgainstAPurchaseOrderIsMatched:
    """F36: a bill was whatever was typed; nothing compared it with the PO or
    with what had actually arrived. Now each bill against a PO says what was
    received against that PO, landed costs included, and whether the bills for
    it come to that."""

    def _received_po(self, client, db, make_inventory):
        make_inventory(sku="POLO-XL", stock=0)
        db.add(
            PurchaseOrder(
                id="PO-M1",
                supplier_name="Western Workwear",
                status="Sent",
                items=[
                    PurchaseOrderItem(sku="POLO-XL", qty_ordered=10, unit_cost=15.55)
                ],
            )
        )
        db.commit()
        gr = client.post(
            "/goods-receipts",
            json={
                "po_id": "PO-M1",
                "received_date": TODAY.isoformat(),
                "lines": [{"sku": "POLO-XL", "qty_received": 10, "unit_cost": 15.55}],
                "charges": [{"description": "Freight", "amount": 12.0}],
            },
        ).json()
        client.post(f"/goods-receipts/{gr['id']}/accept")

    def test_a_bill_for_what_arrived_matches(self, client, db, make_inventory):
        self._received_po(client, db, make_inventory)
        bill = _bill(
            client, po_id="PO-M1", amount_ex=167.50, tax=16.75, amount_inc=184.25
        )
        match = client.get(f"/ap/bills/{bill['id']}").json()["po_match"]
        assert match == {
            "po_id": "PO-M1",
            "ordered_inc": 171.05,
            "received_inc": 184.25,
            "billed_inc": 184.25,
            "difference": 0.0,
            "matches": True,
        }

    def test_a_bill_for_more_than_arrived_says_by_how_much(
        self, client, db, make_inventory
    ):
        self._received_po(client, db, make_inventory)
        bill = _bill(
            client, po_id="PO-M1", amount_ex=181.82, tax=18.18, amount_inc=200.0
        )
        listed = client.get("/ap/bills").json()
        (row,) = [b for b in listed if b["id"] == bill["id"]]
        assert row["po_match"]["difference"] == 15.75
        assert row["po_match"]["matches"] is False

    def test_a_bill_against_no_purchase_order_has_nothing_to_match(self, client):
        bill = _bill(client)
        assert client.get(f"/ap/bills/{bill['id']}").json()["po_match"] is None


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


@pytest.mark.integration
class TestCarryingOverBillsPaidTheOldWay:
    """The migration's data step, on bills written the way the old code wrote them."""

    def _legacy(self, db, **fields):
        bill = SupplierBill(
            supplier_name="Western Workwear",
            amount_ex=167.50,
            tax=16.75,
            amount_inc=184.25,
            **fields,
        )
        db.add(bill)
        db.flush()
        return bill

    def _old_entry(self, db, bill):
        entry = JournalEntry(
            entry_date=TODAY,
            memo="Paid bill",
            source_type="bill_payment",
            source_id=str(bill.id),
            created_by="System",
        )
        db.add(entry)
        db.flush()
        return entry

    def test_a_paid_bill_becomes_one_payment_and_keeps_its_entry(self, db):
        bill = self._legacy(
            db, status="paid", paid_amount=184.25, paid_date=TODAY.isoformat()
        )
        entry = self._old_entry(db, bill)
        _migration().carry_over_existing_payments(db.connection())
        db.expire_all()

        (payment,) = db.query(SupplierBillPayment).filter_by(bill_id=bill.id).all()
        assert money(payment.amount) == Decimal("184.25")
        assert payment.paid_date == TODAY.isoformat()
        entry = db.get(JournalEntry, entry.id)
        assert (entry.source_type, entry.source_id) == (
            "supplier_payment",
            str(payment.id),
        )
        assert db.get(SupplierBill, bill.id).status == "paid"

    def test_an_overwritten_part_payment_reopens_the_bill(self, db):
        bill = self._legacy(db, status="paid", paid_amount=84.25)
        _migration().carry_over_existing_payments(db.connection())
        db.expire_all()
        assert db.get(SupplierBill, bill.id).status == "approved"

    def test_an_amount_that_was_never_posted_is_cleared(self, db):
        bill = self._legacy(db, status="pending", paid_amount=50.0)
        _migration().carry_over_existing_payments(db.connection())
        db.expire_all()
        assert money(db.get(SupplierBill, bill.id).paid_amount) == ZERO
        assert db.query(SupplierBillPayment).filter_by(bill_id=bill.id).count() == 0

    def test_an_entry_of_a_deleted_bill_is_left_as_history(self, db):
        entry = JournalEntry(
            entry_date=TODAY,
            source_type="bill_payment",
            source_id="99999",
            created_by="System",
        )
        db.add(entry)
        db.flush()
        _migration().carry_over_existing_payments(db.connection())
        db.expire_all()
        assert db.get(JournalEntry, entry.id).source_type == "bill_payment"


@pytest.mark.integration
class TestBackfill:
    def test_bringing_history_in_posts_each_payment_once(self, client, db):
        bill = _bill(client)
        _pay(client, bill["id"], 100.00)
        _pay(client, bill["id"], 84.25)
        before = db.query(JournalEntry).count()
        r = client.post("/accounting/backfill")
        assert r.status_code == 200, r.text
        assert db.query(JournalEntry).count() == before
        assert r.json()["health"]["payables"]["difference"] == 0

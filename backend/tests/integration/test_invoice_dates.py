"""Every invoiced job carries an invoice date, however it became invoiced.

The ledger found this. Its BAS disagreed with the BAS computed from jobs, and
the difference was three jobs invoiced without a date: the document report
selects by invoice date, so it silently left them out — sales and GST missing
from a figure that is lodged with the ATO.

A job could become invoiced four ways and only one of them dated it: moved to
INVOICE through a status change. Moved straight to PAID, created already
invoiced, or imported from Jim2, it carried no date at all.
"""

from datetime import date

import pytest

from app.models.customer import Customer
from app.models.job import Job

TODAY = "2026-11-10"


# The shop's day, pinned: 21:00 UTC on 9 November is 8am on the 10th in Sydney,
# while the API's own date is still the 9th.
@pytest.fixture(autouse=True)
def _on_the_shops_day(shop_clock):
    shop_clock("2026-11-09 21:00")


def _finish_job(db, job_id):
    if not db.query(Customer).filter_by(id="IDC").first():
        db.add(Customer(id="IDC", name="Dated Co", credit_limit=100000.0))
    db.add(
        Job(
            id=job_id,
            customer_id="IDC",
            customer_name="Dated Co",
            status="FINISH",
            invoice=f"INV-{job_id}",
            total_ex=100,
            tax=10,
            total_inc=110,
            deposit=0,
            balance_due=110,
        )
    )
    db.commit()


@pytest.mark.integration
class TestEveryWayInIsDated:
    def test_straight_to_paid(self, client, db):
        # A cash sale: paid at the counter, then marked PAID in one move. A job
        # is PAID only once its payments cover it, so the payment comes first.
        _finish_job(db, "ID-PAID")
        assert (
            client.post("/jobs/ID-PAID/payment", json={"amount": 110}).status_code
            == 200
        )
        assert (
            client.post("/jobs/ID-PAID/status", json={"status": "PAID"}).status_code
            == 200
        )
        db.expire_all()
        assert db.get(Job, "ID-PAID").invoice_date == TODAY

    def test_created_already_invoiced(self, client, db):
        db.add(Customer(id="IDC2", name="Made Invoiced", credit_limit=100000.0))
        db.commit()
        r = client.post(
            "/jobs",
            json={
                "id": "ID-NEW",
                "customer_id": "IDC2",
                "customer_name": "Made Invoiced",
                "status": "INVOICE",
                "invoice": "INV-ID-NEW",
                # The total is the lines' (F04): a lineless job totals zero.
                "items": [{"description": "Polo", "order_qty": 1, "price_ex": 100}],
            },
        )
        assert r.status_code == 200, r.text
        db.expire_all()
        assert db.get(Job, "ID-NEW").invoice_date == TODAY
        # ...and it posted, so the ledger and the job agree from the start.
        assert client.get("/accounting/health").json()["unposted_invoices"] == []

    def test_imported_from_jim2_with_day_first_dates(self, client, db):
        csv = (
            "Job#,Cust#,Customer,Status,Inv#,Inv Date,Total Ex,Tax,Total Inc\n"
            "ID-IMP,IDC3,Imported Co,Invoiced,INV-9,05/06/2026,100,10,110\n"
        )
        r = client.post("/import/jobs", files={"file": ("jobs.csv", csv, "text/csv")})
        assert r.status_code == 200, r.text
        db.expire_all()
        job = db.get(Job, "ID-IMP")
        # Day-first, as Jim2 writes it, stored the way the reports compare it.
        assert job.invoice_date == "2026-06-05"


@pytest.mark.integration
class TestWhatCannotBePlacedIsSaid:
    def _undated(self, db):
        db.add(Customer(id="IDU", name="Undated Co", credit_limit=100000.0))
        db.add(
            Job(
                id="ID-UNDATED",
                customer_id="IDU",
                customer_name="Undated Co",
                status="INVOICE",
                invoice="INV-U",
                total_ex=200,
                tax=20,
                total_inc=220,
                deposit=0,
                balance_due=220,
            )
        )
        db.commit()

    def test_the_bas_report_says_it_is_short(self, client, db):
        self._undated(db)
        undated = client.get("/reports/bas-summary").json()["undated_invoices"]
        assert undated == {"count": 1, "sales_inc_gst": 220.0, "gst": 20.0}

    def test_the_ledger_health_lists_them(self, client, db):
        self._undated(db)
        client.post("/accounting/backfill")
        rows = client.get("/accounting/health").json()["invoiced_without_date"]
        assert [r["job_id"] for r in rows] == ["ID-UNDATED"]


@pytest.mark.integration
class TestDatedOnTheShopsDay:
    """The API runs in UTC and the shop is in Sydney.

    22:00 UTC on 30 June is 8am on 1 July in Sydney: an invoice issued then is
    the new financial year's, in the September BAS quarter. Dated by the
    server's clock it was 30 June's — the wrong year and the wrong BAS.
    """

    def test_an_invoice_is_dated_and_posted_on_the_shops_day(
        self, client, db, shop_clock
    ):
        from app.models.ledger import JournalEntry

        shop_clock("2026-06-30 22:00")
        _finish_job(db, "ID-SYD")
        r = client.post("/jobs/ID-SYD/status", json={"status": "INVOICE"})
        assert r.status_code == 200, r.text
        db.expire_all()
        job = db.get(Job, "ID-SYD")
        assert job.invoice_date == "2026-07-01"
        entry = (
            db.query(JournalEntry)
            .filter_by(source_type="invoice", source_id="ID-SYD")
            .one()
        )
        assert entry.entry_date == date(2026, 7, 1)

    def test_a_payment_is_received_on_the_shops_day(self, client, db, shop_clock):
        from app.models.job_payment import JobPayment

        shop_clock("2026-06-30 22:00")
        _finish_job(db, "ID-SYD-PAY")
        r = client.post("/jobs/ID-SYD-PAY/payment", json={"amount": 50})
        assert r.status_code == 200, r.text
        db.expire_all()
        payment = db.query(JobPayment).filter_by(job_id="ID-SYD-PAY").one()
        assert payment.received_date == "2026-07-01"

    def test_a_backdated_payment_that_settles_it_is_the_day_it_was_paid(
        self, client, db
    ):
        # Keyed on Monday for a cheque banked last Thursday: the job was paid
        # on Thursday, not on the day someone typed it in.
        _finish_job(db, "ID-BACKDATED")
        r = client.post(
            "/jobs/ID-BACKDATED/payment",
            json={"amount": 110, "received_date": "2026-11-05"},
        )
        assert r.status_code == 200, r.text
        db.expire_all()
        assert db.get(Job, "ID-BACKDATED").payment_date == "2026-11-05"

    def test_a_job_sent_without_a_date_is_booked_in_on_the_shops_day(self, client, db):
        # The online store sends none: undated, the job was missing from the
        # sales register's date range and printed the server's day.
        db.add(Customer(id="IDC3", name="Store Co", credit_limit=100000.0))
        db.commit()
        r = client.post(
            "/jobs",
            json={
                "customer_id": "IDC3",
                "items": [{"description": "Polo", "order_qty": 1, "price_ex": 10}],
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["date_in"] == "2026-11-10"

    def test_the_sale_is_dated_as_the_invoice_it_ships_on(
        self, client, db, make_inventory
    ):
        # A Jim2 re-import brings the job's own invoice date with it: the stock
        # left on that day, as the invoice and its ledger entry say.
        from app.models.inventory import StockMovement
        from app.models.job import JobItem

        make_inventory(sku="ID-POLO", stock=10)
        _finish_job(db, "ID-KEPT")
        job = db.get(Job, "ID-KEPT")
        job.invoice_date = "2026-10-03"
        db.add(
            JobItem(
                job_id="ID-KEPT",
                sort=0,
                stock_code="ID-POLO",
                description="Polo",
                order_qty=2,
                supply_qty=2,
                b_ord=0,
                price_ex=50,
            )
        )
        db.commit()
        r = client.post("/jobs/ID-KEPT/status", json={"status": "INVOICE"})
        assert r.status_code == 200, r.text
        db.expire_all()
        assert db.get(Job, "ID-KEPT").invoice_date == "2026-10-03"
        sale = db.query(StockMovement).filter_by(job_id="ID-KEPT", type="Sale").one()
        assert sale.date == "2026-10-03"

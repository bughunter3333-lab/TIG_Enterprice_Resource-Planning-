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

TODAY = date.today().isoformat()


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
        _finish_job(db, "ID-PAID")
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
                "total_ex": 100,
                "tax": 10,
                "total_inc": 110,
                "items": [],
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

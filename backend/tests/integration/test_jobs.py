"""
Integration tests for /jobs endpoints.

Covers: CRUD, status transitions, payment recording, credit checks, PDF.
"""

import pytest
from app.models.job import Job
from app.models.customer import Customer


def _make_job(
    db,
    job_id: str,
    customer_id: str,
    status: str = "QUOTE",
    total_inc: float = 110.0,
    total_ex: float = 100.0,
) -> Job:
    if not db.query(Customer).filter_by(id=customer_id).first():
        db.add(
            Customer(id=customer_id, name=f"Cust {customer_id}", credit_limit=10000.0)
        )
    j = Job(
        id=job_id,
        customer_id=customer_id,
        customer_name=f"Cust {customer_id}",
        status=status,
        date_in="2025-09-01",
        total_ex=total_ex,
        tax=round(total_ex * 0.1, 2),
        total_inc=total_inc,
        deposit=0,
        balance_due=total_inc,
    )
    db.add(j)
    db.commit()
    db.refresh(j)
    return j


@pytest.mark.integration
class TestJobCRUD:
    def test_list_jobs_empty(self, client):
        r = client.get("/jobs/")
        assert r.status_code == 200
        assert "jobs" in r.json() or isinstance(r.json(), list)

    def test_create_job(self, client, make_customer):
        make_customer(id="JCUST01")
        r = client.post(
            "/jobs/",
            json={
                "id": "J-T001",
                "customer_id": "JCUST01",
                "customer_name": "Cust JCUST01",
                "status": "QUOTE",
                "date_in": "2025-09-01",
                "total_ex": 100.0,
                "tax": 10.0,
                "total_inc": 110.0,
                "deposit": 0,
                "balance_due": 110.0,
            },
        )
        assert r.status_code in (200, 201)

    def test_create_job_returns_line_items(self, client, make_customer):
        """The create response must include the saved line items (not an empty list)."""
        make_customer(id="JITEMS")
        r = client.post(
            "/jobs",
            json={
                "customer_id": "JITEMS",
                "status": "QUOTE",
                "total_ex": 180.0,
                "tax": 18.0,
                "total_inc": 198.0,
                "balance_due": 198.0,
                "items": [
                    {
                        "display_type": "product",
                        "description": "Staple Tee",
                        "stock_code": "AS5026",
                        "order_qty": 10,
                        "qty": 10,
                        "price_ex": 18.0,
                        "total": 180.0,
                        "decoration_type": "EMB",
                        "emb_code": "E-123",
                    }
                ],
            },
        )
        assert r.status_code in (200, 201)
        body = r.json()
        assert len(body["items"]) == 1
        assert body["items"][0]["description"] == "Staple Tee"
        assert body["items"][0]["emb_code"] == "E-123"

    def test_get_job_not_found(self, client):
        r = client.get("/jobs/NONEXISTENT")
        assert r.status_code == 404

    def test_get_job_found(self, client, db, make_customer):
        make_customer(id="JCUST02")
        _make_job(db, "J-T002", "JCUST02")
        r = client.get("/jobs/J-T002")
        assert r.status_code == 200

    def test_delete_job(self, client, db, make_customer):
        make_customer(id="JCUST03")
        _make_job(db, "J-T003", "JCUST03")
        r = client.delete("/jobs/J-T003")
        assert r.status_code == 200

    def test_next_id_returns_string(self, client):
        r = client.get("/jobs/next-id")
        assert r.status_code == 200
        data = r.json()
        assert "id" in data or "next_id" in data or isinstance(data, str)


@pytest.mark.integration
class TestJobStatusTransitions:
    def test_transition_quote_to_order(self, client, db, make_customer):
        make_customer(id="JCUST10", credit_limit=5000.0)
        _make_job(db, "J-S001", "JCUST10", status="QUOTE")
        r = client.post("/jobs/J-S001/status", json={"status": "ORDER"})
        assert r.status_code == 200

    def test_transition_to_invoice_sets_invoice_date(self, client, db, make_customer):
        make_customer(id="JCUST11", credit_limit=5000.0)
        job = _make_job(db, "J-S002", "JCUST11", status="FINISH")
        # Patch invoice number first so validation passes
        job.invoice = "INV-001"
        job.total_inc = 110.0
        db.commit()
        r = client.post("/jobs/J-S002/status", json={"status": "INVOICE"})
        assert r.status_code == 200
        # Reload from DB
        db.expire_all()
        updated = db.query(Job).filter_by(id="J-S002").first()
        assert updated.invoice_date is not None

    def test_transition_to_cancel(self, client, db, make_customer):
        make_customer(id="JCUST12", credit_limit=5000.0)
        _make_job(db, "J-S003", "JCUST12", status="ORDER")
        r = client.post("/jobs/J-S003/status", json={"status": "CANCEL"})
        assert r.status_code == 200


@pytest.mark.integration
class TestJobPayments:
    def test_record_payment_reduces_balance(self, client, db, make_customer):
        make_customer(id="JCUST20", credit_limit=5000.0)
        job = _make_job(
            db, "J-P001", "JCUST20", status="INVOICE", total_inc=110.0, total_ex=100.0
        )
        job.invoice = "INV-P001"
        job.invoice_date = "2025-09-10"
        db.commit()

        r = client.post(
            "/jobs/J-P001/payment",
            json={
                "amount": 55.0,
                "method": "EFT",
                "reference": "REF001",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert float(data.get("balance_due", 999)) == pytest.approx(55.0)

    def test_full_payment_marks_paid(self, client, db, make_customer):
        make_customer(id="JCUST21", credit_limit=5000.0)
        job = _make_job(
            db, "J-P002", "JCUST21", status="INVOICE", total_inc=110.0, total_ex=100.0
        )
        job.invoice = "INV-P002"
        job.invoice_date = "2025-09-10"
        db.commit()

        r = client.post("/jobs/J-P002/payment", json={"amount": 110.0, "method": "EFT"})
        assert r.status_code == 200
        data = r.json()
        assert data.get("payment_status") == "paid"

    def test_overpayment_rejected(self, client, db, make_customer):
        make_customer(id="JCUST22", credit_limit=5000.0)
        job = _make_job(
            db, "J-P003", "JCUST22", status="INVOICE", total_inc=110.0, total_ex=100.0
        )
        job.invoice = "INV-P003"
        job.invoice_date = "2025-09-10"
        db.commit()

        r = client.post("/jobs/J-P003/payment", json={"amount": 200.0, "method": "EFT"})
        assert r.status_code in (400, 422)


@pytest.mark.integration
class TestJobPDF:
    def test_invoice_pdf_returns_pdf(self, client, db, make_customer):
        make_customer(id="JCUST30")
        job = _make_job(
            db, "J-PDF1", "JCUST30", status="INVOICE", total_inc=110.0, total_ex=100.0
        )
        job.invoice = "INV-PDF1"
        job.invoice_date = "2025-09-15"
        db.commit()

        r = client.get("/jobs/J-PDF1/pdf?type=invoice")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert len(r.content) > 1000  # real PDF, not empty

    def test_quote_pdf_returns_pdf(self, client, db, make_customer):
        make_customer(id="JCUST31")
        job = _make_job(
            db, "J-PDF2", "JCUST31", status="QUOTE", total_inc=110.0, total_ex=100.0
        )
        job.quote = "Q-PDF2"
        db.commit()

        r = client.get("/jobs/J-PDF2/pdf?type=quote")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"

    def test_pdf_job_not_found_returns_404(self, client):
        r = client.get("/jobs/NOPE/pdf")
        assert r.status_code == 404

    def test_pdf_invalid_type_rejected(self, client, db, make_customer):
        make_customer(id="JCUST32")
        _make_job(db, "J-PDF3", "JCUST32")
        r = client.get("/jobs/J-PDF3/pdf?type=receipt")
        assert r.status_code == 422

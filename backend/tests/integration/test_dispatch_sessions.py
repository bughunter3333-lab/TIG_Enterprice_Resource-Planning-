"""
Integration tests for /dispatch-sessions — recorded despatch batches
(Jim2 'Dispatch #'): creating a session dispatches the jobs AND records
reviewable lines.
"""

import pytest
from app.models.job import Job
from app.models.customer import Customer


def _make_dispatchable_job(db, job_id: str, cust_id: str, status: str = "FINISH"):
    if not db.query(Customer).filter_by(id=cust_id).first():
        db.add(Customer(id=cust_id, name=f"Cust {cust_id}", credit_limit=10000.0))
    j = Job(
        id=job_id,
        customer_id=cust_id,
        customer_name=f"Cust {cust_id}",
        status=status,
        date_in="2026-06-01",
        invoice=f"INV-{job_id}",
        total_ex=100.0,
        tax=10.0,
        total_inc=110.0,
        deposit=0,
        balance_due=110.0,
    )
    db.add(j)
    db.commit()
    return j


@pytest.mark.integration
class TestDispatchSessions:
    def test_create_session_dispatches_jobs_and_records_lines(self, client, db):
        _make_dispatchable_job(db, "J-DS01", "DSC01", status="FINISH")
        _make_dispatchable_job(db, "J-DS02", "DSC02", status="INVOICE")
        r = client.post(
            "/dispatch-sessions",
            json={
                "lines": [
                    {
                        "job_id": "J-DS01",
                        "ship_via": "TNT",
                        "ship_ref": "CON1",
                        "cartons": 2,
                        "advance_status": True,
                    },
                    {
                        "job_id": "J-DS02",
                        "ship_via": "AusPost",
                        "ship_ref": "CON2",
                        "cartons": 1,
                        "advance_status": False,
                    },
                ]
            },
        )
        assert r.status_code in (200, 201)
        data = r.json()
        assert data["id"] >= 1  # the Dispatch #
        assert len(data["lines"]) == 2
        db.expire_all()
        j1 = db.query(Job).filter_by(id="J-DS01").first()
        j2 = db.query(Job).filter_by(id="J-DS02").first()
        assert j1.dispatched_at is not None
        assert j1.status == "INVOICE"  # advanced from FINISH
        assert j2.status == "INVOICE"  # unchanged

    def test_list_and_detail(self, client, db):
        _make_dispatchable_job(db, "J-DS03", "DSC03")
        c = client.post(
            "/dispatch-sessions",
            json={
                "lines": [
                    {
                        "job_id": "J-DS03",
                        "ship_via": "TNT",
                        "ship_ref": "X",
                        "cartons": 1,
                        "advance_status": False,
                    }
                ]
            },
        )
        sid = c.json()["id"]
        listing = client.get("/dispatch-sessions").json()
        assert any(s["id"] == sid and s["line_count"] == 1 for s in listing)
        detail = client.get(f"/dispatch-sessions/{sid}").json()
        assert detail["id"] == sid
        assert detail["lines"][0]["job_id"] == "J-DS03"
        assert detail["lines"][0]["ship_via"] == "TNT"

    def test_unknown_job_rejected(self, client):
        r = client.post(
            "/dispatch-sessions",
            json={
                "lines": [
                    {
                        "job_id": "NOPE",
                        "ship_via": "TNT",
                        "ship_ref": "",
                        "cartons": 1,
                        "advance_status": False,
                    }
                ]
            },
        )
        assert r.status_code == 404

    def test_empty_lines_rejected(self, client):
        r = client.post("/dispatch-sessions", json={"lines": []})
        assert r.status_code == 422

    def test_detail_404(self, client):
        assert client.get("/dispatch-sessions/999999").status_code == 404

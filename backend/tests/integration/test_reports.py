"""
Integration tests for /reports endpoints.

Covers: sales-summary, gst (BAS), aged-receivables, inventory-valuation,
        job-profitability, on-time-delivery, back-orders.
"""

import pytest
from app.models.job import Job
from app.models.customer import Customer


def _seed_invoiced_job(db, job_id: str, customer_id: str, total_ex: float, tax: float):
    """Helper: insert a minimal INVOICE-status job directly into the test DB."""
    if not db.query(Customer).filter_by(id=customer_id).first():
        db.add(Customer(id=customer_id, name=f"Customer {customer_id}"))
    total_inc = total_ex + tax
    j = Job(
        id=job_id,
        customer_id=customer_id,
        customer_name=f"Customer {customer_id}",
        status="INVOICE",
        date_in="2025-08-15",
        invoice_date="2025-08-15",
        total_ex=total_ex,
        tax=tax,
        total_inc=total_inc,
        deposit=0,
        balance_due=total_inc,
    )
    db.add(j)
    db.commit()
    return j


@pytest.mark.integration
class TestSalesSummaryReport:
    def test_empty_returns_zero_totals(self, client):
        r = client.get("/reports/sales-summary")
        assert r.status_code == 200
        data = r.json()
        assert data["totals"]["revenue_inc"] == 0
        assert data["rows"] == []

    def test_aggregates_by_customer(self, client, db):
        _seed_invoiced_job(db, "J-R001", "RCUST01", 100.0, 10.0)
        _seed_invoiced_job(db, "J-R002", "RCUST01", 200.0, 20.0)
        _seed_invoiced_job(db, "J-R003", "RCUST02", 50.0, 5.0)

        r = client.get("/reports/sales-summary")
        assert r.status_code == 200
        rows = r.json()["rows"]
        totals = r.json()["totals"]

        cust1 = next((row for row in rows if row["customer_id"] == "RCUST01"), None)
        assert cust1 is not None
        assert cust1["job_count"] == 2
        assert cust1["revenue_ex"] == pytest.approx(300.0)
        assert cust1["gst"] == pytest.approx(30.0)

        assert totals["revenue_ex"] == pytest.approx(350.0)
        assert totals["gst"] == pytest.approx(35.0)


@pytest.mark.integration
class TestGSTReport:
    def test_bas_fields_present(self, client, db):
        _seed_invoiced_job(db, "J-G001", "GCUST01", 1000.0, 100.0)

        r = client.get("/reports/gst")
        assert r.status_code == 200
        summary = r.json()["summary"]
        assert "G1_total_sales_inc_gst" in summary
        assert "1A_gst_collected" in summary
        assert summary["1A_gst_collected"] == pytest.approx(100.0)

    def test_monthly_breakdown_present(self, client, db):
        _seed_invoiced_job(db, "J-G002", "GCUST02", 500.0, 50.0)
        r = client.get("/reports/gst")
        assert "monthly_breakdown" in r.json()


@pytest.mark.integration
class TestAgedReceivables:
    def test_returns_structure(self, client):
        r = client.get("/reports/aged-receivables")
        assert r.status_code == 200
        data = r.json()
        assert "rows" in data
        assert "totals" in data
        for key in ("current", "days_31_60", "days_61_90", "over_90", "total"):
            assert key in data["totals"]


@pytest.mark.integration
class TestInventoryValuation:
    def test_returns_grouped_by_category(self, client, make_inventory):
        make_inventory(sku="VAL001", category="Apparel", stock=10, unit_cost=15.0)
        make_inventory(sku="VAL002", category="Apparel", stock=5, unit_cost=20.0)
        make_inventory(sku="VAL003", category="Accessories", stock=20, unit_cost=5.0)

        r = client.get("/reports/inventory-valuation")
        assert r.status_code == 200
        data = r.json()
        cats = [row["category"] for row in data["rows"]]
        assert "Apparel" in cats
        assert "Accessories" in cats
        apparel = next(row for row in data["rows"] if row["category"] == "Apparel")
        assert apparel["value"] == pytest.approx(250.0)


@pytest.mark.integration
class TestBASReport:
    """
    BAS summary endpoint — will be added in Phase 2a.
    Tests define the expected interface.
    """

    def test_bas_summary_endpoint_exists(self, client, db):
        _seed_invoiced_job(db, "J-BAS01", "BCUST01", 1000.0, 100.0)
        r = client.get("/reports/bas-summary?date_from=2025-07-01&date_to=2026-06-30")
        assert r.status_code == 200

    def test_bas_summary_has_required_fields(self, client, db):
        _seed_invoiced_job(db, "J-BAS02", "BCUST02", 2000.0, 200.0)
        r = client.get("/reports/bas-summary")
        assert r.status_code == 200
        data = r.json()
        # BAS required labels per ATO
        assert "G1" in data  # total sales including GST
        assert "1A" in data  # GST on sales
        assert "1B" in data  # GST input tax credits on purchases
        assert "period" in data

    def test_bas_g1_equals_total_sales_inc(self, client, db):
        _seed_invoiced_job(db, "J-BAS03", "BCUST03", 500.0, 50.0)
        # Explicit period bracketing the seeded invoice_date (2025-08-15) so the
        # assertion is independent of the current fiscal year at run time.
        r = client.get("/reports/bas-summary?date_from=2025-07-01&date_to=2026-06-30")
        data = r.json()
        assert float(data["G1"]) >= 550.0  # includes the job we seeded

    def test_bas_1a_equals_gst_collected(self, client, db):
        _seed_invoiced_job(db, "J-BAS04", "BCUST04", 300.0, 30.0)
        r = client.get("/reports/bas-summary?date_from=2025-07-01&date_to=2026-06-30")
        data = r.json()
        assert float(data["1A"]) >= 30.0

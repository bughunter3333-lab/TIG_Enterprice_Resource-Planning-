"""
Integration tests for /reports endpoints.

Covers: sales-summary, gst (BAS), aged-receivables, inventory-valuation,
        job-profitability, on-time-delivery, back-orders.
"""

from datetime import date, timedelta

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


BUCKETS = ("current", "days_1_30", "days_31_60", "days_61_90", "over_90")
AS_AT = date(2026, 6, 30)


def _owed(db, job_id, terms, invoiced, balance=100.0, **fields):
    """An unpaid invoice from a customer of its own on `terms`. The job's due
    date is years gone: aging must not read it."""
    customer_id = f"C-{job_id}"
    customer = Customer(id=customer_id, name=f"Customer {job_id}")
    db.add(customer)
    db.commit()
    # Set after the insert: a None at insert time takes the column's default.
    customer.payment_terms = terms
    db.add(
        Job(
            id=job_id,
            customer_id=customer_id,
            customer_name=f"Customer {job_id}",
            status="INVOICE",
            date_in=fields.pop("date_in", invoiced),
            invoice_date=invoiced,
            due="01/01/2020",
            total_inc=balance,
            deposit=0,
            balance_due=balance,
            **fields,
        )
    )
    db.commit()


def _aged(client):
    r = client.get("/reports/aged-receivables", params={"as_at": AS_AT.isoformat()})
    assert r.status_code == 200, r.text
    return r.json()


def _line(data, job_id):
    return next(
        line
        for row in data["rows"]
        for line in row["lines"]
        if line["job_id"] == job_id
    )


@pytest.mark.integration
class TestAgedReceivables:
    def test_returns_structure(self, client):
        r = client.get("/reports/aged-receivables")
        assert r.status_code == 200
        data = r.json()
        assert "rows" in data
        assert "totals" in data
        for key in (*BUCKETS, "total"):
            assert key in data["totals"]

    def test_every_row_and_line_carries_every_bucket(self, client, db):
        _owed(db, "J-A001", "Net 30", "2026-05-01")
        data = _aged(client)
        (row,) = data["rows"]
        for record in (row, row["lines"][0], data["totals"]):
            assert set(BUCKETS) <= set(record)
            assert sum(record[b] for b in BUCKETS) == pytest.approx(100.0)


@pytest.mark.integration
class TestAgingByPaymentTerms:
    """Due on the customer's terms from the invoice date; buckets by days past it."""

    @pytest.mark.parametrize(
        "terms, invoiced, due, overdue, bucket",
        [
            ("Net 14", "2026-06-01", "2026-06-15", 15, "days_1_30"),
            ("Net 60", "2026-05-01", "2026-06-30", 0, "current"),
            ("Net 60", "2026-04-01", "2026-05-31", 30, "days_1_30"),
            ("COD", "2026-06-01", "2026-06-01", 29, "days_1_30"),
            ("COD", "2026-03-01", "2026-03-01", 121, "over_90"),
            ("EOM", "2026-04-10", "2026-04-30", 61, "days_61_90"),
            ("30 EOM", "2026-05-10", "2026-06-30", 0, "current"),
        ],
    )
    def test_the_customers_terms_set_the_due_date(
        self, client, db, terms, invoiced, due, overdue, bucket
    ):
        _owed(db, "J-T001", terms, invoiced)
        data = _aged(client)
        line = _line(data, "J-T001")
        assert (line["due_date"], line["days_overdue"]) == (due, overdue)
        assert {b: line[b] for b in BUCKETS} == {
            b: (100.0 if b == bucket else 0.0) for b in BUCKETS
        }
        assert data["totals"][bucket] == pytest.approx(100.0)

    def test_no_terms_on_the_customer_means_the_companys_default(
        self, client, db, company_settings
    ):
        company_settings.payment_terms_default = "Net 7"
        db.commit()
        _owed(db, "J-D001", None, "2026-06-01")
        _owed(db, "J-D002", "  ", "2026-06-01")
        _owed(db, "J-D003", "whenever suits", "2026-06-01")
        data = _aged(client)
        for job_id in ("J-D001", "J-D002", "J-D003"):
            assert _line(data, job_id)["due_date"] == "2026-06-08"

    def test_and_with_no_company_default_net_30(self, client, db, company_settings):
        company_settings.payment_terms_default = None
        db.commit()
        _owed(db, "J-D004", None, "2026-05-01")
        assert _line(_aged(client), "J-D004")["due_date"] == "2026-05-31"

    def test_an_invoice_with_no_date_counts_from_the_day_the_job_came_in(
        self, client, db
    ):
        _owed(db, "J-N001", "Net 30", None, date_in="2026-05-01")
        line = _line(_aged(client), "J-N001")
        assert (line["invoice_date"], line["due_date"]) == ("2026-05-01", "2026-05-31")

    @pytest.mark.parametrize(
        "overdue, bucket",
        [
            (0, "current"),
            (1, "days_1_30"),
            (30, "days_1_30"),
            (31, "days_31_60"),
            (60, "days_31_60"),
            (61, "days_61_90"),
            (90, "days_61_90"),
            (91, "over_90"),
        ],
    )
    def test_the_bucket_boundaries(self, client, db, overdue, bucket):
        invoiced = AS_AT - timedelta(days=30 + overdue)
        _owed(db, "J-B001", "Net 30", invoiced.isoformat(), balance=55.5)
        data = _aged(client)
        line = _line(data, "J-B001")
        assert line["days_overdue"] == overdue
        (row,) = data["rows"]
        for record in (line, row, data["totals"]):
            assert record[bucket] == pytest.approx(55.5)
            assert sum(record[b] for b in BUCKETS) == pytest.approx(55.5)

    def test_a_customers_row_adds_up_its_invoices(self, client, db):
        db.add(Customer(id="C-MANY", name="Many", payment_terms="Net 30"))
        for n, invoiced in enumerate(("2026-06-15", "2026-05-15", "2026-01-15")):
            db.add(
                Job(
                    id=f"J-M00{n}",
                    customer_id="C-MANY",
                    customer_name="Many",
                    status="INVOICE",
                    date_in=invoiced,
                    invoice_date=invoiced,
                    total_inc=10.0,
                    deposit=0,
                    balance_due=10.0,
                )
            )
        db.commit()
        (row,) = _aged(client)["rows"]
        assert {b: row[b] for b in BUCKETS} == {
            "current": 10.0,
            "days_1_30": 10.0,
            "days_31_60": 0.0,
            "days_61_90": 0.0,
            "over_90": 10.0,
        }
        assert row["total"] == 30.0
        assert row["oldest_due"] == "2026-02-14"


def _supplier(db, supplier_id, terms="Net 30"):
    from app.models.supplier import Supplier

    if not db.get(Supplier, supplier_id):
        db.add(
            Supplier(
                id=supplier_id, name=f"Supplier {supplier_id}", payment_terms=terms
            )
        )
        db.commit()


def _bill(db, number, billed, terms="Net 30", due=None, amount=100.0, paid=0.0, **f):
    """An unpaid supplier bill from a supplier of its own on `terms`."""
    from app.models.supplier_bill import SupplierBill

    supplier_id = f.pop("supplier_id", f"S-{number}")
    _supplier(db, supplier_id, terms)
    bill = SupplierBill(
        supplier_id=supplier_id,
        supplier_name=f"Supplier {supplier_id}",
        bill_number=number,
        bill_date=billed,
        due_date=due,
        amount_ex=round(amount / 1.1, 2),
        tax=round(amount - amount / 1.1, 2),
        amount_inc=amount,
        paid_amount=paid,
        status=f.pop("status", "approved"),
        **f,
    )
    db.add(bill)
    db.commit()
    return bill


def _po(db, po_id, total=100.0, status="Sent", supplier_id=None):
    from app.models.purchase_order import PurchaseOrder

    supplier_id = supplier_id or f"S-{po_id}"
    _supplier(db, supplier_id)
    db.add(
        PurchaseOrder(
            id=po_id,
            supplier_id=supplier_id,
            supplier_name=f"Supplier {supplier_id}",
            status=status,
            order_date="2026-06-01",
            total_inc=total,
        )
    )
    db.commit()


def _payables(client):
    r = client.get("/reports/aged-payables", params={"as_at": AS_AT.isoformat()})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.integration
class TestAgedPayables:
    """Aged payables ages the bills the business owes (finding F25).

    It used to age purchase orders: an order is a promise to buy, not a debt,
    and a PO raised from requirements carried no inc-GST total, so two approved
    bills came to $200.75 on the AP screen and $0 here. Open orders are shown
    beside it as committed spend, which is what they are."""

    def test_an_unpaid_bill_is_owed(self, client, db):
        _bill(db, "WWS-44120", "2026-06-10")
        (row,) = _payables(client)["rows"]
        (line,) = row["lines"]
        assert line["bill_number"] == "WWS-44120"
        assert line["outstanding"] == 100.0

    def test_due_on_the_suppliers_terms_from_the_bill_date(self, client, db):
        # Billed 2026-05-01 on Net 14 -> due 2026-05-15 -> 46 days overdue on 30 June.
        _bill(db, "B-2", "2026-05-01", terms="Net 14")
        (line,) = _payables(client)["rows"][0]["lines"]
        assert line["due_date"] == "2026-05-15"
        assert line["days_overdue"] == 46

    def test_the_bills_own_due_date_comes_first(self, client, db):
        _bill(db, "B-3", "2026-01-01", terms="Net 14", due="2026-06-20")
        (line,) = _payables(client)["rows"][0]["lines"]
        assert line["due_date"] == "2026-06-20"

    def test_a_part_paid_bill_is_owed_its_balance(self, client, db):
        _bill(db, "B-4", "2026-06-10", amount=184.25, paid=100.0)
        assert _payables(client)["totals"]["total"] == 84.25

    def test_a_paid_bill_is_not_owed(self, client, db):
        _bill(db, "B-5", "2026-06-10", paid=100.0, status="paid")
        assert _payables(client)["rows"] == []

    def test_open_orders_are_committed_spend_not_debt(self, client, db):
        _po(db, "PO-C1", total=155.50)
        _po(db, "PO-C2", status="Received")
        _po(db, "PO-C3", status="Cancelled")
        data = _payables(client)
        assert data["rows"] == []
        assert [(c["po_id"], c["unbilled"]) for c in data["committed"]] == [
            ("PO-C1", 155.50)
        ]
        assert data["totals"]["committed"] == 155.50

    def test_the_billed_part_of_an_order_is_not_counted_twice(self, client, db):
        _po(db, "PO-C4", total=167.50, supplier_id="S-WWS")
        _bill(db, "B-6", "2026-06-10", amount=100.0, supplier_id="S-WWS", po_id="PO-C4")
        data = _payables(client)
        assert data["totals"]["total"] == 100.0
        assert [(c["po_id"], c["unbilled"]) for c in data["committed"]] == [
            ("PO-C4", 67.50)
        ]

    @pytest.mark.parametrize(
        "days_overdue, bucket",
        [
            (0, "current"),
            (1, "days_1_30"),
            (30, "days_1_30"),
            (31, "days_31_60"),
            (60, "days_31_60"),
            (61, "days_61_90"),
            (90, "days_61_90"),
            (91, "over_90"),
        ],
    )
    def test_buckets_are_days_overdue(self, client, db, days_overdue, bucket):
        due = (AS_AT - timedelta(days=days_overdue)).isoformat()
        _bill(db, "B-B", "2026-01-01", due=due, amount=25.0)
        data = _payables(client)
        (row,) = data["rows"]
        assert {b: row[b] for b in BUCKETS} == {
            b: (25.0 if b == bucket else 0.0) for b in BUCKETS
        }
        assert data["totals"][bucket] == 25.0


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

"""What has to be true about a job's money, from every path that changes it.

Simulation findings F04, F05, F06, F23, F24 and F27, and what the adversarial
verifier found alongside them. Each was one path doing less than the others:

- the server took the header totals as sent and never added up the lines (F04);
- despatch "advance status" invoiced with none of the invoicing checks (F05);
- the customer balance counted FINISH jobs nobody had invoiced (F06);
- overseas staff could invoice, mark paid and cancel invoices (F23);
- invoice numbers were typed, unchecked for repeats, never issued (F24);
- creating straight into ORDER, or Create Similar into ORDER, skipped the
  credit check (F27);
- creating straight into INVOICE posted to the ledger without taking the stock
  out, checking for negative stock, or updating what the customer owes;
- importing jobs set their status by hand, so none of that ran at all.
"""

import io

import pytest

from app.models.customer import Customer
from app.models.inventory import StockMovement
from app.models.job import Job, JobItem
from app.models.ledger import JournalEntry
from app.models.settings import CompanySettings


def _customer(db, cid="MR-C", limit=10000.0, **fields):
    customer = db.query(Customer).filter_by(id=cid).first()
    if customer is None:
        customer = Customer(id=cid, name=f"Cust {cid}", credit_limit=limit, **fields)
        db.add(customer)
        db.commit()
    return customer


def _job(db, job_id, status="FINISH", cid="MR-C", total_ex=100.0, invoice=None):
    _customer(db, cid)
    job = Job(
        id=job_id,
        customer_id=cid,
        customer_name=f"Cust {cid}",
        status=status,
        date_in="2026-10-01",
        invoice=invoice,
        total_ex=total_ex,
        tax=round(total_ex * 0.1, 2),
        total_inc=round(total_ex * 1.1, 2),
        deposit=0,
        balance_due=round(total_ex * 1.1, 2),
    )
    db.add(job)
    db.commit()
    return job


def _line(**fields):
    return {
        "display_type": "product",
        "description": "Staple Tee",
        "order_qty": 10,
        "price_ex": 14.20,
        **fields,
    }


def _reload(db, job_id):
    db.expire_all()
    return db.get(Job, job_id)


def _numbering(db, prefix, next_number):
    settings = db.query(CompanySettings).one()
    settings.invoice_prefix = prefix
    settings.invoice_next_number = next_number
    db.commit()


# ── F04: the server adds up the lines ────────────────────────────────────────


@pytest.mark.integration
class TestTheServerTotalsTheLines:
    def test_a_new_job_is_totalled_from_its_lines(self, client, db):
        _customer(db)
        r = client.post(
            "/jobs",
            json={"customer_id": "MR-C", "total_ex": 0, "items": [_line()]},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert (body["total_ex"], body["tax"], body["total_inc"]) == (
            142.0,
            14.2,
            156.2,
        )
        assert body["balance_due"] == 156.2

    def test_header_totals_sent_with_lines_are_not_believed(self, client, db):
        _customer(db)
        r = client.post(
            "/jobs",
            json={
                "customer_id": "MR-C",
                "total_ex": 1.0,
                "tax": 0.1,
                "total_inc": 1.1,
                "items": [_line()],
            },
        )
        assert r.json()["total_inc"] == 156.2

    def test_a_line_total_is_its_quantity_times_its_price(self, client, db):
        _customer(db)
        r = client.post(
            "/jobs", json={"customer_id": "MR-C", "items": [_line(total=999.0)]}
        )
        assert r.json()["items"][0]["total"] == 142.0

    def test_a_line_added_later_moves_the_header(self, client, db):
        _customer(db)
        job = client.post(
            "/jobs", json={"customer_id": "MR-C", "items": [_line()]}
        ).json()
        lines = [{"id": i["id"]} for i in job["items"]]
        lines.append(
            _line(
                description="Freight", stock_code="FREIGHT", order_qty=1, price_ex=9.95
            )
        )
        r = client.patch(f"/jobs/{job['id']}", json={"items": lines})
        assert r.status_code == 200, r.text
        assert r.json()["total_ex"] == 151.95
        assert r.json()["total_inc"] == 167.15

    def test_a_job_with_no_lines_keeps_the_totals_it_was_given(self, client, db):
        _customer(db)
        r = client.post(
            "/jobs",
            json={
                "customer_id": "MR-C",
                "total_ex": 100.0,
                "tax": 10.0,
                "total_inc": 110.0,
            },
        )
        assert r.json()["total_inc"] == 110.0


# ── F05: despatch invoices only what the status endpoint would ───────────────


@pytest.mark.integration
class TestDespatchInvoicesByTheSameRules:
    def _dispatch(self, client, job_id):
        return client.post(
            f"/jobs/{job_id}/dispatch",
            json={"ship_via": "StarTrack", "ship_ref": "CN1", "advance_status": True},
        )

    def test_a_job_with_nothing_to_charge_is_not_invoiced(self, client, db):
        _job(db, "MR-D1", total_ex=0)
        r = self._dispatch(client, "MR-D1")
        assert r.status_code == 422
        assert "greater than zero" in r.json()["detail"]
        assert _reload(db, "MR-D1").status == "FINISH"

    def test_despatch_issues_the_invoice_number(self, client, db):
        _job(db, "MR-D2")
        r = self._dispatch(client, "MR-D2")
        assert r.status_code == 200, r.text
        job = _reload(db, "MR-D2")
        assert job.status == "INVOICE" and job.invoice

    def test_a_despatch_batch_with_one_job_that_cannot_be_invoiced_moves_none(
        self, client, db
    ):
        _job(db, "MR-D3")
        _job(db, "MR-D4", total_ex=0)
        r = client.post(
            "/dispatch-sessions",
            json={
                "lines": [
                    {"job_id": "MR-D3", "ship_via": "TNT", "advance_status": True},
                    {"job_id": "MR-D4", "ship_via": "TNT", "advance_status": True},
                ]
            },
        )
        assert r.status_code == 422
        assert "MR-D4" in r.json()["detail"]
        assert _reload(db, "MR-D3").status == "FINISH"
        assert db.query(JournalEntry).filter_by(source_type="invoice").count() == 0

    def test_overseas_staff_cannot_invoice_through_despatch(self, client_as, db):
        _job(db, "MR-D5")
        r = client_as("overseas_staff").post(
            "/dispatch-sessions",
            json={"lines": [{"job_id": "MR-D5", "advance_status": True}]},
        )
        assert r.status_code == 403


# ── F06: the customer's balance is what they have been invoiced ──────────────


@pytest.mark.integration
class TestTheCustomerBalanceIsReceivables:
    def test_jobs_not_yet_invoiced_are_not_owed(self, client, db):
        _job(db, "MR-B1", invoice="B-1")
        _job(db, "MR-B2")
        _job(db, "MR-B3")
        assert (
            client.post("/jobs/MR-B1/status", json={"status": "INVOICE"}).status_code
            == 200
        )
        assert float(db.get(Customer, "MR-C").balance) == 110.0

    def test_unprinting_takes_the_invoice_back_off_the_balance(self, client, db):
        _job(db, "MR-B4", invoice="B-4")
        client.post("/jobs/MR-B4/status", json={"status": "INVOICE"})
        assert client.post("/jobs/MR-B4/unprint").status_code == 200
        db.expire_all()
        assert float(db.get(Customer, "MR-C").balance) == 0.0


# ── F27: every way into an order runs the credit check ───────────────────────


@pytest.mark.integration
class TestEveryWayIntoAnOrderChecksCredit:
    def test_creating_straight_into_order_over_the_limit_is_refused(self, client, db):
        _customer(db, "MR-K", limit=100.0)
        r = client.post(
            "/jobs",
            json={"customer_id": "MR-K", "status": "ORDER", "items": [_line()]},
        )
        assert r.status_code == 422
        assert "credit limit" in r.json()["detail"]
        assert db.query(Job).filter_by(customer_id="MR-K").count() == 0

    def test_create_similar_into_order_over_the_limit_is_refused(self, client, db):
        _customer(db, "MR-K", limit=200.0)
        quote = client.post(
            "/jobs", json={"customer_id": "MR-K", "items": [_line()]}
        ).json()
        assert (
            client.post(
                f"/jobs/{quote['id']}/duplicate", json={"status": "QUOTE"}
            ).status_code
            == 200
        )
        r = client.post(f"/jobs/{quote['id']}/duplicate", json={"status": "ORDER"})
        assert r.status_code == 200  # 156.20 of 200
        r = client.post(f"/jobs/{quote['id']}/duplicate", json={"status": "ORDER"})
        assert r.status_code == 422  # a second 156.20 would make 312.40

    def test_open_orders_count_against_the_limit(self, client, db):
        _customer(db, "MR-K", limit=500.0)
        _job(db, "MR-K1", status="ORDER", cid="MR-K", total_ex=400.0)
        _job(db, "MR-K2", status="QUOTE", cid="MR-K", total_ex=100.0)
        r = client.post("/jobs/MR-K2/status", json={"status": "ORDER"})
        assert r.status_code == 422
        assert "open orders" in r.json()["detail"]

    def test_a_customer_on_hold_cannot_be_given_an_order_at_creation(self, client, db):
        _customer(db, "MR-H", credit_hold=True)
        r = client.post("/jobs", json={"customer_id": "MR-H", "status": "ORDER"})
        assert r.status_code == 422
        assert "credit hold" in r.json()["detail"]


# ── Created straight into INVOICE: the whole invoicing, not half of it ───────


@pytest.mark.integration
class TestCreatingAnInvoicedJobInvoicesIt:
    def _create(self, client, **fields):
        return client.post(
            "/jobs",
            json={
                "customer_id": "MR-C",
                "status": "INVOICE",
                "items": [_line(stock_code="MR-SKU", supply_qty=10, b_ord=0)],
                **fields,
            },
        )

    def test_it_takes_the_stock_out(self, client, db, make_inventory):
        _customer(db)
        make_inventory(sku="MR-SKU", stock=25)
        r = self._create(client)
        assert r.status_code == 200, r.text
        sale = (
            db.query(StockMovement).filter_by(job_id=r.json()["id"], type="Sale").one()
        )
        assert sale.quantity == -10

    def test_it_refuses_to_take_stock_below_zero(self, client, db, make_inventory):
        _customer(db)
        make_inventory(sku="MR-SKU", stock=4)
        r = self._create(client)
        assert r.status_code == 409
        assert "below zero" in r.json()["detail"]

    def test_it_is_owed(self, client, db, make_inventory):
        _customer(db)
        make_inventory(sku="MR-SKU", stock=25)
        self._create(client)
        db.expire_all()
        assert float(db.get(Customer, "MR-C").balance) == 156.2

    def test_it_is_given_an_invoice_number(self, client, db, make_inventory):
        _customer(db)
        make_inventory(sku="MR-SKU", stock=25)
        assert self._create(client).json()["invoice"]


# ── F23: overseas staff work jobs; they do not invoice them ──────────────────


@pytest.mark.integration
class TestOverseasStaffDoNotTouchInvoices:
    @pytest.fixture
    def overseas(self, client_as):
        return client_as("overseas_staff")

    def test_they_cannot_invoice(self, overseas, db):
        _job(db, "MR-O1", invoice="O-1")
        r = overseas.post("/jobs/MR-O1/status", json={"status": "INVOICE"})
        assert r.status_code == 403
        assert _reload(db, "MR-O1").status == "FINISH"

    def test_they_cannot_invoice_in_bulk(self, overseas, db):
        _job(db, "MR-O2", invoice="O-2")
        r = overseas.post(
            "/jobs/bulk-status", json={"job_ids": ["MR-O2"], "status": "INVOICE"}
        )
        assert r.json()["moved"] == 0
        assert _reload(db, "MR-O2").status == "FINISH"

    def test_they_cannot_cancel_an_invoice(self, overseas, db):
        _job(db, "MR-O3", status="INVOICE", invoice="O-3")
        r = overseas.post("/jobs/MR-O3/status", json={"status": "CANCEL"})
        assert r.status_code == 403

    def test_they_still_move_jobs_through_production(self, overseas, db):
        _job(db, "MR-O4", status="PRINT")
        r = overseas.post("/jobs/MR-O4/status", json={"status": "Pick/Pack"})
        assert r.status_code == 200, r.text

    def test_they_can_cancel_an_order(self, overseas, db):
        _job(db, "MR-O5", status="ORDER")
        assert (
            overseas.post("/jobs/MR-O5/status", json={"status": "CANCEL"}).status_code
            == 200
        )

    def test_they_cannot_read_the_sales_register(self, overseas):
        assert overseas.get("/jobs/sales-register").status_code == 403

    def test_they_cannot_print_an_invoice_but_can_print_a_picking_slip(
        self, overseas, db
    ):
        _job(db, "MR-O6", status="INVOICE", invoice="O-6")
        assert overseas.get("/jobs/MR-O6/pdf?type=invoice").status_code == 403
        assert overseas.get("/jobs/MR-O6/pdf?type=picking-slip").status_code == 200


# ── F24: the next invoice number is issued, and none is used twice ───────────


@pytest.mark.integration
class TestInvoiceNumbers:
    def _invoice(self, client, job_id):
        r = client.post(f"/jobs/{job_id}/status", json={"status": "INVOICE"})
        assert r.status_code == 200, r.text
        return r.json()["invoice"]

    def test_numbers_are_issued_in_order_with_the_prefix(self, client, db):
        _numbering(db, "TIG", 5001)
        _job(db, "MR-N1")
        _job(db, "MR-N2")
        assert self._invoice(client, "MR-N1") == "TIG5001"
        assert self._invoice(client, "MR-N2") == "TIG5002"

    def test_a_number_typed_by_hand_is_not_issued_again(self, client, db):
        _numbering(db, "TIG", 5001)
        _job(db, "MR-N3", status="INVOICE", invoice="TIG5001")
        _job(db, "MR-N4")
        assert self._invoice(client, "MR-N4") == "TIG5002"

    def test_numbering_carries_on_from_the_highest_already_used(self, client, db):
        _numbering(db, "INV", None)
        _job(db, "MR-N5", status="PAID", invoice="INV880")
        _job(db, "MR-N6")
        assert self._invoice(client, "MR-N6") == "INV881"

    def test_a_number_already_on_another_job_is_refused(self, client, db):
        _job(db, "MR-N7", status="INVOICE", invoice="INV-77")
        _job(db, "MR-N8", status="ORDER")
        r = client.patch("/jobs/MR-N8", json={"invoice": "inv-77 "})
        assert r.status_code == 409
        assert "MR-N7" in r.json()["detail"]

    def test_a_new_job_cannot_reuse_a_number(self, client, db):
        _job(db, "MR-N9", status="INVOICE", invoice="INV-99")
        r = client.post("/jobs", json={"customer_id": "MR-C", "invoice": "INV-99"})
        assert r.status_code == 409

    def test_a_job_keeps_its_own_number_when_saved(self, client, db):
        _job(db, "MR-N10", status="ORDER", invoice="INV-100")
        r = client.patch("/jobs/MR-N10", json={"invoice": "INV-100", "notes": "x"})
        assert r.status_code == 200, r.text


# ── The health check holds the documents to themselves ───────────────────────


@pytest.mark.integration
class TestHealthChecksTheDocumentsAgreeWithThemselves:
    """Invariants the verifier found were never checked anywhere (F04, F06)."""

    def test_an_invoice_whose_header_is_not_its_lines_is_listed(self, client, db):
        job = _job(db, "MR-H1", status="INVOICE", invoice="H-1")
        db.add(JobItem(job_id=job.id, order_qty=10, price_ex=14.20, total=142.0))
        db.commit()
        rows = client.get("/accounting/health").json()["totals_disagree_with_lines"]
        assert rows == [
            {
                "job_id": "MR-H1",
                "customer": "Cust MR-C",
                "header": 100.0,
                "lines": 142.0,
            }
        ]

    def test_a_job_whose_header_is_its_lines_is_not(self, client, db):
        job = _job(db, "MR-H2", status="INVOICE", invoice="H-2", total_ex=142.0)
        db.add(JobItem(job_id=job.id, order_qty=10, price_ex=14.20, total=142.0))
        db.commit()
        assert (
            client.get("/accounting/health").json()["totals_disagree_with_lines"] == []
        )

    def test_a_customer_balance_that_is_not_their_invoices_is_listed(self, client, db):
        _job(db, "MR-H3", status="INVOICE", invoice="H-3")
        db.get(Customer, "MR-C").balance = 551.05
        db.commit()
        rows = client.get("/accounting/health").json()[
            "balances_disagree_with_invoices"
        ]
        assert rows == [
            {
                "customer_id": "MR-C",
                "customer": "Cust MR-C",
                "balance": 551.05,
                "invoices": 110.0,
            }
        ]


# ── Importing jobs goes through the same transition ──────────────────────────


def _csv(*rows):
    head = "Job#,Cust#,Customer,Status,Invoice#,Total Ex,GST,Total Inc\n"
    return io.BytesIO((head + "\n".join(rows) + "\n").encode())


@pytest.mark.integration
class TestImportedJobsAreTransitioned:
    def _import(self, client, *rows):
        r = client.post(
            "/import/jobs", files={"file": ("jobs.csv", _csv(*rows), "text/csv")}
        )
        assert r.status_code == 200, r.text
        return r.json()

    def test_an_imported_invoice_is_owed_and_posted(self, client, db):
        _customer(db)
        result = self._import(client, "MR-I1,MR-C,Cust MR-C,INVOICE,J2-501,100,10,110")
        assert result["inserted"] == 1, result
        db.expire_all()
        assert float(db.get(Customer, "MR-C").balance) == 110.0
        assert (
            db.query(JournalEntry)
            .filter_by(source_type="invoice", source_id="MR-I1")
            .count()
            == 1
        )

    def test_an_imported_invoice_without_its_number_is_refused(self, client, db):
        _customer(db)
        result = self._import(client, "MR-I2,MR-C,Cust MR-C,INVOICE,,100,10,110")
        assert result["inserted"] == 0
        assert "invoice number" in result["errors"][0]["error"].lower()

    def test_an_imported_order_reserves_nothing_it_has_no_lines_for(self, client, db):
        _customer(db)
        result = self._import(client, "MR-I3,MR-C,Cust MR-C,ORDER,,100,10,110")
        assert result["inserted"] == 1, result
        assert _reload(db, "MR-I3").status == "ORDER"

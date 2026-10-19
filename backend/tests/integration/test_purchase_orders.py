"""
Integration tests for /purchase-orders endpoints.

Covers: CRUD, GST calculation on create, GST on receive.
"""

import pytest
from app.models.customer import Customer


PO_BASE = {
    "id": "PO-TEST1",
    "supplier_id": "SUP001",
    "supplier_name": "Test Supplier Pty Ltd",
    "status": "Draft",
    "order_date": "2025-07-01",
    "items": [
        {
            "sku": "SKU001",
            "description": "T-Shirt",
            "qty_ordered": 10,
            "unit_cost": 20.00,
            "total": 200.00,
        },
    ],
}


@pytest.fixture
def supplier(make_supplier):
    return make_supplier(id="SUP001")


@pytest.mark.integration
class TestPOCRUD:
    def test_create_po(self, client, supplier):
        r = client.post("/purchase-orders/", json=PO_BASE)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "PO-TEST1"
        assert data["status"] == "Draft"

    def test_create_po_duplicate(self, client, supplier, make_purchase_order):
        make_purchase_order(id="PO-DUP1", supplier_id="SUP001")
        r = client.post("/purchase-orders/", json={**PO_BASE, "id": "PO-DUP1"})
        assert r.status_code == 409

    def test_get_po(self, client, make_purchase_order):
        make_purchase_order(id="PO-GET1")
        r = client.get("/purchase-orders/PO-GET1")
        assert r.status_code == 200
        assert r.json()["id"] == "PO-GET1"

    def test_list_pos(self, client, make_purchase_order):
        make_purchase_order(id="PO-L001")
        make_purchase_order(id="PO-L002")
        r = client.get("/purchase-orders/")
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert "PO-L001" in ids

    def test_update_po_status(self, client, make_purchase_order):
        make_purchase_order(id="PO-UPD1")
        r = client.patch("/purchase-orders/PO-UPD1", json={"status": "Sent"})
        assert r.status_code == 200
        assert r.json()["status"] == "Sent"

    def test_delete_po(self, client, make_purchase_order):
        make_purchase_order(id="PO-DEL1")
        r = client.delete("/purchase-orders/PO-DEL1")
        assert r.status_code == 200


@pytest.mark.integration
class TestPOGST:
    """GST fields on PO — total_ex, tax_total, total_inc."""

    def test_gst_calculated_on_create(self, client, supplier):
        r = client.post("/purchase-orders/", json=PO_BASE)
        assert r.status_code == 200
        data = r.json()
        # 10 x $20 = $200 ex-GST, $20 GST, $220 inc
        assert float(data.get("total_ex", 0)) == pytest.approx(200.00)
        assert float(data.get("tax_total", 0)) == pytest.approx(20.00)
        assert float(data.get("total_inc", 0)) == pytest.approx(220.00)

    def test_total_reflects_gst(self, client, supplier):
        """Legacy `total` field should match total_inc."""
        r = client.post("/purchase-orders/", json=PO_BASE)
        data = r.json()
        assert float(data["total"]) == pytest.approx(
            float(data.get("total_inc", data["total"]))
        )


@pytest.mark.integration
class TestPOReceive:
    def test_receive_items_updates_stock(
        self, client, make_purchase_order, make_inventory
    ):
        make_inventory(sku="RECV001", stock=0)
        make_purchase_order(
            id="PO-RCV1",
            items=[
                {
                    "sku": "RECV001",
                    "description": "Item",
                    "qty_ordered": 5,
                    "qty_received": 0,
                    "unit_cost": 10.00,
                    "total": 50.00,
                },
            ],
        )
        po = client.get("/purchase-orders/PO-RCV1").json()
        item_id = po["items"][0]["id"]

        r = client.post(
            "/purchase-orders/PO-RCV1/receive",
            json={"items": [{"id": item_id, "qty_received": 5}]},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "Received"


@pytest.mark.integration
class TestPOLinesCarryTheirJob:
    """A purchase order covering several jobs still says which units are whose.

    JIM3. Jim2's PO 2048001 has eight lines spanning six different jobs, each
    naming its Job#, and it was auto-created from a job. Ours grouped purely by
    SKU, so one line covered every job that needed that garment and there was
    nothing to reconcile a delivery against. That is what turned a real shortage
    into "35 units across 22 jobs" in the Arcare run.
    """

    def _job_with_backorder(self, db, make_customer, job_id, cust, sku, b_ord):
        from app.models.job import Job, JobItem

        if not db.query(Customer).filter_by(id=cust).first():
            make_customer(id=cust)
        db.add(
            Job(
                id=job_id,
                customer_id=cust,
                customer_name=f"Cust {cust}",
                status="ORDER",
                date_in="2026-01-01",
            )
        )
        item = JobItem(
            job_id=job_id,
            display_type="product",
            stock_code=sku,
            description="Cargo Short",
            order_qty=b_ord,
            qty=b_ord,
            supply_qty=0,
            b_ord=b_ord,
        )
        db.add(item)
        db.commit()
        return item

    def test_the_same_sku_for_two_jobs_is_two_lines(
        self, client, db, make_customer, make_inventory
    ):
        make_inventory(sku="POJ-A", stock=0, unit_cost=20.0)
        a = self._job_with_backorder(db, make_customer, "J-POJ1", "POJC", "POJ-A", 2)
        b = self._job_with_backorder(db, make_customer, "J-POJ2", "POJC", "POJ-A", 3)

        r = client.post(
            "/purchase-orders/from-requirements",
            json={
                "id": "PO-JOBLINK-1",
                "supplier_id": "SUP1",
                "supplier_name": "Acme",
                "expected_date": "2026-02-01",
                "requirements": [
                    {"item_id": a.id, "qty": 2},
                    {"item_id": b.id, "qty": 3},
                ],
            },
        )
        assert r.status_code in (200, 201)

        po = client.get("/purchase-orders/PO-JOBLINK-1").json()
        lines = [i for i in po["items"] if i["sku"] == "POJ-A"]
        assert len(lines) == 2, "one line per job, not one line per SKU"
        assert {ln["job_id"] for ln in lines} == {"J-POJ1", "J-POJ2"}
        assert {ln["qty_ordered"] for ln in lines} == {2, 3}

    def test_two_lines_of_one_job_still_collapse(
        self, client, db, make_customer, make_inventory
    ):
        # Same SKU, same job, twice: that is one line. The split is by job, not
        # by requirement row.
        make_inventory(sku="POJ-B", stock=0, unit_cost=10.0)
        a = self._job_with_backorder(db, make_customer, "J-POJ3", "POJD", "POJ-B", 2)
        from app.models.job import JobItem

        b = JobItem(
            job_id="J-POJ3",
            display_type="product",
            stock_code="POJ-B",
            description="Cargo Short",
            order_qty=4,
            qty=4,
            supply_qty=0,
            b_ord=4,
        )
        db.add(b)
        db.commit()

        client.post(
            "/purchase-orders/from-requirements",
            json={
                "id": "PO-JOBLINK-2",
                "supplier_id": "SUP1",
                "supplier_name": "Acme",
                "expected_date": "2026-02-01",
                "requirements": [
                    {"item_id": a.id, "qty": 2},
                    {"item_id": b.id, "qty": 4},
                ],
            },
        )
        po = client.get("/purchase-orders/PO-JOBLINK-2").json()
        lines = [i for i in po["items"] if i["sku"] == "POJ-B"]
        assert len(lines) == 1
        assert lines[0]["qty_ordered"] == 6
        assert lines[0]["job_id"] == "J-POJ3"

"""
Integration tests for /purchase-orders endpoints.

Covers: CRUD, GST calculation on create, GST on receive.
"""

import pytest

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

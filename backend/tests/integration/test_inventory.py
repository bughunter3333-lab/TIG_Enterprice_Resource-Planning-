"""
Integration tests for /inventory endpoints.

Covers: CRUD, stock adjustment, low-stock alert, transfer, stocktake.
"""

import pytest


@pytest.mark.integration
class TestInventoryCRUD:
    def test_list_inventory_empty(self, client):
        r = client.get("/inventory/")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_item(self, client):
        r = client.post(
            "/inventory/",
            json={
                "sku": "INV-NEW01",
                "name": "Test Polo Shirt",
                "category": "Apparel",
                "stock": 50,
                "min_stock": 10,
                "unit_cost": 15.00,
                "sell_price": 35.00,
                "status": "Active",
            },
        )
        assert r.status_code in (200, 201)
        assert r.json()["sku"] == "INV-NEW01"

    def test_create_duplicate_sku_rejected(self, client, make_inventory):
        make_inventory(sku="INV-DUP01")
        r = client.post(
            "/inventory/",
            json={
                "sku": "INV-DUP01",
                "name": "Duplicate",
                "stock": 10,
            },
        )
        assert r.status_code == 409

    def test_get_item(self, client, make_inventory):
        make_inventory(sku="INV-GET01", name="Get Test Item")
        r = client.get("/inventory/INV-GET01")
        assert r.status_code == 200
        assert r.json()["name"] == "Get Test Item"

    def test_get_missing_item(self, client):
        r = client.get("/inventory/NOSKU")
        assert r.status_code == 404

    def test_update_item(self, client, make_inventory):
        make_inventory(sku="INV-UPD01", sell_price=20.0)
        r = client.patch("/inventory/INV-UPD01", json={"sell_price": 29.99})
        assert r.status_code == 200
        assert float(r.json()["sell_price"]) == pytest.approx(29.99)

    def test_delete_item(self, client, make_inventory):
        make_inventory(sku="INV-DEL01")
        r = client.delete("/inventory/INV-DEL01")
        assert r.status_code == 200

    def test_committed_qty_computed_from_open_job_lines(
        self, client, make_inventory, make_customer
    ):
        """committed_qty = supply on OPEN job lines; quotes/paid don't reserve."""
        make_inventory(sku="INV-COMMIT", stock=100)
        make_customer(id="CCOMMIT")
        # Open ORDER reserves 30 from stock
        r = client.post(
            "/jobs",
            json={
                "customer_id": "CCOMMIT",
                "status": "ORDER",
                "items": [
                    {"stock_code": "INV-COMMIT", "order_qty": 50, "supply_qty": 30}
                ],
            },
        )
        assert r.status_code in (200, 201)
        # A QUOTE must NOT reserve stock
        client.post(
            "/jobs",
            json={
                "customer_id": "CCOMMIT",
                "status": "QUOTE",
                "items": [
                    {"stock_code": "INV-COMMIT", "order_qty": 10, "supply_qty": 10}
                ],
            },
        )
        inv = client.get("/inventory").json()
        item = next(i for i in inv if i["sku"] == "INV-COMMIT")
        assert item["committed_qty"] == 30


@pytest.mark.integration
class TestStockAdjustment:
    def test_positive_adjustment_increases_stock(self, client, make_inventory):
        make_inventory(sku="INV-ADJ01", stock=20)
        r = client.post(
            "/inventory/INV-ADJ01/adjust",
            json={"adjustment": 10, "reason": "Received delivery"},
        )
        assert r.status_code == 200
        assert r.json()["stock"] == 30

    def test_negative_adjustment_decreases_stock(self, client, make_inventory):
        make_inventory(sku="INV-ADJ02", stock=20)
        r = client.post(
            "/inventory/INV-ADJ02/adjust",
            json={"adjustment": -5, "reason": "Damaged goods"},
        )
        assert r.status_code == 200
        assert r.json()["stock"] == 15

    def test_negative_below_zero_rejected(self, client, make_inventory):
        make_inventory(sku="INV-ADJ03", stock=5)
        r = client.post(
            "/inventory/INV-ADJ03/adjust", json={"adjustment": -10, "reason": "Error"}
        )
        assert r.status_code == 400


@pytest.mark.integration
class TestLowStockAlert:
    def test_low_stock_returns_only_low_items(self, client, make_inventory):
        make_inventory(sku="INV-LOW01", stock=3, min_stock=10, status="Active")
        make_inventory(sku="INV-OK01", stock=50, min_stock=10, status="Active")

        r = client.get("/inventory/low-stock")
        assert r.status_code == 200
        data = r.json()
        skus = [row["sku"] for row in data["rows"]]
        assert "INV-LOW01" in skus
        assert "INV-OK01" not in skus

    def test_low_stock_shortfall_calculated(self, client, make_inventory):
        make_inventory(sku="INV-LOW02", stock=2, min_stock=10, status="Active")
        r = client.get("/inventory/low-stock")
        rows = r.json()["rows"]
        row = next((r for r in rows if r["sku"] == "INV-LOW02"), None)
        assert row is not None
        assert row["shortfall"] == 8


@pytest.mark.integration
class TestStockTransfer:
    def test_transfer_between_skus(self, client, make_inventory):
        make_inventory(sku="INV-FROM01", stock=50)
        make_inventory(sku="INV-TO01", stock=10)
        r = client.post(
            "/inventory/transfer",
            json={
                "from_sku": "INV-FROM01",
                "to_sku": "INV-TO01",
                "quantity": 20,
            },
        )
        assert r.status_code == 200

    def test_transfer_insufficient_stock_rejected(self, client, make_inventory):
        make_inventory(sku="INV-FROM02", stock=5)
        make_inventory(sku="INV-TO02", stock=0)
        r = client.post(
            "/inventory/transfer",
            json={
                "from_sku": "INV-FROM02",
                "to_sku": "INV-TO02",
                "quantity": 20,
            },
        )
        assert r.status_code == 400


@pytest.mark.integration
class TestStocktake:
    def test_stocktake_adjusts_variance(self, client, db, make_inventory):
        make_inventory(sku="INV-STKT01", stock=100)
        r = client.post(
            "/inventory/stocktake",
            json={
                "reference": "STKTK-TEST01",
                "method": "Full",
                "items": [{"sku": "INV-STKT01", "counted_qty": 95}],
            },
        )
        assert r.status_code == 200
        results = r.json()["results"]
        item = next(res for res in results if res["sku"] == "INV-STKT01")
        assert item["variance"] == -5
        assert item["counted"] == 95

    def test_stocktake_no_variance_no_movement(self, client, make_inventory):
        make_inventory(sku="INV-STKT02", stock=50)
        r = client.post(
            "/inventory/stocktake",
            json={
                "items": [{"sku": "INV-STKT02", "counted_qty": 50}],
            },
        )
        assert r.status_code == 200
        result = next(res for res in r.json()["results"] if res["sku"] == "INV-STKT02")
        assert result["variance"] == 0

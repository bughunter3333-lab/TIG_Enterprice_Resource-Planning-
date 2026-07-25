"""
Integration tests for the remaining Jim2 Stock detail tabs:
  GET /inventory/{sku}/vendors  — supplier price lists for this SKU
  GET /inventory/{sku}/buying   — PO line history (with outstanding qty)
  GET /inventory/{sku}/sales     — sale movements with customer/job
"""

import pytest
from app.models.inventory import StockMovement
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.supplier import Supplier
from app.models.supplier_price_list import SupplierPriceList
from app.models.job import Job


@pytest.mark.integration
class TestStockVendors:
    def test_lists_supplier_prices_for_sku(self, client, db, make_inventory):
        make_inventory(sku="V1", stock=5)
        db.add(Supplier(id="SUP-A", name="Alpha Supplies"))
        db.add(Supplier(id="SUP-B", name="Beta Textiles"))
        db.add(
            SupplierPriceList(
                supplier_id="SUP-A",
                sku="V1",
                unit_cost=10.50,
                min_qty=10,
                currency="AUD",
                lead_time_days=7,
            )
        )
        db.add(
            SupplierPriceList(
                supplier_id="SUP-B",
                sku="V1",
                unit_cost=9.80,
                min_qty=50,
                currency="AUD",
                lead_time_days=14,
            )
        )
        db.add(
            SupplierPriceList(supplier_id="SUP-A", sku="OTHER", unit_cost=1.0)
        )  # excluded
        db.commit()
        rows = client.get("/inventory/V1/vendors").json()
        assert len(rows) == 2
        by = {r["supplier_name"]: r for r in rows}
        assert by["Alpha Supplies"]["unit_cost"] == 10.5
        assert by["Alpha Supplies"]["lead_time_days"] == 7
        assert by["Beta Textiles"]["min_qty"] == 50

    def test_404(self, client):
        assert client.get("/inventory/NOPE/vendors").status_code == 404


@pytest.mark.integration
class TestStockBuying:
    def test_lists_po_lines_with_outstanding(self, client, db, make_inventory):
        make_inventory(sku="B1", stock=5)
        db.add(
            PurchaseOrder(
                id="PO-B1",
                supplier_id="S",
                supplier_name="Acme",
                status="Sent",
                order_date="01/06/2026",
            )
        )
        db.add(
            PurchaseOrder(
                id="PO-B2",
                supplier_id="S",
                supplier_name="Acme",
                status="Received",
                order_date="01/05/2026",
            )
        )
        db.add(
            PurchaseOrderItem(
                order_id="PO-B1",
                sku="B1",
                qty_ordered=100,
                qty_received=40,
                unit_cost=8.0,
                total=800,
            )
        )
        db.add(
            PurchaseOrderItem(
                order_id="PO-B2",
                sku="B1",
                qty_ordered=50,
                qty_received=50,
                unit_cost=8.5,
                total=425,
            )
        )
        db.add(
            PurchaseOrderItem(order_id="PO-B1", sku="OTHER", qty_ordered=10)
        )  # excluded
        db.commit()
        rows = client.get("/inventory/B1/buying").json()
        assert len(rows) == 2
        b1 = next(r for r in rows if r["po_id"] == "PO-B1")
        assert (
            b1["qty_ordered"] == 100
            and b1["qty_received"] == 40
            and b1["outstanding"] == 60
        )
        assert b1["supplier_name"] == "Acme" and b1["status"] == "Sent"
        assert next(r for r in rows if r["po_id"] == "PO-B2")["outstanding"] == 0

    def test_404(self, client):
        assert client.get("/inventory/NOPE/buying").status_code == 404


@pytest.mark.integration
class TestStockSales:
    def test_lists_sale_movements_with_customer(self, client, db, make_inventory):
        make_inventory(sku="S1", stock=5)
        db.add(
            Job(
                id="J-S1",
                customer_id="C1",
                customer_name="Zephyr Co",
                status="INVOICE",
                date_in="2026-06-01",
            )
        )
        db.add(
            StockMovement(
                sku="S1",
                date="01/06/2026",
                type="Sale",
                quantity=-8,
                reference="J-S1",
                job_id="J-S1",
            )
        )
        db.add(
            StockMovement(
                sku="S1",
                date="02/06/2026",
                type="Purchase",
                quantity=20,
                reference="PO-x",
            )
        )  # excluded
        db.commit()
        rows = client.get("/inventory/S1/sales").json()
        assert len(rows) == 1
        assert rows[0]["job_id"] == "J-S1"
        assert rows[0]["customer_name"] == "Zephyr Co"
        assert rows[0]["quantity"] == 8  # absolute value

    def test_404(self, client):
        assert client.get("/inventory/NOPE/sales").status_code == 404

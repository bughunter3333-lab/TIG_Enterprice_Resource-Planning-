"""Integration tests for the goods-receipt → back-order fulfilment loop."""

import pytest


@pytest.mark.integration
class TestGoodsReceiptBackorderLoop:
    def test_accept_tops_up_stock_and_fills_backorders(
        self, client, make_inventory, make_customer
    ):
        """Accepting a goods receipt tops up stock AND fills back-ordered job lines:
        the filled qty moves from b_ord into supply (order = supply + b_ord holds).
        Also guards the require_role fix — accept used to always 403."""
        make_inventory(sku="GR-LOOP", stock=0)
        make_customer(id="GRCUST")

        # Order 20 of a zero-stock SKU → fully back-ordered
        r = client.post(
            "/jobs",
            json={
                "customer_id": "GRCUST",
                "status": "ORDER",
                "items": [
                    {
                        "stock_code": "GR-LOOP",
                        "order_qty": 20,
                        "supply_qty": 0,
                        "b_ord": 20,
                    }
                ],
            },
        )
        assert r.status_code in (200, 201)
        job_id = r.json()["id"]

        # Receive 20 on a direct goods receipt and accept it
        gr = client.post(
            "/goods-receipts",
            json={
                "received_date": "2026-06-23",
                "supplier_name": "Acme",
                "lines": [{"sku": "GR-LOOP", "qty_received": 20}],
            },
        )
        assert gr.status_code in (200, 201)
        acc = client.post(f"/goods-receipts/{gr.json()['id']}/accept")
        assert acc.status_code == 200  # was 403 before the require_role fix

        # Stock topped up
        inv = client.get("/inventory").json()
        item = next(i for i in inv if i["sku"] == "GR-LOOP")
        assert item["stock"] == 20

        # Back-order filled: qty moved from b_ord into supply, invariant holds
        line = client.get(f"/jobs/{job_id}").json()["items"][0]
        assert line["b_ord"] == 0
        assert line["supply_qty"] == 20
        assert line["order_qty"] == line["supply_qty"] + line["b_ord"]

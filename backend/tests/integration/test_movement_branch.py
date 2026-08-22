"""Movements have to record which branch they hit.

`StockMovement.location_branch` was declared and read by three endpoints while
nothing ever wrote it, so the ledger could say what moved and never where. That
is the gap that stops per-branch balances being re-derivable from movements —
the totals in `stock_locations` are the only record, and nothing can check them.

A source-level guard in tests/unit/test_schema_conventions.py pins the argument
at every construction site. These tests check the value that lands is the right
one, which the source guard cannot tell.
"""

import pytest
from app.core.stock_location import adjust_location
from app.models.inventory import StockMovement
from app.models.job import Job, JobItem
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem


def _branches(db, sku, movement_type=None):
    q = db.query(StockMovement).filter(StockMovement.sku == sku)
    if movement_type:
        q = q.filter(StockMovement.type == movement_type)
    return [m.location_branch for m in q.all()]


@pytest.mark.integration
class TestReceiptMovements:
    def test_goods_receipt_records_the_branch_it_landed_in(
        self, client, db, make_inventory
    ):
        make_inventory(sku="MB1", stock=0)
        receipt = client.post(
            "/goods-receipts",
            json={
                "supplier_name": "Acme",
                "received_date": "2026-08-15",
                "branch": "MELB",
                "lines": [
                    {
                        "sku": "MB1",
                        "qty_expected": 10,
                        "qty_received": 10,
                        "unit_cost": 2,
                    }
                ],
            },
        ).json()
        client.post(f"/goods-receipts/{receipt['id']}/accept")

        db.expire_all()
        assert _branches(db, "MB1", "GR") == ["MELB"]

    def test_po_receipt_records_a_branch(self, client, db, make_inventory):
        make_inventory(sku="MB2", stock=0)
        db.add(
            PurchaseOrder(
                id="PO-MB2",
                supplier_id="S1",
                supplier_name="Acme",
                status="Sent",
                order_date="01/08/2026",
            )
        )
        db.add(
            PurchaseOrderItem(
                order_id="PO-MB2", sku="MB2", qty_ordered=5, qty_received=0
            )
        )
        db.commit()
        item_id = db.query(PurchaseOrderItem).filter_by(order_id="PO-MB2").one().id

        client.post(
            "/purchase-orders/PO-MB2/receive",
            json={"items": [{"id": item_id, "qty_received": 5}]},
        )

        db.expire_all()
        assert _branches(db, "MB2", "Purchase Receipt") == ["HQ"]


@pytest.mark.integration
class TestAdjustmentMovements:
    def test_adjustment_records_the_branch_it_was_made_against(
        self, client, db, make_inventory
    ):
        make_inventory(sku="MB3", stock=20)
        adjust_location(db, "MB3", "MELB", on_hand=20)
        db.commit()

        client.post(
            "/inventory/MB3/adjust",
            json={"adjustment": -3, "reason": "Damaged", "branch": "MELB"},
        )

        db.expire_all()
        assert _branches(db, "MB3", "Adjustment") == ["MELB"]

    def test_stocktake_records_the_counted_branch(self, client, db, make_inventory):
        make_inventory(sku="MB4", stock=50)
        adjust_location(db, "MB4", "MELB", on_hand=50)
        db.commit()

        client.post(
            "/inventory/stocktake",
            json={
                "reference": "ST-MB4",
                "branch": "MELB",
                "items": [{"sku": "MB4", "counted_qty": 47}],
            },
        )

        db.expire_all()
        assert _branches(db, "MB4", "Stocktake") == ["MELB"]


@pytest.mark.integration
class TestTransferMovements:
    def test_relocation_records_where_the_stock_ended_up(
        self, client, db, make_inventory
    ):
        make_inventory(sku="MB5", stock=30)
        adjust_location(db, "MB5", "HQ", on_hand=30)
        db.commit()

        client.post(
            "/inventory/transfer",
            json={
                "from_sku": "MB5",
                "quantity": 10,
                "from_branch": "HQ",
                "to_branch": "MELB",
            },
        )

        db.expire_all()
        assert _branches(db, "MB5", "Location Change") == ["MELB"]

    def test_cross_sku_transfer_records_a_branch_on_both_sides(
        self, client, db, make_inventory
    ):
        make_inventory(sku="MB6", stock=10)
        make_inventory(sku="MB7", stock=0)
        adjust_location(db, "MB6", "HQ", on_hand=10)
        db.commit()

        client.post(
            "/inventory/transfer",
            json={
                "from_sku": "MB6",
                "to_sku": "MB7",
                "quantity": 4,
                "from_branch": "HQ",
                "to_branch": "MELB",
            },
        )

        db.expire_all()
        assert _branches(db, "MB6", "Transfer Out") == ["HQ"]
        assert _branches(db, "MB7", "Transfer In") == ["MELB"]


@pytest.mark.integration
class TestJobMovements:
    def _job(self, db, job_id, sku, qty, branch, status="QUOTE"):
        db.add(
            Job(
                id=job_id,
                customer_id="C-MB",
                customer_name="Cust",
                status=status,
                branch=branch,
                date_in="2026-08-01",
                invoice="INV-MB",
                total_inc=100,
            )
        )
        db.add(
            JobItem(
                job_id=job_id,
                display_type="product",
                stock_code=sku,
                description="x",
                order_qty=qty,
                qty=qty,
                supply_qty=qty,
            )
        )
        db.commit()

    def test_commit_release_and_sale_all_record_the_job_branch(
        self, client, db, make_inventory
    ):
        make_inventory(sku="MB8", stock=40)
        adjust_location(db, "MB8", "MELB", on_hand=40)
        db.commit()
        self._job(db, "J-MB8", "MB8", 6, "MELB")

        client.post("/jobs/J-MB8/status", json={"status": "ORDER"})
        client.post("/jobs/J-MB8/status", json={"status": "QUOTE"})

        db.expire_all()
        assert _branches(db, "MB8", "Committed") == ["MELB"]
        assert _branches(db, "MB8", "Released") == ["MELB"]

    def test_invoicing_records_the_branch_that_shipped(
        self, client, db, make_inventory
    ):
        make_inventory(sku="MB9", stock=40)
        adjust_location(db, "MB9", "MELB", on_hand=40)
        db.commit()
        self._job(db, "J-MB9", "MB9", 8, "MELB", status="FINISH")

        client.post("/jobs/J-MB9/status", json={"status": "INVOICE"})

        db.expire_all()
        assert _branches(db, "MB9", "Sale") == ["MELB"]


@pytest.mark.integration
class TestNoMovementEscapesUnbranched:
    def test_a_full_lifecycle_leaves_every_movement_attributed(
        self, client, db, make_inventory
    ):
        """The whole point: sum movements by branch and nothing falls out."""
        make_inventory(sku="MB10", stock=0)
        receipt = client.post(
            "/goods-receipts",
            json={
                "supplier_name": "Acme",
                "received_date": "2026-08-15",
                "branch": "HQ",
                "lines": [
                    {
                        "sku": "MB10",
                        "qty_expected": 50,
                        "qty_received": 50,
                        "unit_cost": 3,
                    }
                ],
            },
        ).json()
        client.post(f"/goods-receipts/{receipt['id']}/accept")
        client.post(
            "/inventory/transfer",
            json={
                "from_sku": "MB10",
                "quantity": 20,
                "from_branch": "HQ",
                "to_branch": "MELB",
            },
        )
        client.post(
            "/inventory/MB10/adjust",
            json={"adjustment": -2, "reason": "Damaged", "branch": "HQ"},
        )

        db.expire_all()
        movements = db.query(StockMovement).filter(StockMovement.sku == "MB10").all()
        assert movements, "expected movements from the lifecycle above"
        unbranched = [m.type for m in movements if not m.location_branch]
        assert not unbranched, f"movements with no branch: {unbranched}"

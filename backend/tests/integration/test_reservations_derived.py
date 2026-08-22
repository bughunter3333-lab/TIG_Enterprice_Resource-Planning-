"""Reserved and expected stock are derived from the documents, not accumulated.

The rule for "what counts as reserved" was written out three times and one copy
disagreed: the job transition treated INVOICE as a status that reserves stock,
while both read paths excluded it. Between invoicing and payment the goods were
therefore counted twice — off the shelf because they had shipped, and still
reserved because nothing released them.

That was not only a display problem. `accept_receipt` computes what it can hand
to a backorder as on-hand minus committed, so an inflated reservation meant
refusing stock that was genuinely free.
"""

import pytest
from app.core.reservations import committed_by_branch, committed_total, on_order_total
from app.core.stock_location import adjust_location
from app.models.inventory import InventoryItem
from app.models.job import Job, JobItem
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem


def _job(db, job_id, sku, qty, branch="HQ", status="QUOTE"):
    db.add(
        Job(
            id=job_id,
            customer_id="C-RS",
            customer_name="Cust",
            status=status,
            branch=branch,
            date_in="2026-08-01",
            invoice="INV-RS",
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


def _row(client, sku):
    return next(r for r in client.get("/inventory").json() if r["sku"] == sku)


@pytest.mark.integration
class TestShippedStockStopsBeingReserved:
    def test_invoicing_releases_the_reservation_it_ships(
        self, client, db, make_inventory
    ):
        """Regression: at INVOICE the goods left the shelf and stayed reserved,
        so 40 on hand with a 10-unit job read as 20 available, not 30."""
        make_inventory(sku="RS1", stock=40)
        adjust_location(db, "RS1", "HQ", on_hand=40)
        db.commit()
        _job(db, "J-RS1", "RS1", 10)

        client.post("/jobs/J-RS1/status", json={"status": "ORDER"})
        db.expire_all()
        assert committed_total(db, "RS1") == 10

        for status in ("In Progress", "PRINT", "Pick/Pack", "FINISH", "INVOICE"):
            client.post("/jobs/J-RS1/status", json={"status": status})

        db.expire_all()
        item = db.query(InventoryItem).filter_by(sku="RS1").one()
        assert item.stock == 30, "10 units shipped"
        assert committed_total(db, "RS1") == 0, "shipped stock is gone, not reserved"

        row = _row(client, "RS1")
        assert row["stock"] - row["committed_qty"] == 30

    def test_the_stored_counter_agrees_with_the_derived_one(
        self, client, db, make_inventory
    ):
        """The transition and the read paths now share one definition, so the
        accumulated column and the derived figure cannot disagree."""
        make_inventory(sku="RS2", stock=50)
        adjust_location(db, "RS2", "HQ", on_hand=50)
        db.commit()
        _job(db, "J-RS2", "RS2", 12)

        for status in (
            "ORDER",
            "In Progress",
            "PRINT",
            "Pick/Pack",
            "FINISH",
            "INVOICE",
        ):
            client.post("/jobs/J-RS2/status", json={"status": status})
            db.expire_all()
            item = db.query(InventoryItem).filter_by(sku="RS2").one()
            assert (item.committed_qty or 0) == committed_total(
                db, "RS2"
            ), f"stored and derived reservations disagree at {status}"


@pytest.mark.integration
class TestReservationsSplitByBranch:
    def test_each_branch_reserves_only_its_own_jobs(self, client, db, make_inventory):
        make_inventory(sku="RS3", stock=100)
        adjust_location(db, "RS3", "HQ", on_hand=60)
        adjust_location(db, "RS3", "MELB", on_hand=40)
        db.commit()
        _job(db, "J-RS3-HQ", "RS3", 15, branch="HQ")
        _job(db, "J-RS3-ME", "RS3", 8, branch="MELB")

        client.post("/jobs/J-RS3-HQ/status", json={"status": "ORDER"})
        client.post("/jobs/J-RS3-ME/status", json={"status": "ORDER"})

        db.expire_all()
        assert committed_by_branch(db, "RS3") == {"HQ": 15, "MELB": 8}

    def test_the_locations_endpoint_reports_the_derived_split(
        self, client, db, make_inventory
    ):
        make_inventory(sku="RS4", stock=100)
        adjust_location(db, "RS4", "HQ", on_hand=60)
        adjust_location(db, "RS4", "MELB", on_hand=40)
        db.commit()
        _job(db, "J-RS4", "RS4", 25, branch="MELB")
        client.post("/jobs/J-RS4/status", json={"status": "ORDER"})

        rows = {r["branch"]: r for r in client.get("/inventory/RS4/locations").json()}
        assert rows["MELB"]["committed_qty"] == 25
        assert rows["MELB"]["available_qty"] == 15
        assert rows["HQ"]["committed_qty"] == 0
        assert rows["HQ"]["available_qty"] == 60


@pytest.mark.integration
class TestOnOrderIsDerivedEverywhere:
    def _po(self, db, po_id, sku, ordered, received=0, status="Sent"):
        db.add(
            PurchaseOrder(
                id=po_id,
                supplier_id="S1",
                supplier_name="Acme",
                status=status,
                order_date="01/08/2026",
            )
        )
        db.add(
            PurchaseOrderItem(
                order_id=po_id, sku=sku, qty_ordered=ordered, qty_received=received
            )
        )
        db.commit()

    def test_locations_tab_shows_outstanding_purchase_orders(
        self, client, db, make_inventory
    ):
        """`on_po_qty` was a stored column nothing wrote, rendered as a figure."""
        make_inventory(sku="RS5", stock=10)
        adjust_location(db, "RS5", "HQ", on_hand=10)
        db.commit()
        self._po(db, "PO-RS5", "RS5", 80, received=30)

        assert on_order_total(db, "RS5") == 50
        rows = {r["branch"]: r for r in client.get("/inventory/RS5/locations").json()}
        assert rows["HQ"]["on_po_qty"] == 50

    def test_the_grid_and_the_locations_tab_agree(self, client, db, make_inventory):
        make_inventory(sku="RS6", stock=5)
        adjust_location(db, "RS6", "HQ", on_hand=5)
        db.commit()
        self._po(db, "PO-RS6", "RS6", 40)

        grid = _row(client, "RS6")["on_order_qty"]
        locations = client.get("/inventory/RS6/locations").json()
        assert grid == sum(r["on_po_qty"] for r in locations) == 40


@pytest.mark.integration
class TestBackordersAreDerived:
    """`backorder_qty` was a stored column only the manual location editor set,
    while `JobItem.b_ord` held the real figure — what a job still needs and
    could not be supplied from stock."""

    def test_the_locations_tab_reports_waiting_jobs(self, client, db, make_inventory):
        make_inventory(sku="RS7", stock=0)
        adjust_location(db, "RS7", "HQ", on_hand=0)
        db.commit()
        _job(db, "J-RS7", "RS7", 20, branch="HQ")
        client.post("/jobs/J-RS7/status", json={"status": "ORDER"})

        db.expire_all()
        # Backordered means nothing was supplied from stock: supply_qty is what
        # the shelf covered, b_ord what it could not.
        item = db.query(JobItem).filter_by(job_id="J-RS7").one()
        item.supply_qty, item.b_ord = 0, 20
        db.commit()

        rows = {r["branch"]: r for r in client.get("/inventory/RS7/locations").json()}
        assert rows["HQ"]["backorder_qty"] == 20

    def test_filling_a_backorder_draws_it_down(self, client, db, make_inventory):
        make_inventory(sku="RS8", stock=0)
        adjust_location(db, "RS8", "HQ", on_hand=0)
        db.commit()
        _job(db, "J-RS8", "RS8", 30, branch="HQ")
        client.post("/jobs/J-RS8/status", json={"status": "ORDER"})
        db.expire_all()
        line = db.query(JobItem).filter_by(job_id="J-RS8").one()
        line.supply_qty, line.b_ord = 0, 30
        db.commit()

        receipt = client.post(
            "/goods-receipts",
            json={
                "supplier_name": "Acme",
                "received_date": "2026-08-15",
                "branch": "HQ",
                "lines": [
                    {
                        "sku": "RS8",
                        "qty_expected": 12,
                        "qty_received": 12,
                        "unit_cost": 3,
                    }
                ],
            },
        ).json()
        client.post(f"/goods-receipts/{receipt['id']}/accept")

        rows = {r["branch"]: r for r in client.get("/inventory/RS8/locations").json()}
        assert rows["HQ"]["backorder_qty"] == 18, "12 of the 30 were filled"

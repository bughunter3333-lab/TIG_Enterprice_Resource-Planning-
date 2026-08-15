"""
The remaining movement paths must also keep per-location positions true:
transfer, stocktake, adjustment, and job commit/release.

Every one of these moved the global total while leaving StockLocation stale,
so a Locations tab could silently stop adding up to the item.
"""

import pytest
from app.core.stock_location import adjust_location, location_summary
from app.models.job import Job, JobItem
from app.models.stock_location import StockLocation


def _loc(db, sku, branch):
    return db.query(StockLocation).filter_by(sku=sku, branch=branch).first()


@pytest.mark.integration
class TestTransferMovesBetweenBranches:
    def test_transfer_shifts_the_position_between_branches(
        self, client, db, make_inventory
    ):
        make_inventory(sku="TR1", stock=50)
        adjust_location(db, "TR1", "HQ", on_hand=50)
        db.commit()

        r = client.post(
            "/inventory/transfer",
            json={
                "from_sku": "TR1",
                "quantity": 20,
                "from_branch": "HQ",
                "to_branch": "MELB",
                "reference": "TRF-1",
            },
        )
        assert r.status_code == 200
        db.expire_all()
        assert _loc(db, "TR1", "HQ").qty_on_hand == 30
        assert _loc(db, "TR1", "MELB").qty_on_hand == 20
        # A branch transfer moves stock, it does not create or destroy any:
        # the item total is unchanged and everything still has a home.
        s = location_summary(db, "TR1")
        assert s["total_on_hand"] == 50 and s["in_sync"] is True

    def test_relocating_the_same_sku_does_not_destroy_stock(
        self, client, db, make_inventory
    ):
        """Regression: a same-SKU move used to decrement the item total without
        ever adding it back, so shifting stock between bins/branches silently
        destroyed it. Relocation must be quantity-neutral."""
        make_inventory(sku="TR9", stock=40)
        adjust_location(db, "TR9", "HQ", on_hand=40)
        db.commit()
        r = client.post(
            "/inventory/transfer",
            json={
                "from_sku": "TR9",
                "quantity": 15,
                "from_branch": "HQ",
                "to_location": "B-02-05",
            },
        )
        assert r.status_code == 200
        db.expire_all()
        from app.models.inventory import InventoryItem

        assert db.query(InventoryItem).filter_by(sku="TR9").one().stock == 40
        assert location_summary(db, "TR9")["in_sync"] is True

    def test_cross_sku_transfer_tracks_both_items(self, client, db, make_inventory):
        make_inventory(sku="TR2", stock=10)
        make_inventory(sku="TR3", stock=0)
        adjust_location(db, "TR2", "HQ", on_hand=10)
        db.commit()
        r = client.post(
            "/inventory/transfer",
            json={
                "from_sku": "TR2",
                "to_sku": "TR3",
                "quantity": 4,
                "from_branch": "HQ",
            },
        )
        assert r.status_code == 200
        db.expire_all()
        assert _loc(db, "TR2", "HQ").qty_on_hand == 6
        assert _loc(db, "TR3", "HQ").qty_on_hand == 4


@pytest.mark.integration
class TestStocktakeAndAdjustment:
    def test_stocktake_variance_lands_on_the_counted_branch(
        self, client, db, make_inventory
    ):
        make_inventory(sku="ST1", stock=100)
        adjust_location(db, "ST1", "HQ", on_hand=100)
        db.commit()
        # counted 92 -> variance -8
        r = client.post(
            "/inventory/stocktake",
            json={
                "reference": "ST-1",
                "branch": "HQ",
                "items": [{"sku": "ST1", "counted_qty": 92}],
            },
        )
        assert r.status_code == 200
        db.expire_all()
        assert _loc(db, "ST1", "HQ").qty_on_hand == 92
        assert location_summary(db, "ST1")["in_sync"] is True

    def test_adjustment_moves_the_branch_position(self, client, db, make_inventory):
        make_inventory(sku="ADJ1", stock=20)
        adjust_location(db, "ADJ1", "MELB", on_hand=20)
        db.commit()
        r = client.post(
            "/inventory/ADJ1/adjust",
            json={"adjustment": -5, "reason": "Damaged", "branch": "MELB"},
        )
        assert r.status_code == 200
        db.expire_all()
        assert _loc(db, "ADJ1", "MELB").qty_on_hand == 15
        assert location_summary(db, "ADJ1")["in_sync"] is True


@pytest.mark.integration
class TestCommitReleasePerBranch:
    def _job(self, db, job_id, sku, qty, branch, status="ORDER"):
        db.add(
            Job(
                id=job_id,
                customer_id="CC1",
                customer_name="Cust",
                status=status,
                branch=branch,
                date_in="2026-08-01",
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

    def test_committing_a_job_reserves_at_its_branch(self, client, db, make_inventory):
        make_inventory(sku="CM1", stock=30)
        adjust_location(db, "CM1", "MELB", on_hand=30)
        db.commit()
        self._job(db, "J-CM1", "CM1", 12, "MELB", status="QUOTE")

        assert (
            client.post("/jobs/J-CM1/status", json={"status": "ORDER"}).status_code
            == 200
        )
        db.expire_all()
        row = _loc(db, "CM1", "MELB")
        assert row.committed_qty == 12
        # committing reserves stock, it does not remove it
        assert row.qty_on_hand == 30
        assert row.available_qty == 18

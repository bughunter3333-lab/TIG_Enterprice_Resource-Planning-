"""
Per-location stock positions must track real movement (Jim2 "Qty by Locations",
ERPNext Bin). StockLocation existed but nothing outside its own CRUD wrote it,
so the Locations tab drifted from reality the moment stock moved.
"""

import pytest
from app.core.stock_location import adjust_location, location_summary
from app.models.stock_location import StockLocation


@pytest.mark.unit
class TestAdjustLocation:
    def test_creates_the_row_on_first_movement(self, db, make_inventory):
        make_inventory(sku="L1", stock=0)
        adjust_location(db, "L1", "HQ", on_hand=10)
        db.commit()
        row = db.query(StockLocation).filter_by(sku="L1", branch="HQ").one()
        assert row.qty_on_hand == 10

    def test_accumulates_and_never_goes_negative(self, db, make_inventory):
        make_inventory(sku="L2", stock=0)
        adjust_location(db, "L2", "HQ", on_hand=10)
        adjust_location(db, "L2", "HQ", on_hand=-4)
        db.commit()
        row = db.query(StockLocation).filter_by(sku="L2", branch="HQ").one()
        assert row.qty_on_hand == 6
        # Over-shipping a location must not create negative on-hand.
        adjust_location(db, "L2", "HQ", on_hand=-99)
        db.commit()
        db.refresh(row)
        assert row.qty_on_hand == 0

    def test_branches_are_independent(self, db, make_inventory):
        make_inventory(sku="L3", stock=0)
        adjust_location(db, "L3", "HQ", on_hand=10)
        adjust_location(db, "L3", "MELB", on_hand=5, committed=2)
        db.commit()
        hq = db.query(StockLocation).filter_by(sku="L3", branch="HQ").one()
        melb = db.query(StockLocation).filter_by(sku="L3", branch="MELB").one()
        assert (hq.qty_on_hand, hq.committed_qty) == (10, 0)
        assert (melb.qty_on_hand, melb.committed_qty) == (5, 2)
        assert melb.available_qty == 3


@pytest.mark.unit
class TestLocationSummary:
    def test_reports_drift_between_located_and_total(self, db, make_inventory):
        # Legacy item: 100 on hand but nothing allocated to a location yet.
        make_inventory(sku="L4", stock=100)
        s = location_summary(db, "L4")
        assert s["total_on_hand"] == 100
        assert s["located"] == 0
        assert s["unlocated"] == 100
        assert s["in_sync"] is False

    def test_in_sync_once_every_unit_has_a_home(self, db, make_inventory):
        make_inventory(sku="L5", stock=30)
        adjust_location(db, "L5", "HQ", on_hand=20)
        adjust_location(db, "L5", "MELB", on_hand=10)
        db.commit()
        s = location_summary(db, "L5")
        assert s["located"] == 30
        assert s["unlocated"] == 0
        assert s["in_sync"] is True


@pytest.mark.integration
class TestReceiptUpdatesLocation:
    def test_accepting_a_receipt_lands_stock_in_its_branch(
        self, client, db, make_inventory
    ):
        make_inventory(sku="L6", stock=0)
        r = client.post(
            "/goods-receipts",
            json={
                "supplier_name": "Acme",
                "received_date": "2026-08-15",
                "branch": "MELB",
                "lines": [
                    {
                        "sku": "L6",
                        "qty_expected": 40,
                        "qty_received": 40,
                        "unit_cost": 5,
                    }
                ],
            },
        )
        assert r.status_code == 201
        assert r.json()["branch"] == "MELB"
        assert (
            client.post(f"/goods-receipts/{r.json()['id']}/accept").status_code == 200
        )

        db.expire_all()
        row = db.query(StockLocation).filter_by(sku="L6", branch="MELB").one()
        assert row.qty_on_hand == 40
        # and it reconciles against the item total
        assert location_summary(db, "L6")["in_sync"] is True

    def test_receipt_defaults_to_hq_when_branch_omitted(
        self, client, db, make_inventory
    ):
        make_inventory(sku="L7", stock=0)
        rid = client.post(
            "/goods-receipts",
            json={
                "supplier_name": "Acme",
                "received_date": "2026-08-15",
                "lines": [
                    {"sku": "L7", "qty_expected": 5, "qty_received": 5, "unit_cost": 1}
                ],
            },
        ).json()["id"]
        client.post(f"/goods-receipts/{rid}/accept")
        db.expire_all()
        assert (
            db.query(StockLocation).filter_by(sku="L7", branch="HQ").one().qty_on_hand
            == 5
        )

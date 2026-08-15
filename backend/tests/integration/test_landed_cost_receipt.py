"""
Integration: landed costs on a goods receipt flow through to inventory COG.

Jim2 model — Cost stays the supplier price, COG carries the freight/duty.
"""

import pytest
from app.models.inventory import InventoryItem


@pytest.mark.integration
class TestLandedCostOnReceipt:
    def _create(self, client, charges):
        return client.post(
            "/goods-receipts",
            json={
                "supplier_name": "Acme Imports",
                "received_date": "2026-08-15",
                "lines": [
                    {
                        "sku": "LC-TEE",
                        "qty_expected": 100,
                        "qty_received": 100,
                        "unit_cost": 6.20,
                    },
                    {
                        "sku": "LC-POLO",
                        "qty_expected": 50,
                        "qty_received": 50,
                        "unit_cost": 12.50,
                    },
                ],
                "charges": charges,
            },
        )

    def test_freight_lands_into_cog_not_cost(self, client, db, make_inventory):
        make_inventory(sku="LC-TEE", stock=0, unit_cost=6.20)
        make_inventory(sku="LC-POLO", stock=0, unit_cost=12.50)
        r = self._create(
            client, [{"description": "Sea freight", "amount": 249.00, "basis": "value"}]
        )
        assert r.status_code == 201
        assert r.json()["landed_total"] == 249.00
        rid = r.json()["id"]

        assert client.post(f"/goods-receipts/{rid}/accept").status_code == 200

        db.expire_all()
        tee = db.query(InventoryItem).filter_by(sku="LC-TEE").first()
        polo = db.query(InventoryItem).filter_by(sku="LC-POLO").first()
        # Cost is untouched by freight...
        assert float(tee.unit_cost) == 6.20
        assert float(tee.last_cost) == 6.20
        # ...but COG carries it: 620 and 625 of 1245 total value, 249 @ 20%
        assert float(tee.last_cog) == pytest.approx(7.44, abs=0.001)
        assert float(polo.last_cog) == pytest.approx(15.00, abs=0.001)
        # first receipt into empty stock → avg == last
        assert float(tee.avg_cog) == pytest.approx(7.44, abs=0.001)
        assert float(tee.max_cog) == pytest.approx(7.44, abs=0.001)

    def test_no_charges_means_cog_equals_cost(self, client, db, make_inventory):
        make_inventory(sku="LC-TEE", stock=0, unit_cost=6.20)
        make_inventory(sku="LC-POLO", stock=0, unit_cost=12.50)
        rid = self._create(client, []).json()["id"]
        client.post(f"/goods-receipts/{rid}/accept")
        db.expire_all()
        tee = db.query(InventoryItem).filter_by(sku="LC-TEE").first()
        assert float(tee.last_cog) == pytest.approx(6.20, abs=0.001)

    def test_avg_cog_is_weighted_against_existing_stock(
        self, client, db, make_inventory
    ):
        # 100 already on hand at COG 7.00; receive 100 more landing at 8.00
        make_inventory(sku="LC-TEE", stock=100, unit_cost=6.20)
        make_inventory(sku="LC-POLO", stock=0, unit_cost=12.50)
        tee = db.query(InventoryItem).filter_by(sku="LC-TEE").first()
        tee.avg_cog = 7.00
        db.commit()

        # 100 tees @ 6.20 with 180.00 freight on qty basis across 150 units
        # → 1.20/unit → tee COG 7.40
        rid = self._create(
            client, [{"description": "Airfreight", "amount": 180.00, "basis": "qty"}]
        ).json()["id"]
        client.post(f"/goods-receipts/{rid}/accept")

        db.expire_all()
        tee = db.query(InventoryItem).filter_by(sku="LC-TEE").first()
        # (100 * 7.00 + 100 * 7.40) / 200 = 7.20
        assert float(tee.avg_cog) == pytest.approx(7.20, abs=0.001)
        assert float(tee.stock) == 200

    def test_invalid_basis_rejected(self, client, make_inventory):
        make_inventory(sku="LC-TEE", stock=0)
        r = client.post(
            "/goods-receipts",
            json={
                "supplier_name": "X",
                "received_date": "2026-08-15",
                "lines": [{"sku": "LC-TEE", "qty_received": 1, "unit_cost": 1.0}],
                "charges": [{"description": "Bad", "amount": 5, "basis": "weight"}],
            },
        )
        assert r.status_code == 422

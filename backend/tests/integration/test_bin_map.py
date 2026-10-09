"""The warehouse bin map: every bin in a branch that has stock slotted into it.

The 3D warehouse view draws the racking from this. Each row is one bin and
one SKU; a SKU slotted into a primary and an overflow bin appears twice. The
stock record keeps one count per branch, not per bin, so the quantities are
the SKU's figures for the branch and say so — nothing per-bin is invented.
"""

import pytest

from app.models.job import Job, JobItem
from app.models.stock_location import StockLocation


def _slot(db, sku, branch, qty, bin1=None, max1=None, bin2=None, max2=None):
    db.add(
        StockLocation(
            sku=sku,
            branch=branch,
            qty_on_hand=qty,
            primary_bin_1=bin1,
            max_qty_bin_1=max1,
            primary_bin_2=bin2,
            max_qty_bin_2=max2,
        )
    )
    db.commit()


@pytest.mark.integration
class TestBinMap:
    def test_lists_each_slotted_bin_in_the_branch(self, client, db, make_inventory):
        make_inventory(sku="AS-5001-NAV-L", name="Staple Tee Navy L", stock=40)
        make_inventory(sku="CAP-5PNL-BLK", name="5-Panel Cap Black", stock=12)
        make_inventory(sku="UNSLOTTED", name="No bin yet", stock=5)
        _slot(db, "AS-5001-NAV-L", "HQ", 40, "A.1.A.1", 30, "A.1.B.1", 20)
        _slot(db, "CAP-5PNL-BLK", "HQ", 12, "B.3.C.4", 24)
        _slot(db, "UNSLOTTED", "HQ", 5)
        _slot(db, "CAP-5PNL-BLK", "MELB", 7, "A.1.A.1")

        r = client.get("/inventory/bin-map", params={"branch": "HQ"})
        assert r.status_code == 200
        body = r.json()
        assert body["branch"] == "HQ"
        got = {(b["bin"], b["sku"], b["slot"]) for b in body["bins"]}
        assert got == {
            ("A.1.A.1", "AS-5001-NAV-L", "primary"),
            ("A.1.B.1", "AS-5001-NAV-L", "overflow"),
            ("B.3.C.4", "CAP-5PNL-BLK", "primary"),
        }

    def test_carries_the_branch_figures_and_the_bin_capacity(
        self, client, db, make_inventory
    ):
        make_inventory(sku="AS-5001-NAV-L", name="Staple Tee Navy L", stock=40)
        _slot(db, "AS-5001-NAV-L", "HQ", 40, "A.1.A.1", 30)
        job = Job(id="J-BM1", customer_id="C1", status="ORDER", branch="HQ")
        job.items.append(
            JobItem(display_type="product", stock_code="AS-5001-NAV-L", supply_qty=15)
        )
        db.add(job)
        db.commit()

        row = client.get("/inventory/bin-map", params={"branch": "HQ"}).json()["bins"][
            0
        ]
        assert row["name"] == "Staple Tee Navy L"
        assert row["max_qty"] == 30
        assert row["qty_on_hand"] == 40
        assert row["committed_qty"] == 15
        assert row["available_qty"] == 25

    def test_blank_bins_are_not_bins(self, client, db, make_inventory):
        make_inventory(sku="SKU-BLANK", stock=1)
        _slot(db, "SKU-BLANK", "HQ", 1, "  ", None, "")
        assert (
            client.get("/inventory/bin-map", params={"branch": "HQ"}).json()["bins"]
            == []
        )

    def test_an_unknown_branch_is_refused(self, client):
        r = client.get("/inventory/bin-map", params={"branch": "NOWHERE"})
        assert r.status_code == 400

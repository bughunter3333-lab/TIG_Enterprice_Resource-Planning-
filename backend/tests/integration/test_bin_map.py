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


@pytest.mark.integration
class TestPutAway:
    """Adding stock to a box from the warehouse map.

    One request does what three separate calls would otherwise do half of:
    slot the SKU into the box (audited), and post the quantity through the
    stock ledger so on hand, the branch position and the movement history agree.
    """

    def _put(self, client, **over):
        body = {
            "branch": "HQ",
            "bin": "E.2.H.4",
            "sku": "AS-5001-NAV-L",
            "slot": "primary",
            "quantity": 12,
            "new_stock": True,
        }
        body.update(over)
        return client.post("/inventory/bin-map/put-away", json=body)

    def test_slots_a_sku_into_an_empty_box_and_adds_the_stock(
        self, client, db, make_inventory
    ):
        from app.models.inventory import InventoryItem, StockMovement
        from app.models.stock_audit import StockAuditEntry

        make_inventory(sku="AS-5001-NAV-L", name="Staple Tee Navy L", stock=0)
        r = self._put(client)
        assert r.status_code == 200, r.text

        loc = db.query(StockLocation).filter_by(sku="AS-5001-NAV-L", branch="HQ").one()
        assert loc.primary_bin_1 == "E.2.H.4"
        assert loc.qty_on_hand == 12
        assert db.query(InventoryItem).filter_by(sku="AS-5001-NAV-L").one().stock == 12
        move = db.query(StockMovement).filter_by(sku="AS-5001-NAV-L").one()
        assert move.quantity == 12
        assert move.location_branch == "HQ"
        assert move.reference == "E.2.H.4"
        assert db.query(StockAuditEntry).filter_by(sku="AS-5001-NAV-L").count() >= 1

        rows = client.get("/inventory/bin-map", params={"branch": "HQ"}).json()["bins"]
        assert [(b["bin"], b["sku"], b["qty_on_hand"]) for b in rows] == [
            ("E.2.H.4", "AS-5001-NAV-L", 12)
        ]

    def test_quantity_zero_only_slots(self, client, db, make_inventory):
        from app.models.inventory import StockMovement

        make_inventory(sku="AS-5001-NAV-L", stock=0)
        assert self._put(client, quantity=0).status_code == 200
        assert db.query(StockMovement).filter_by(sku="AS-5001-NAV-L").count() == 0
        loc = db.query(StockLocation).filter_by(sku="AS-5001-NAV-L", branch="HQ").one()
        assert loc.primary_bin_1 == "E.2.H.4"

    def test_more_stock_into_a_box_the_sku_already_uses(
        self, client, db, make_inventory
    ):
        make_inventory(sku="AS-5001-NAV-L", stock=0)
        self._put(client, quantity=5)
        r = self._put(
            client, quantity=7, slot="overflow"
        )  # already its primary: no slot change
        assert r.status_code == 200, r.text
        loc = db.query(StockLocation).filter_by(sku="AS-5001-NAV-L", branch="HQ").one()
        assert (loc.primary_bin_1, loc.primary_bin_2, loc.qty_on_hand) == (
            "E.2.H.4",
            None,
            12,
        )

    def test_an_occupied_slot_is_never_overwritten_silently(
        self, client, db, make_inventory
    ):
        make_inventory(sku="AS-5001-NAV-L", stock=0)
        _slot(db, "AS-5001-NAV-L", "HQ", 0, "A.1.A.1")
        r = self._put(client, quantity=3)
        assert r.status_code == 409
        assert "A.1.A.1" in r.json()["detail"]
        loc = db.query(StockLocation).filter_by(sku="AS-5001-NAV-L", branch="HQ").one()
        assert loc.primary_bin_1 == "A.1.A.1" and loc.qty_on_hand == 0

        r = self._put(client, quantity=3, replace=True)
        assert r.status_code == 200, r.text
        db.refresh(loc)
        assert loc.primary_bin_1 == "E.2.H.4" and loc.qty_on_hand == 3

    def test_the_overflow_slot_takes_a_second_box(self, client, db, make_inventory):
        make_inventory(sku="AS-5001-NAV-L", stock=0)
        _slot(db, "AS-5001-NAV-L", "HQ", 0, "A.1.A.1")
        assert (
            self._put(client, slot="overflow", quantity=4, max_qty=30).status_code
            == 200
        )
        loc = db.query(StockLocation).filter_by(sku="AS-5001-NAV-L", branch="HQ").one()
        assert (loc.primary_bin_1, loc.primary_bin_2, loc.max_qty_bin_2) == (
            "A.1.A.1",
            "E.2.H.4",
            30,
        )

    def test_staff_cannot_put_away(self, staff_client, make_inventory):
        make_inventory(sku="AS-5001-NAV-L", stock=0)
        r = staff_client.post(
            "/inventory/bin-map/put-away",
            json={
                "branch": "HQ",
                "bin": "E.2.H.4",
                "sku": "AS-5001-NAV-L",
                "quantity": 1,
            },
        )
        assert r.status_code == 403

    def test_bad_requests_are_refused_and_change_nothing(
        self, client, db, make_inventory
    ):
        from app.models.inventory import InventoryItem

        make_inventory(sku="AS-5001-NAV-L", stock=0)
        assert self._put(client, bin="A-01-04").status_code == 400
        assert self._put(client, branch="NOWHERE").status_code == 400
        assert self._put(client, sku="NO-SUCH-SKU").status_code == 404
        assert self._put(client, quantity=-5).status_code == 422
        assert db.query(InventoryItem).filter_by(sku="AS-5001-NAV-L").one().stock == 0
        assert db.query(StockLocation).filter_by(sku="AS-5001-NAV-L").count() == 0

    def test_stock_already_on_hand_goes_into_a_box_without_being_counted_again(
        self, client, db, make_inventory
    ):
        """Received stock is already in the on-hand figure for the branch. Typing
        its quantity while putting it in a box must not add it a second time."""
        from app.models.inventory import InventoryItem, StockMovement

        make_inventory(sku="AS-5001-NAV-L", stock=25)
        _slot(db, "AS-5001-NAV-L", "HQ", 25)
        r = self._put(client, quantity=25, new_stock=False)
        assert r.status_code == 200, r.text
        assert (r.json()["placed_unlocated"], r.json()["on_hand_change"]) == (0, 0)

        assert db.query(InventoryItem).filter_by(sku="AS-5001-NAV-L").one().stock == 25
        loc = db.query(StockLocation).filter_by(sku="AS-5001-NAV-L", branch="HQ").one()
        assert (loc.primary_bin_1, loc.qty_on_hand) == ("E.2.H.4", 25)
        assert db.query(StockMovement).filter_by(sku="AS-5001-NAV-L").count() == 0

    def test_on_hand_stock_with_no_location_is_placed_not_added(
        self, client, db, make_inventory
    ):
        """Legacy stock has a total and no position. Putting it in a box is the
        same units finding a home: the total must not grow."""
        from app.models.inventory import InventoryItem, StockMovement

        make_inventory(sku="AS-5001-NAV-L", stock=50)
        r = self._put(client, quantity=30, new_stock=False)
        assert r.status_code == 200, r.text
        assert (r.json()["placed_unlocated"], r.json()["on_hand_change"]) == (30, 0)

        assert db.query(InventoryItem).filter_by(sku="AS-5001-NAV-L").one().stock == 50
        loc = db.query(StockLocation).filter_by(sku="AS-5001-NAV-L", branch="HQ").one()
        assert loc.qty_on_hand == 30
        moves = db.query(StockMovement).filter_by(sku="AS-5001-NAV-L").all()
        assert [
            (m.type, m.quantity, m.reference, m.location_branch) for m in moves
        ] == [("Put Away", 30, "E.2.H.4", "HQ")]
        summary = client.get("/inventory/AS-5001-NAV-L/location-summary").json()
        assert (summary["total_on_hand"], summary["unlocated"]) == (50, 20)

    def test_no_more_is_placed_than_has_no_location(self, client, db, make_inventory):
        from app.models.inventory import InventoryItem

        make_inventory(sku="AS-5001-NAV-L", stock=50)
        r = self._put(client, quantity=80, new_stock=False)
        assert r.status_code == 200, r.text
        assert (r.json()["placed_unlocated"], r.json()["on_hand_change"]) == (50, 0)
        assert db.query(InventoryItem).filter_by(sku="AS-5001-NAV-L").one().stock == 50
        loc = db.query(StockLocation).filter_by(sku="AS-5001-NAV-L", branch="HQ").one()
        assert loc.qty_on_hand == 50

    def test_new_stock_is_added_and_leaves_unlocated_stock_alone(
        self, client, db, make_inventory
    ):
        from app.models.inventory import InventoryItem, StockMovement

        make_inventory(sku="AS-5001-NAV-L", stock=50)
        r = self._put(client, quantity=30, new_stock=True)
        assert r.status_code == 200, r.text
        assert (r.json()["placed_unlocated"], r.json()["on_hand_change"]) == (0, 30)

        assert db.query(InventoryItem).filter_by(sku="AS-5001-NAV-L").one().stock == 80
        loc = db.query(StockLocation).filter_by(sku="AS-5001-NAV-L", branch="HQ").one()
        assert loc.qty_on_hand == 30
        moves = db.query(StockMovement).filter_by(sku="AS-5001-NAV-L").all()
        assert [(m.type, m.quantity) for m in moves] == [("Adjustment", 30)]
        summary = client.get("/inventory/AS-5001-NAV-L/location-summary").json()
        assert (summary["total_on_hand"], summary["unlocated"]) == (80, 50)

    def test_a_quantity_is_not_new_stock_unless_the_request_says_so(
        self, client, db, make_inventory
    ):
        from app.models.inventory import InventoryItem

        make_inventory(sku="AS-5001-NAV-L", stock=25)
        _slot(db, "AS-5001-NAV-L", "HQ", 25)
        body = {"branch": "HQ", "bin": "E.2.H.4", "sku": "AS-5001-NAV-L", "quantity": 9}
        assert client.post("/inventory/bin-map/put-away", json=body).status_code == 200
        assert db.query(InventoryItem).filter_by(sku="AS-5001-NAV-L").one().stock == 25

    def test_the_pick_location_follows_the_primary_bin_at_hq(
        self, client, db, make_inventory
    ):
        """Picking slips print the item's location. Re-slotting the primary bin
        from the map must send pickers to the new box, not the old one."""
        from app.models.inventory import InventoryItem

        make_inventory(sku="AS-5001-NAV-L", stock=0, location="A-01-04")
        _slot(db, "AS-5001-NAV-L", "HQ", 0, "A-01-04")
        item = db.query(InventoryItem).filter_by(sku="AS-5001-NAV-L").one()

        # An overflow box, or a box at another branch, is not where it is picked from.
        assert self._put(client, slot="overflow", quantity=0).status_code == 200
        assert (
            self._put(client, branch="MELB", bin="A.1.A.1", quantity=0).status_code
            == 200
        )
        db.refresh(item)
        assert item.location == "A-01-04"

        assert (
            self._put(client, bin="B.3.H.1", quantity=0, replace=True).status_code
            == 200
        )
        db.refresh(item)
        assert item.location == "B.3.H.1"

    def test_a_changed_pick_location_is_on_the_audit_trail(
        self, client, db, make_inventory
    ):
        """It decides where a picker is sent, so who changed it and what it was
        before has to be answerable - including when the box was already the
        product's primary bin and nothing else about the position changed."""
        from app.models.inventory import InventoryItem
        from app.models.stock_audit import StockAuditEntry

        make_inventory(sku="AS-5001-NAV-L", stock=0, location="A-01-04")
        _slot(db, "AS-5001-NAV-L", "HQ", 0, " e.02.h.04 ")
        assert self._put(client, quantity=0).status_code == 200

        item = db.query(InventoryItem).filter_by(sku="AS-5001-NAV-L").one()
        # The plain code, not the spelling the position happens to be stored under.
        assert item.location == "E.2.H.4"
        rows = db.query(StockAuditEntry).filter_by(sku="AS-5001-NAV-L").all()
        assert [(r.branch, r.field, r.old_value, r.new_value) for r in rows] == [
            (None, "location", "A-01-04", "E.2.H.4")
        ]
        assert rows[0].changed_by

        # Same box again: nothing changes, so nothing is recorded.
        assert self._put(client, quantity=0).status_code == 200
        assert db.query(StockAuditEntry).filter_by(sku="AS-5001-NAV-L").count() == 1

    def test_a_zero_padded_stored_code_is_the_same_box(
        self, client, db, make_inventory
    ):
        """The Locations tab stores free text, so `E.02.H.04` can be on file for
        the box the map draws as E.2.H.4. It must not become both of a SKU's bins."""
        make_inventory(sku="AS-5001-NAV-L", stock=0)
        _slot(db, "AS-5001-NAV-L", "HQ", 0, "E.02.H.04")
        r = self._put(client, slot="overflow", quantity=3)
        assert r.status_code == 200, r.text
        assert r.json()["slot"] == "primary"
        loc = db.query(StockLocation).filter_by(sku="AS-5001-NAV-L", branch="HQ").one()
        assert (loc.primary_bin_1, loc.primary_bin_2, loc.qty_on_hand) == (
            "E.02.H.04",
            None,
            3,
        )

    def test_the_box_is_stored_under_its_plain_code(self, client, db, make_inventory):
        make_inventory(sku="AS-5001-NAV-L", stock=0)
        r = self._put(client, bin=" e.02.h.004 ", quantity=0)
        assert r.status_code == 200, r.text
        assert r.json()["bin"] == "E.2.H.4"
        loc = db.query(StockLocation).filter_by(sku="AS-5001-NAV-L", branch="HQ").one()
        assert loc.primary_bin_1 == "E.2.H.4"

    def test_a_new_box_does_not_inherit_the_old_box_capacity(
        self, client, db, make_inventory
    ):
        make_inventory(sku="AS-5001-NAV-L", stock=0)
        # Primary holds 500; an overflow bin was cleared but its capacity left behind.
        _slot(db, "AS-5001-NAV-L", "HQ", 0, "A.1.A.1", 500, None, 7)
        assert self._put(client, quantity=0, replace=True).status_code == 200
        assert (
            self._put(client, bin="E.2.H.5", slot="overflow", quantity=0).status_code
            == 200
        )
        loc = db.query(StockLocation).filter_by(sku="AS-5001-NAV-L", branch="HQ").one()
        assert (loc.primary_bin_1, loc.max_qty_bin_1) == ("E.2.H.4", None)
        assert (loc.primary_bin_2, loc.max_qty_bin_2) == ("E.2.H.5", None)

    def test_the_quantity_is_on_the_audit_trail_with_who_added_it(
        self, client, db, make_inventory
    ):
        from app.models.stock_audit import StockAuditEntry

        make_inventory(sku="AS-5001-NAV-L", stock=0)
        assert self._put(client, quantity=12).status_code == 200
        # More into the same box: no slot change, and still someone did it.
        assert self._put(client, quantity=500).status_code == 200

        entries = (
            db.query(StockAuditEntry)
            .filter_by(sku="AS-5001-NAV-L", field="qty_on_hand")
            .order_by(StockAuditEntry.id)
            .all()
        )
        assert [(e.old_value, e.new_value) for e in entries] == [
            (None, "12"),
            ("12", "512"),
        ]
        assert all(e.changed_by for e in entries)

    def test_codes_and_capacities_the_database_cannot_hold_are_refused(
        self, client, db, make_inventory
    ):
        make_inventory(sku="AS-5001-NAV-L", stock=0)
        # Digits the map cannot read (full-width 3), a bay or box numbered 0.
        assert self._put(client, bin="B.\uff13.H.1").status_code == 400
        assert self._put(client, bin="B.0.H.1").status_code == 400
        assert self._put(client, bin="B.3.H.0").status_code == 400
        # Longer than the column, larger than the column.
        assert self._put(client, bin="A" * 60 + ".1.A.1").status_code == 422
        # Letters that are not A-Z: upper-casing turns one "\ufb03" into "FFI",
        # so a short code could outgrow the column, and "\u00df" would become SS.
        assert self._put(client, bin="\ufb03" * 17 + ".1.a.1").status_code == 400
        assert self._put(client, bin="\u00df.1.a.1").status_code == 400
        assert self._put(client, max_qty=10**12).status_code == 422
        assert db.query(StockLocation).filter_by(sku="AS-5001-NAV-L").count() == 0

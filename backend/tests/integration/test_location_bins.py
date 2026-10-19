"""A bin on a stock position is a real box in the branch's racking.

Any text used to be accepted as a bin, so a mistyped code — or "dasdas" — was
saved as a place: not on the warehouse map, and printed on a picking slip. A
bin being set now has to be an aisle.bay.level.box code that exists in the
branch's racking layout, the refusal says exactly what is wrong, and the other
attributes of a position are bounded too.

Codes on file from before the check are left alone until they are re-slotted:
a position with an old bin can still have its other fields saved.
"""

import json

import pytest

from app.models.admin_setting import AdminSetting
from app.models.stock_location import StockLocation

SKU = "TW1822.BLA.L"


@pytest.fixture
def item(make_inventory):
    return make_inventory(sku=SKU, name="TIGWear Polo", stock=0)


def _add(client, **fields):
    return client.post(f"/inventory/{SKU}/locations", json={"branch": "HQ", **fields})


def _change(client, branch="HQ", **fields):
    return client.patch(f"/inventory/{SKU}/locations/{branch}", json=fields)


def _on_file(db, branch="HQ"):
    db.expire_all()
    return (
        db.query(StockLocation)
        .filter(StockLocation.sku == SKU, StockLocation.branch == branch)
        .first()
    )


def _legacy(db, branch="HQ", **fields):
    """A position saved before bins were checked."""
    db.add(StockLocation(sku=SKU, branch=branch, qty_on_hand=0, **fields))
    db.commit()


@pytest.mark.integration
class TestABinHasToBeARealBox:
    def test_text_that_is_not_a_code_is_refused_and_nothing_is_saved(
        self, client, db, item
    ):
        r = _add(client, branch="3PLP", primary_bin_1="dasdas")
        assert r.status_code == 400
        assert r.json()["detail"] == (
            "Primary bin 1 'dasdas' is not an aisle.bay.level.box code, e.g. B.3.H.1"
        )
        assert _on_file(db, "3PLP") is None

    @pytest.mark.parametrize(
        "code, said",
        [
            ("Q.1.A.1", "there is no aisle Q (aisles E, D, C, B, A)"),
            ("B.11.A.1", "there is no bay 11 (bays 1 to 10)"),
            ("B.1.M.1", "there is no level M (levels A to L)"),
            ("B.1.A.7", "there is no box 7 on a level (boxes 1 to 6)"),
        ],
    )
    def test_a_code_for_a_box_the_racking_has_not_got_says_which_part(
        self, client, db, item, code, said
    ):
        _add(client)
        r = _change(client, primary_bin_1=code)
        assert r.status_code == 400
        assert r.json()["detail"] == (
            f"Primary bin 1 '{code}' is not in the racking at HQ: {said}"
        )
        assert _on_file(db).primary_bin_1 is None

    def test_the_second_bin_is_checked_and_named_too(self, client, item):
        r = _add(client, primary_bin_1="B.3.H.1", primary_bin_2="overflow shelf")
        assert r.status_code == 400
        assert r.json()["detail"].startswith("Primary bin 2 'overflow shelf' is not")

    def test_a_real_box_is_saved_under_its_plain_spelling(self, client, db, item):
        r = _add(client, primary_bin_1=" b.03.h.01 ", primary_bin_2="B.4.A.2")
        assert r.status_code == 200
        assert r.json()["primary_bin_1"] == "B.3.H.1"
        assert _on_file(db).primary_bin_1 == "B.3.H.1"
        assert _change(client, primary_bin_2="e.10.l.6").json()["primary_bin_2"] == (
            "E.10.L.6"
        )

    def test_no_bin_is_still_no_bin(self, client, db, item):
        assert _add(client, primary_bin_1="B.3.H.1").status_code == 200
        assert _change(client, primary_bin_1=None).status_code == 200
        assert _on_file(db).primary_bin_1 is None
        assert _change(client, primary_bin_1="B.3.H.1").status_code == 200
        assert _change(client, primary_bin_1="   ").status_code == 200
        assert _on_file(db).primary_bin_1 is None


@pytest.mark.integration
class TestTheRackingIsTheBranchsOwn:
    def _layout(self, db, branch, **layout):
        value = {
            "version": 1,
            "aisles": ["A"],
            "baysPerAisle": 2,
            "beams": [2],
            "excessShelf": False,
            "positions": 3,
            "oddSide": "right",
            **layout,
        }
        db.add(AdminSetting(key=f"warehouse_layout:{branch}", value=json.dumps(value)))
        db.commit()

    def test_a_branch_with_its_own_layout_is_checked_against_that(
        self, client, db, item
    ):
        self._layout(db, "MELB")
        r = _add(client, branch="MELB", primary_bin_1="B.3.H.1")
        assert r.status_code == 400
        assert r.json()["detail"] == (
            "Primary bin 1 'B.3.H.1' is not in the racking at MELB: "
            "there is no aisle B (aisles A)"
        )
        assert _add(client, branch="MELB", primary_bin_1="A.2.B.3").status_code == 200
        # HQ still has the default racking.
        assert _add(client, primary_bin_1="B.3.H.1").status_code == 200

    def test_a_saved_layout_the_map_would_not_draw_is_not_used(self, client, db, item):
        self._layout(db, "HQ", baysPerAisle=0)
        assert _add(client, primary_bin_1="B.3.H.1").status_code == 200

    def test_put_away_is_held_to_the_racking_as_well(self, client, db, item):
        self._layout(db, "MELB")
        body = {"branch": "MELB", "sku": SKU, "slot": "primary"}
        r = client.post("/inventory/bin-map/put-away", json={**body, "bin": "B.3.H.1"})
        assert r.status_code == 400
        assert r.json()["detail"] == (
            "'B.3.H.1' is not in the racking at MELB: there is no aisle B (aisles A)"
        )
        assert _on_file(db, "MELB") is None
        r = client.post("/inventory/bin-map/put-away", json={**body, "bin": "A.1.A.1"})
        assert r.status_code == 200


@pytest.mark.integration
class TestCodesFromBeforeTheCheck:
    def test_an_old_bin_sent_back_as_it_stands_does_not_block_the_row(
        self, client, db, item
    ):
        _legacy(db, primary_bin_1="A-01-04")
        r = _change(client, zone="Front", primary_bin_1="A-01-04", max_qty_bin_1=40)
        assert r.status_code == 200
        on_file = _on_file(db)
        assert (on_file.zone, on_file.primary_bin_1, on_file.max_qty_bin_1) == (
            "Front",
            "A-01-04",
            40,
        )

    def test_it_cannot_be_changed_to_another_that_is_not_a_box(self, client, db, item):
        _legacy(db, primary_bin_1="A-01-04")
        assert _change(client, primary_bin_1="A-01-05").status_code == 400
        assert _on_file(db).primary_bin_1 == "A-01-04"

    def test_it_can_be_re_slotted_to_a_real_box_or_emptied(self, client, db, item):
        _legacy(db, primary_bin_1="A-01-04", primary_bin_2="RECV")
        assert _change(client, primary_bin_1="A.1.D.4").status_code == 200
        assert _change(client, primary_bin_2=None).status_code == 200
        on_file = _on_file(db)
        assert (on_file.primary_bin_1, on_file.primary_bin_2) == ("A.1.D.4", None)

    def test_a_box_the_racking_no_longer_has_stays_until_it_is_changed(
        self, client, db, item
    ):
        _legacy(db, primary_bin_1="B.44.A.1")
        assert _change(client, primary_bin_1="b.44.a.1", zone="Back").status_code == 200
        assert _on_file(db).primary_bin_1 == "B.44.A.1"
        assert _change(client, primary_bin_1="B.45.A.1").status_code == 400


@pytest.mark.integration
class TestTwoBinsAreTwoBoxes:
    def test_one_box_cannot_be_given_as_both(self, client, db, item):
        r = _add(client, primary_bin_1="B.3.H.1", primary_bin_2="b.03.h.01")
        assert r.status_code == 400
        assert r.json()["detail"] == (
            "Primary bin 2 is the same box as primary bin 1 (B.3.H.1). "
            "A position's two bins are two different boxes."
        )
        assert _on_file(db) is None

    def test_nor_set_to_the_box_the_other_already_is(self, client, db, item):
        assert _add(client, primary_bin_1="B.3.H.1").status_code == 200
        assert _change(client, primary_bin_2="B.3.H.1").status_code == 400
        assert _on_file(db).primary_bin_2 is None
        assert _change(client, primary_bin_2="B.3.H.2").status_code == 200
        assert _change(client, primary_bin_1="B.3.H.2").status_code == 400
        # Other fields can still be saved on a row whose bins are fine.
        assert _change(client, zone="Front").status_code == 200


@pytest.mark.integration
class TestTheOtherAttributesOfAPosition:
    def test_a_position_is_only_opened_at_a_real_branch(self, client, db, item):
        r = _add(client, branch="Sydney")
        assert r.status_code == 400
        assert r.json()["detail"] == "Unknown branch: Sydney"
        assert db.query(StockLocation).count() == 0

    def test_the_branch_is_tidied_the_way_every_stock_screen_tidies_it(
        self, client, db, item
    ):
        assert _add(client, branch=" melb ").json()["branch"] == "MELB"
        assert _add(client, branch="MELB").status_code == 409

    @pytest.mark.parametrize("capacity", [-1, 100_001, 2.5, "lots"])
    def test_a_capacity_is_a_whole_number_a_bin_could_hold(
        self, client, db, item, capacity
    ):
        _add(client, primary_bin_1="B.3.H.1")
        assert _change(client, max_qty_bin_1=capacity).status_code == 422
        assert _change(client, max_qty_bin_2=capacity).status_code == 422
        assert _on_file(db).max_qty_bin_1 is None

    def test_the_largest_capacity_and_none_are_both_fine(self, client, db, item):
        _add(client, primary_bin_1="B.3.H.1", max_qty_bin_1=100_000)
        assert _on_file(db).max_qty_bin_1 == 100_000
        assert _change(client, max_qty_bin_1=None).status_code == 200
        assert _on_file(db).max_qty_bin_1 is None

    def test_text_longer_than_its_column_is_refused_not_stored(self, client, db, item):
        _add(client)
        assert _change(client, zone="Z" * 21).status_code == 422
        assert _change(client, primary_bin_1="B" * 51).status_code == 422
        assert _add(client, branch="B" * 51).status_code == 422

    def test_a_zone_is_stored_trimmed_and_blank_is_none(self, client, db, item):
        _add(client, zone="  Front  ")
        assert _on_file(db).zone == "Front"
        assert _change(client, zone="   ").status_code == 200
        assert _on_file(db).zone is None


@pytest.mark.integration
class TestARowWhoseBinsWereAlreadyOneBox:
    """From before two bins had to be two boxes. Left as they stand, the rest
    of the row can still be saved; it is changing a bin that is judged."""

    @pytest.mark.parametrize(
        "first, second", [("B.3.H.1", "b.03.h.01"), ("dasdas", "dasdas")]
    )
    def test_its_other_fields_can_be_saved_with_both_sent_back(
        self, client, db, item, first, second
    ):
        _legacy(db, primary_bin_1=first, primary_bin_2=second)
        r = _change(
            client,
            zone="Front",
            primary_bin_1=first,
            primary_bin_2=second,
            max_qty_bin_1=5,
        )
        assert r.status_code == 200, r.text
        on_file = _on_file(db)
        assert (on_file.zone, on_file.max_qty_bin_1) == ("Front", 5)
        assert _change(client, zone="Back").status_code == 200

    def test_but_a_bin_changed_on_to_the_other_is_still_refused(self, client, db, item):
        _legacy(db, primary_bin_1="B.3.H.1", primary_bin_2="B.3.H.2")
        assert _change(client, primary_bin_2="B.3.H.1").status_code == 400
        assert (
            _change(
                client, primary_bin_1="B.3.H.2", primary_bin_2="B.3.H.2"
            ).status_code
            == 400
        )
        assert _on_file(db).primary_bin_2 == "B.3.H.2"


@pytest.mark.integration
class TestWhatCountsAsTheBinOnFile:
    def test_an_old_code_with_bay_nought_is_text_so_retyped_it_is_another_text(
        self, client, db, item
    ):
        """`A.0.B.1` is not a box (bays start at 1), so it is compared as it is
        written; the screen compares it the same way."""
        _legacy(db, primary_bin_1="A.0.B.1")
        assert _change(client, primary_bin_1="a.0.b.1", zone="Z").status_code == 200
        assert _change(client, primary_bin_1="a.00.b.01").status_code == 400

    def test_a_code_is_tidied_exactly_as_the_screen_tidies_it(self, client, db, item):
        _add(client)
        # A byte-order mark pasted with a code is space to the screen, and here.
        assert _change(client, primary_bin_1="\ufeffB.3.H.1\u00a0").status_code == 200
        assert _on_file(db).primary_bin_1 == "B.3.H.1"
        # A control character is not space to the screen, so nor here.
        r = _change(client, primary_bin_2="B.3.H.2\x1f")
        assert r.status_code == 400
        assert _on_file(db).primary_bin_2 is None


@pytest.mark.integration
class TestTheRulesHoldOnEveryPath:
    def test_a_change_is_judged_against_the_racking_of_its_own_branch(
        self, client, db, item
    ):
        small = {
            "version": 1,
            "aisles": ["A"],
            "baysPerAisle": 2,
            "beams": [2],
            "excessShelf": False,
            "positions": 3,
            "oddSide": "right",
        }
        db.add(AdminSetting(key="warehouse_layout:MELB", value=json.dumps(small)))
        db.commit()
        assert _add(client, branch="MELB").status_code == 200
        r = _change(client, "MELB", primary_bin_1="B.3.H.1")
        assert r.status_code == 400
        assert "is not in the racking at MELB" in r.json()["detail"]
        assert _change(client, "MELB", primary_bin_1="A.2.B.3").status_code == 200

    @pytest.mark.parametrize(
        "field, value",
        [
            ("max_qty_bin_1", -1),
            ("max_qty_bin_1", 100_001),
            ("max_qty_bin_2", -1),
            ("max_qty_bin_2", 100_001),
            ("zone", "Z" * 21),
            ("primary_bin_1", "B" * 51),
            ("primary_bin_2", "B" * 51),
        ],
    )
    def test_a_new_position_is_held_to_the_same_bounds_as_a_changed_one(
        self, client, db, item, field, value
    ):
        assert _add(client, **{field: value}).status_code == 422
        assert _on_file(db) is None

"""What needs buying is one rule, and it counts what is already coming.

The predicate was written out seven times and gave two different answers — five
backend sites compared on-hand against the minimum, but the stock list omitted
the `min_stock > 0` guard the others carried, and the frontend split between
`<` and `<=`. The same SKU could read as low on one screen and fine on the next.

All of them also asked the wrong question. Blanks bought in cartons on four to
six week lead times spend ordinary weeks under the minimum while fully covered
by an order placed a fortnight ago, and every one of those screamed.
"""

import pytest
from app.core.replenishment import replenishment_rows
from app.models.job import Job, JobItem
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem


def _po(db, po_id, sku, ordered, received=0, status="Sent"):
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


def _job(db, job_id, sku, qty, status="ORDER"):
    db.add(
        Job(
            id=job_id,
            customer_id="C-R",
            customer_name="Cust",
            status=status,
            branch="HQ",
            date_in="2026-08-01",
            invoice="INV-R",
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


def _row(db, sku):
    return next((r for r in replenishment_rows(db) if r["sku"] == sku), None)


@pytest.mark.integration
class TestWhatIsAlreadyComingCounts:
    def test_an_item_covered_by_an_order_is_not_short(self, client, db, make_inventory):
        """The noise this removes: a blank below its minimum for the four weeks
        its replacement is in transit."""
        make_inventory(sku="RP1", stock=8, min_stock=50)
        _po(db, "PO-RP1", "RP1", 100)

        assert _row(db, "RP1") is None

    def test_an_item_with_nothing_coming_is_short(self, client, db, make_inventory):
        make_inventory(sku="RP2", stock=8, min_stock=50)
        row = _row(db, "RP2")
        assert row is not None
        assert (row["stock"], row["on_order"], row["projected"]) == (8, 0, 8)
        assert row["shortfall"] == 42

    def test_a_part_delivered_order_covers_only_what_is_left(
        self, client, db, make_inventory
    ):
        make_inventory(sku="RP3", stock=10, min_stock=50)
        _po(db, "PO-RP3", "RP3", 100, received=95)  # 5 still to come

        row = _row(db, "RP3")
        assert row["on_order"] == 5 and row["projected"] == 15

    def test_a_draft_order_does_not_count_as_coming(self, client, db, make_inventory):
        """A draft has not been sent, so nothing is on its way. Counting it would
        let a forgotten draft suppress the alert indefinitely — a quieter
        failure than the noise it fixes."""
        make_inventory(sku="RP4", stock=5, min_stock=50)
        _po(db, "PO-RP4", "RP4", 100, status="Draft")

        row = _row(db, "RP4")
        assert row is not None, "an unsent draft is not incoming stock"
        assert row["on_order"] == 0


@pytest.mark.integration
class TestWhatIsPromisedCounts:
    def test_stock_reserved_for_a_job_does_not_cover_the_minimum(
        self, client, db, make_inventory
    ):
        make_inventory(sku="RP5", stock=60, min_stock=50)
        _job(db, "J-RP5", "RP5", 40)

        row = _row(db, "RP5")
        assert row is not None, "60 on hand, but 40 of it is spoken for"
        assert (row["committed"], row["projected"]) == (40, 20)


@pytest.mark.integration
class TestOneAnswerEverywhere:
    def test_an_item_with_no_minimum_is_not_managed_by_this_rule(
        self, client, db, make_inventory
    ):
        """Regression: the stock list omitted this guard, so every zero-stock
        item with no threshold read as low there and nowhere else."""
        make_inventory(sku="RP6", stock=0, min_stock=0)
        assert _row(db, "RP6") is None

        rows = client.get("/inventory?low_stock=true").json()
        assert "RP6" not in [r["sku"] for r in rows]

    def test_the_list_filter_and_the_alert_agree(self, client, db, make_inventory):
        make_inventory(sku="RP7", stock=2, min_stock=20)
        make_inventory(sku="RP8", stock=99, min_stock=20)

        listed = {r["sku"] for r in client.get("/inventory?low_stock=true").json()}
        alerted = {r["sku"] for r in client.get("/inventory/low-stock").json()["rows"]}
        assert "RP7" in listed and "RP7" in alerted
        assert "RP8" not in listed and "RP8" not in alerted

    def test_the_alert_shows_its_working(self, client, db, make_inventory):
        """A quieter list is only trustworthy if you can see why something is
        missing from it."""
        make_inventory(sku="RP9", stock=4, min_stock=30)
        row = next(
            r
            for r in client.get("/inventory/low-stock").json()["rows"]
            if r["sku"] == "RP9"
        )
        for field in ("stock", "on_order", "committed", "projected", "shortfall"):
            assert field in row


@pytest.mark.integration
class TestSuggestedQuantity:
    def test_the_shortfall_rounds_up_to_a_buying_multiple(
        self, client, db, make_inventory
    ):
        """`reorder_qty` is how much we buy in. Ordering the bare shortfall would
        mean ordering three of something that only ships in tens."""
        make_inventory(sku="RPA", stock=8, min_stock=30, reorder_qty=25)
        row = _row(db, "RPA")
        assert row["shortfall"] == 22
        assert row["suggested_qty"] == 25

    def test_without_a_buying_multiple_it_suggests_the_shortfall(
        self, client, db, make_inventory
    ):
        make_inventory(sku="RPB", stock=8, min_stock=30, reorder_qty=0)
        assert _row(db, "RPB")["suggested_qty"] == 22


@pytest.mark.integration
class TestAutoReorderUsesTheSameRule:
    def test_running_it_twice_does_not_reorder_what_is_now_covered(
        self, client, db, make_inventory
    ):
        """The concrete cost of ignoring on-order: a second draft PO raised
        against a real supplier for stock already on its way."""
        make_inventory(sku="RPC", stock=2, min_stock=40, reorder_qty=50)

        first = client.post("/inventory/auto-reorder").json()
        assert first["created"] >= 1

        db.expire_all()
        # The drafts it just raised are not "coming" — a draft is not sent — so
        # the second run would still flag it. Send them, and it should not.
        for po in db.query(PurchaseOrder).all():
            po.status = "Sent"
        db.commit()

        second = client.post("/inventory/auto-reorder").json()
        assert second["created"] == 0

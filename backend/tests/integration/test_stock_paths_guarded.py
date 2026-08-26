"""Every path that changes a job's status must run the same stock side effects.

Three paths used to do it themselves and disagreed. `PATCH /jobs/{id}` applied
the status through a bare setattr loop and ran no stock effects at all; unprint
dropped a PAID job into FINISH — a committed status — without re-reserving;
and depletion was one-way, so a job moved back out of INVOICE kept its stock
written off. `POST /purchase-orders/{id}/receive`
separately moved the item total without touching the per-location ledger.
"""

import pytest
from app.core.stock_location import adjust_location, location_summary
from app.models.inventory import InventoryItem
from app.models.job import Job, JobItem
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.stock_location import StockLocation


def _job(db, job_id, sku, qty, status="QUOTE", branch="HQ"):
    db.add(
        Job(
            id=job_id,
            customer_id="C-SP",
            customer_name="Cust",
            status=status,
            branch=branch,
            date_in="2026-08-01",
            invoice="INV-1",
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


def _place(db, sku, qty, branch="HQ"):
    """Put the fixture's stock away, so the item starts reconciled by branch.

    `make_inventory` sets a total with no location, which is a legitimate legacy
    state but means `in_sync` is False from the outset — useless as a baseline.
    """
    adjust_location(db, sku, branch, on_hand=qty)
    db.commit()


def _inv(db, sku):
    return db.query(InventoryItem).filter_by(sku=sku).one()


def _loc(db, sku, branch="HQ"):
    return db.query(StockLocation).filter_by(sku=sku, branch=branch).first()


@pytest.mark.integration
class TestPatchRunsStockEffects:
    def test_patching_status_to_order_reserves_stock(self, client, db, make_inventory):
        """Regression: PATCH applied status via setattr and reserved nothing."""
        make_inventory(sku="SP1", stock=50)
        _job(db, "J-SP1", "SP1", 12)

        r = client.patch("/jobs/J-SP1", json={"status": "ORDER"})
        assert r.status_code == 200

        db.expire_all()
        assert _inv(db, "SP1").committed_qty == 12
        assert _loc(db, "SP1").committed_qty == 12

    def test_patch_reserves_the_lines_it_was_sent_not_the_old_ones(
        self, client, db, make_inventory
    ):
        """Lines are replaced in the same request, so the reservation must follow
        the new ones — reserving before the swap would commit the old quantity."""
        make_inventory(sku="SP2", stock=50)
        _job(db, "J-SP2", "SP2", 5)

        r = client.patch(
            "/jobs/J-SP2",
            json={
                "status": "ORDER",
                "items": [
                    {
                        "display_type": "product",
                        "stock_code": "SP2",
                        "description": "x",
                        "order_qty": 20,
                        "qty": 20,
                        "supply_qty": 20,
                    }
                ],
            },
        )
        assert r.status_code == 200

        db.expire_all()
        assert _inv(db, "SP2").committed_qty == 20

    def test_patching_other_fields_leaves_stock_alone(self, client, db, make_inventory):
        make_inventory(sku="SP3", stock=50)
        _job(db, "J-SP3", "SP3", 7, status="ORDER")
        before = _inv(db, "SP3").committed_qty

        assert (
            client.patch("/jobs/J-SP3", json={"po_number": "PO-9"}).status_code == 200
        )

        db.expire_all()
        assert _inv(db, "SP3").committed_qty == before


@pytest.mark.integration
class TestUnprintRecommits:
    def test_unprinting_a_paid_job_reserves_its_stock_again(
        self, client, db, make_inventory
    ):
        """PAID is not a committed status, FINISH is — coming back has to reserve."""
        make_inventory(sku="SP4", stock=100)
        _job(db, "J-SP4", "SP4", 9, status="PAID")

        assert client.post("/jobs/J-SP4/unprint").status_code == 200

        db.expire_all()
        job = db.query(Job).filter_by(id="J-SP4").one()
        assert job.status == "FINISH"
        assert _inv(db, "SP4").committed_qty == 9

    def test_unprinting_restores_the_branch_position_too(
        self, client, db, make_inventory
    ):
        """Putting stock back on hand without putting it back in a branch makes
        the Locations tab stop adding up to the item."""
        make_inventory(sku="SP5", stock=40)
        _place(db, "SP5", 40)
        _job(db, "J-SP5", "SP5", 10, status="FINISH")
        client.post("/jobs/J-SP5/status", json={"status": "INVOICE"})
        db.expire_all()
        assert location_summary(db, "SP5")["in_sync"] is True

        assert client.post("/jobs/J-SP5/unprint").status_code == 200
        db.expire_all()
        assert _inv(db, "SP5").stock == 40
        assert location_summary(db, "SP5")["in_sync"] is True


@pytest.mark.integration
class TestDepletionIsReversible:
    def test_leaving_invoice_puts_the_stock_back(self, client, db, make_inventory):
        make_inventory(sku="SP6", stock=60)
        _job(db, "J-SP6", "SP6", 15, status="FINISH")

        client.post("/jobs/J-SP6/status", json={"status": "INVOICE"})
        db.expire_all()
        assert _inv(db, "SP6").stock == 45

        client.post("/jobs/J-SP6/status", json={"status": "FINISH"})
        db.expire_all()
        assert _inv(db, "SP6").stock == 60

    def test_reinvoicing_lands_on_the_same_figure(self, client, db, make_inventory):
        """Restoring on the way out has to leave re-invoicing correct.

        `_deplete_on_hand` skips when a Sale movement already exists, so the old
        one-way behaviour never double-depleted — it just never gave the stock
        back. Now that leaving INVOICE restores (and clears those movements),
        this round trip has to still settle on one depletion, not two.
        """
        make_inventory(sku="SP7", stock=60)
        _place(db, "SP7", 60)
        _job(db, "J-SP7", "SP7", 15, status="FINISH")

        client.post("/jobs/J-SP7/status", json={"status": "INVOICE"})
        client.post("/jobs/J-SP7/status", json={"status": "FINISH"})
        client.post("/jobs/J-SP7/status", json={"status": "INVOICE"})

        db.expire_all()
        assert _inv(db, "SP7").stock == 45
        assert location_summary(db, "SP7")["in_sync"] is True


@pytest.mark.integration
class TestPurchaseOrderReceipt:
    def _po(self, db, po_id, sku, ordered):
        db.add(
            PurchaseOrder(
                id=po_id,
                supplier_id="S1",
                supplier_name="Acme",
                status="Sent",
                order_date="01/08/2026",
            )
        )
        db.add(
            PurchaseOrderItem(
                order_id=po_id, sku=sku, qty_ordered=ordered, qty_received=0
            )
        )
        db.commit()
        return db.query(PurchaseOrderItem).filter_by(order_id=po_id, sku=sku).one().id

    def test_receiving_lands_stock_in_a_branch(self, client, db, make_inventory):
        """Regression: this path moved the item total and never called
        adjust_location, so every receipt grew the unlocated gap."""
        make_inventory(sku="SP8", stock=0)
        item_id = self._po(db, "PO-SP8", "SP8", 30)

        r = client.post(
            "/purchase-orders/PO-SP8/receive",
            json={"items": [{"id": item_id, "qty_received": 30}]},
        )
        assert r.status_code == 200

        db.expire_all()
        assert _inv(db, "SP8").stock == 30
        assert _loc(db, "SP8").qty_on_hand == 30
        assert location_summary(db, "SP8")["in_sync"] is True

    def test_over_receiving_adds_only_what_it_records(self, client, db, make_inventory):
        """Regression: qty_received was clamped to the order but inv.stock was
        not, so 999 against an order of 10 recorded 10 and shelved 999."""
        make_inventory(sku="SP9", stock=0)
        item_id = self._po(db, "PO-SP9", "SP9", 10)

        client.post(
            "/purchase-orders/PO-SP9/receive",
            json={"items": [{"id": item_id, "qty_received": 999}]},
        )

        db.expire_all()
        assert _inv(db, "SP9").stock == 10
        assert location_summary(db, "SP9")["in_sync"] is True

    def test_receiving_twice_does_not_exceed_the_order(
        self, client, db, make_inventory
    ):
        make_inventory(sku="SP10", stock=0)
        item_id = self._po(db, "PO-SP10", "SP10", 10)
        body = {"items": [{"id": item_id, "qty_received": 8}]}

        client.post("/purchase-orders/PO-SP10/receive", json=body)
        client.post("/purchase-orders/PO-SP10/receive", json=body)

        db.expire_all()
        assert _inv(db, "SP10").stock == 10


@pytest.mark.integration
class TestOnOrderIsDerived:
    """`on_order_qty` has no writer, but the list endpoint returns raw ORM rows
    with no response_model, so it reached the client as a constant zero and the
    stock grid rendered it as the "On PO" figure. It is now derived like
    committed_qty is, from the outstanding quantity on open POs."""

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
                order_id=po_id,
                sku=sku,
                qty_ordered=ordered,
                qty_received=received,
            )
        )
        db.commit()

    def _row(self, client, sku):
        return next(r for r in client.get("/inventory").json() if r["sku"] == sku)

    def test_reports_outstanding_quantity_on_open_pos(self, client, db, make_inventory):
        make_inventory(sku="OO1", stock=5)
        self._po(db, "PO-OO1", "OO1", 100, received=40)
        assert self._row(client, "OO1")["on_order_qty"] == 60

    def test_sums_across_open_pos(self, client, db, make_inventory):
        make_inventory(sku="OO2", stock=0)
        self._po(db, "PO-OO2a", "OO2", 30)
        self._po(db, "PO-OO2b", "OO2", 20, received=5)
        assert self._row(client, "OO2")["on_order_qty"] == 45

    def test_ignores_fully_received_and_cancelled_orders(
        self, client, db, make_inventory
    ):
        make_inventory(sku="OO3", stock=0)
        self._po(db, "PO-OO3a", "OO3", 10, received=10, status="Received")
        self._po(db, "PO-OO3b", "OO3", 25, status="Cancelled")
        assert self._row(client, "OO3")["on_order_qty"] == 0

    def test_zero_when_nothing_is_on_order(self, client, db, make_inventory):
        make_inventory(sku="OO4", stock=3)
        assert self._row(client, "OO4")["on_order_qty"] == 0


@pytest.mark.integration
class TestStocktakeCountsOneShelf:
    """A count is a count of one branch, so its variance must be measured
    against that branch's position — not the company-wide total.

    Differencing against the total and applying the result to a single branch
    destroyed whatever the other branches held. This was invisible to the
    existing tests because they all held an item's stock at a single branch,
    where the total and the position are the same number.
    """

    def test_counting_one_branch_leaves_the_other_alone(
        self, client, db, make_inventory
    ):
        make_inventory(sku="STB1", stock=100)
        _place(db, "STB1", 60, branch="HQ")
        _place(db, "STB1", 40, branch="MELB")

        r = client.post(
            "/inventory/stocktake",
            json={
                "reference": "ST-B1",
                "branch": "MELB",
                "items": [{"sku": "STB1", "counted_qty": 38}],
            },
        )
        assert r.status_code == 200

        db.expire_all()
        assert _loc(db, "STB1", "HQ").qty_on_hand == 60, "HQ was not counted"
        assert _loc(db, "STB1", "MELB").qty_on_hand == 38
        assert _inv(db, "STB1").stock == 98, "only the two missing units are gone"
        assert location_summary(db, "STB1")["in_sync"] is True

    def test_the_reported_variance_is_the_branch_variance(
        self, client, db, make_inventory
    ):
        make_inventory(sku="STB2", stock=100)
        _place(db, "STB2", 60, branch="HQ")
        _place(db, "STB2", 40, branch="MELB")

        body = client.post(
            "/inventory/stocktake",
            json={
                "reference": "ST-B2",
                "branch": "MELB",
                "items": [{"sku": "STB2", "counted_qty": 45}],
            },
        ).json()
        row = body["results"][0]
        assert (row["previous"], row["counted"], row["variance"]) == (40, 45, 5)

    def test_counting_a_branch_holding_nothing_yet(self, client, db, make_inventory):
        """Found stock at a branch with no position — the variance is the count."""
        make_inventory(sku="STB3", stock=20)
        _place(db, "STB3", 20, branch="HQ")

        client.post(
            "/inventory/stocktake",
            json={
                "reference": "ST-B3",
                "branch": "MELB",
                "items": [{"sku": "STB3", "counted_qty": 7}],
            },
        )

        db.expire_all()
        assert _loc(db, "STB3", "MELB").qty_on_hand == 7
        assert _inv(db, "STB3").stock == 27
        assert location_summary(db, "STB3")["in_sync"] is True


@pytest.mark.integration
class TestTransferMovesWhatIsActuallyThere:
    """A transfer takes stock off a branch, so the branch has to have it.

    Checking the company-wide total let a move off a branch holding 3 succeed:
    the source position floored at zero, the destination still gained the full
    quantity, and the branches ended up holding more than the item did.
    """

    def test_moving_more_than_the_source_branch_holds_is_refused(
        self, client, db, make_inventory
    ):
        make_inventory(sku="TB1", stock=60)
        _place(db, "TB1", 3, branch="HQ")
        _place(db, "TB1", 57, branch="Melbourne")

        r = client.post(
            "/inventory/transfer",
            json={
                "from_sku": "TB1",
                "quantity": 10,
                "from_branch": "HQ",
                "to_branch": "Melbourne",
            },
        )
        assert r.status_code == 400
        assert "Only 3 at HQ" in r.json()["detail"]

        db.expire_all()
        assert location_summary(db, "TB1")["in_sync"] is True

    def test_a_move_within_one_branch_changes_nothing(self, client, db, make_inventory):
        make_inventory(sku="TB2", stock=40)
        _place(db, "TB2", 40, branch="HQ")

        r = client.post(
            "/inventory/transfer",
            json={
                "from_sku": "TB2",
                "quantity": 15,
                "from_branch": "HQ",
                "to_branch": "HQ",
            },
        )
        assert r.status_code == 200

        db.expire_all()
        assert _loc(db, "TB2", "HQ").qty_on_hand == 40
        assert location_summary(db, "TB2")["in_sync"] is True

    def test_unlocated_stock_is_placed_at_the_source_then_moved(
        self, client, db, make_inventory
    ):
        """Legacy stock has a total and no position. Refusing to move it would
        block every transfer of anything received before location tracking."""
        make_inventory(sku="TB3", stock=50)  # no position at all

        r = client.post(
            "/inventory/transfer",
            json={
                "from_sku": "TB3",
                "quantity": 20,
                "from_branch": "HQ",
                "to_branch": "Melbourne",
            },
        )
        assert r.status_code == 200

        db.expire_all()
        # Only what was needed is placed. A transfer is a statement about the
        # units moved, not about the whole shelf — unlike a count, which is —
        # so the remaining 30 stay honestly unlocated rather than being claimed
        # for a branch nobody looked at.
        assert _loc(db, "TB3", "HQ").qty_on_hand == 0
        assert _loc(db, "TB3", "Melbourne").qty_on_hand == 20
        assert _inv(db, "TB3").stock == 50, "relocating never changes the total"
        assert location_summary(db, "TB3")["unlocated"] == 30


@pytest.mark.integration
class TestReceivingKeepsShelfAndOrderInStep:
    """The two receiving paths must never leave the shelf and the order
    disagreeing.

    Accepting a goods receipt posted the movement unconditionally while
    clamping the order line at the quantity ordered, so a supplier who
    over-delivered left the shelf holding more than the PO ever admitted, and
    nothing flagged it. The receipt is a reviewed document, so it now records
    what actually arrived on both sides — an over-delivery is visible rather
    than truncated.

    The inline PO receive keeps its clamp deliberately: it is a quantity typed
    straight into a button with no review step, so refusing to shelve more than
    was ordered is a guard against a fat-fingered 999, not an accounting rule.
    """

    def _po(self, db, po_id, sku, ordered):
        db.add(
            PurchaseOrder(
                id=po_id,
                supplier_id="S1",
                supplier_name="Acme",
                status="Sent",
                order_date="01/08/2026",
            )
        )
        db.add(
            PurchaseOrderItem(
                order_id=po_id, sku=sku, qty_ordered=ordered, qty_received=0
            )
        )
        db.commit()

    def _receipt(self, client, po_id, sku, qty, branch="HQ"):
        receipt = client.post(
            "/goods-receipts",
            json={
                "po_id": po_id,
                "supplier_name": "Acme",
                "received_date": "2026-08-15",
                "branch": branch,
                "lines": [
                    {
                        "sku": sku,
                        "qty_expected": qty,
                        "qty_received": qty,
                        "unit_cost": 5,
                    }
                ],
            },
        ).json()
        return client.post(f"/goods-receipts/{receipt['id']}/accept")

    def test_an_over_delivery_is_recorded_on_both_sides(
        self, client, db, make_inventory
    ):
        make_inventory(sku="RC1", stock=0)
        self._po(db, "PO-RC1", "RC1", 10)

        assert self._receipt(client, "PO-RC1", "RC1", 14).status_code == 200

        db.expire_all()
        line = db.query(PurchaseOrderItem).filter_by(order_id="PO-RC1").one()
        assert _inv(db, "RC1").stock == 14, "the shelf holds what arrived"
        assert line.qty_received == 14, "and so does the order — visibly over"
        assert location_summary(db, "RC1")["in_sync"] is True

    def test_receiving_twice_does_not_hide_the_second_delivery(
        self, client, db, make_inventory
    ):
        """The scenario that used to go unflagged: both paths run against the
        same order, and the order quietly stopped counting."""
        make_inventory(sku="RC2", stock=0)
        self._po(db, "PO-RC2", "RC2", 10)
        item_id = db.query(PurchaseOrderItem).filter_by(order_id="PO-RC2").one().id

        client.post(
            "/purchase-orders/PO-RC2/receive",
            json={"items": [{"id": item_id, "qty_received": 10}]},
        )
        self._receipt(client, "PO-RC2", "RC2", 10)

        db.expire_all()
        line = db.query(PurchaseOrderItem).filter_by(order_id="PO-RC2").one()
        assert _inv(db, "RC2").stock == 20
        assert line.qty_received == 20, (
            "the order must show both deliveries — it used to stop at 10 while "
            "the shelf held 20"
        )

    def test_an_over_received_line_has_nothing_outstanding(
        self, client, db, make_inventory
    ):
        make_inventory(sku="RC3", stock=0)
        self._po(db, "PO-RC3", "RC3", 10)
        self._receipt(client, "PO-RC3", "RC3", 12)

        db.expire_all()
        from app.core.reservations import on_order_total

        assert on_order_total(db, "RC3") == 0

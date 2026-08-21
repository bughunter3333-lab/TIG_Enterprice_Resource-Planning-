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

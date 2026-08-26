"""A locked or invoiced job refuses writes.

Both states were decorative. `locked` was written by its own toggle and read
nowhere, so the padlock in the UI promised a protection the server did not
honour; and an invoiced job could be edited as freely as a quote.

Two harms make this more than tidiness. Depletion is idempotent per job — a Sale
movement on the ledger means done — so a line ADDED to an invoiced job never
depletes and the shelf count overstates by that line forever. And the customer's
balance is recalculated only inside a status transition, so editing an invoiced
job's totals leaves their AR disagreeing with the invoice they were sent.
"""

import pytest
from app.core.stock_location import adjust_location
from app.models.inventory import InventoryItem, StockMovement
from app.models.job import Job, JobItem


def _job(db, job_id="J-G", sku="G-SKU", qty=10, status="ORDER", locked=False):
    db.add(
        Job(
            id=job_id,
            customer_id="C-G",
            customer_name="Cust",
            status=status,
            branch="HQ",
            date_in="2026-08-01",
            invoice="INV-G",
            total_inc=100,
            balance_due=100,
            locked=locked,
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
    return job_id


@pytest.mark.integration
class TestLockedJobsRefuseWrites:
    def test_a_locked_job_cannot_be_saved(self, client, db, make_inventory):
        make_inventory(sku="G-SKU", stock=40)
        _job(db, locked=True)

        r = client.patch("/jobs/J-G", json={"description": "edited"})
        assert r.status_code == 409
        assert r.json()["detail"]["error"] == "locked"

        db.expire_all()
        assert db.query(Job).filter_by(id="J-G").one().description != "edited"

    def test_a_locked_job_cannot_be_picked(self, client, db, make_inventory):
        make_inventory(sku="G-SKU", stock=40)
        _job(db, locked=True)
        db.expire_all()
        line = db.query(JobItem).filter_by(job_id="J-G").one()

        r = client.post(
            "/jobs/J-G/pick", json={"picks": [{"item_id": line.id, "qty_pick": 5}]}
        )
        assert r.status_code == 409

    def test_unlocking_restores_the_write(self, client, db, make_inventory):
        make_inventory(sku="G-SKU", stock=40)
        _job(db, locked=True)

        assert client.post("/jobs/J-G/lock", json={"locked": False}).status_code == 200
        assert (
            client.patch("/jobs/J-G", json={"description": "ok now"}).status_code == 200
        )


@pytest.mark.integration
class TestInvoicedJobsRefuseEdits:
    def _invoiced(self, client, db, make_inventory, sku="G-SKU", qty=10):
        make_inventory(sku=sku, stock=40)
        adjust_location(db, sku, "HQ", on_hand=40)
        db.commit()
        _job(db, sku=sku, qty=qty, status="FINISH")
        client.post("/jobs/J-G/status", json={"status": "INVOICE"})

    def test_an_invoiced_job_cannot_be_saved(self, client, db, make_inventory):
        self._invoiced(client, db, make_inventory)

        r = client.patch("/jobs/J-G", json={"total_inc": 9999})
        assert r.status_code == 409
        body = r.json()["detail"]
        assert body["error"] == "settled"
        assert "Unprint" in body["message"]

    def test_a_line_cannot_be_added_after_invoicing(self, client, db, make_inventory):
        """The harm this prevents: depletion is idempotent per job, so a line
        added now would never take its stock off the shelf."""
        self._invoiced(client, db, make_inventory)
        db.expire_all()
        before = db.query(InventoryItem).filter_by(sku="G-SKU").one().stock

        r = client.patch(
            "/jobs/J-G",
            json={
                "items": [
                    {
                        "display_type": "product",
                        "stock_code": "G-SKU",
                        "description": "snuck in",
                        "order_qty": 5,
                        "qty": 5,
                        "supply_qty": 5,
                    }
                ]
            },
        )
        assert r.status_code == 409

        db.expire_all()
        assert db.query(InventoryItem).filter_by(sku="G-SKU").one().stock == before
        assert db.query(JobItem).filter_by(job_id="J-G").count() == 1

    def test_unprinting_is_the_way_back(self, client, db, make_inventory):
        self._invoiced(client, db, make_inventory)

        assert client.post("/jobs/J-G/unprint").status_code == 200
        assert (
            client.patch("/jobs/J-G", json={"description": "now editable"}).status_code
            == 200
        )

    def test_a_payment_can_still_be_recorded(self, client, db, make_inventory):
        """Settled means "do not re-edit the figures", not "do not touch"."""
        self._invoiced(client, db, make_inventory)
        r = client.post("/jobs/J-G/payment", json={"amount": 50, "method": "EFT"})
        assert r.status_code in (200, 201)

    def test_a_comment_can_still_be_added(self, client, db, make_inventory):
        self._invoiced(client, db, make_inventory)
        r = client.post("/jobs/J-G/comments", json={"comment": "chased payment"})
        assert r.status_code in (200, 201)

    def test_a_pick_can_still_be_corrected(self, client, db, make_inventory):
        """Correcting what was picked after the invoice is bookkeeping, not a
        change to what the customer was charged."""
        self._invoiced(client, db, make_inventory)
        db.expire_all()
        line = db.query(JobItem).filter_by(job_id="J-G").one()

        r = client.post(
            "/jobs/J-G/pick", json={"picks": [{"item_id": line.id, "qty_pick": 4}]}
        )
        assert r.status_code == 200


@pytest.mark.integration
class TestDeleteRefusesWhatItCannotUndo:
    def test_a_job_that_moved_stock_cannot_be_deleted(self, client, db, make_inventory):
        """Its movements carry an FK to it with no ON DELETE, so this used to be
        a 500 from the database rather than a refusal anyone could read."""
        make_inventory(sku="G-SKU", stock=40)
        adjust_location(db, "G-SKU", "HQ", on_hand=40)
        db.commit()
        _job(db, status="QUOTE")
        client.post("/jobs/J-G/status", json={"status": "ORDER"})

        r = client.delete("/jobs/J-G")
        assert r.status_code == 409
        assert r.json()["detail"]["error"] == "has_stock_history"
        assert "CANCEL" in r.json()["detail"]["message"]

        db.expire_all()
        assert db.query(Job).filter_by(id="J-G").one() is not None

    def test_cancelling_is_the_supported_exit(self, client, db, make_inventory):
        make_inventory(sku="G-SKU", stock=40)
        adjust_location(db, "G-SKU", "HQ", on_hand=40)
        db.commit()
        _job(db, status="QUOTE")
        client.post("/jobs/J-G/status", json={"status": "ORDER"})

        assert (
            client.post("/jobs/J-G/status", json={"status": "CANCEL"}).status_code
            == 200
        )

        db.expire_all()
        item = db.query(InventoryItem).filter_by(sku="G-SKU").one()
        assert item.committed_qty == 0, "cancelling releases what it reserved"

    def test_a_job_with_no_history_still_deletes(self, client, db, make_inventory):
        make_inventory(sku="G-SKU", stock=40)
        _job(db, status="QUOTE")

        assert client.delete("/jobs/J-G").status_code == 200
        db.expire_all()
        assert db.query(Job).filter_by(id="J-G").first() is None

    def test_deleting_a_locked_job_is_refused(self, client, db, make_inventory):
        make_inventory(sku="G-SKU", stock=40)
        _job(db, status="QUOTE", locked=True)

        assert client.delete("/jobs/J-G").status_code == 409
        db.expire_all()
        assert db.query(Job).filter_by(id="J-G").first() is not None

    def test_no_movement_is_orphaned_by_a_delete(self, client, db, make_inventory):
        """The invariant behind the refusal: nothing points at a job that is gone."""
        make_inventory(sku="G-SKU", stock=40)
        _job(db, status="QUOTE")
        client.delete("/jobs/J-G")

        db.expire_all()
        job_ids = {j.id for j in db.query(Job).all()}
        dangling = [
            m.job_id
            for m in db.query(StockMovement).all()
            if m.job_id and m.job_id not in job_ids
        ]
        assert not dangling

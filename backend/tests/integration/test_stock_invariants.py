"""Run every stock-mutating endpoint through the same invariant harness.

Each endpoint already has tests for its own effect. What none of them checked is
whether the item total, the per-branch positions and the movement ledger still
agree afterwards — which is the only property that all of this codebase's stock
bugs actually violated.

The harness is deliberately applied per-endpoint rather than as one long
scenario: a single sequence would stop at the first failure and hide the rest.
"""

import pytest
from app.core.stock_location import adjust_location
from app.models.job import Job, JobItem
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from tests.helpers.stock_invariants import assert_invariants, snapshot


@pytest.fixture
def stocked(db, make_inventory):
    """An item whose stock is fully placed in a branch — the reconciled baseline."""

    def _make(sku, qty=100, branch="HQ"):
        make_inventory(sku=sku, stock=qty)
        if qty:
            adjust_location(db, sku, branch, on_hand=qty)
        db.commit()
        return snapshot(db, sku)

    return _make


def _job(db, job_id, sku, qty, branch="HQ", status="QUOTE"):
    db.add(
        Job(
            id=job_id,
            customer_id="C-INV",
            customer_name="Cust",
            status=status,
            branch=branch,
            date_in="2026-08-01",
            invoice="INV-X",
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


def _po(db, po_id, sku, ordered, status="Sent"):
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
        PurchaseOrderItem(order_id=po_id, sku=sku, qty_ordered=ordered, qty_received=0)
    )
    db.commit()
    return db.query(PurchaseOrderItem).filter_by(order_id=po_id).one().id


@pytest.mark.integration
class TestReceivingHoldsInvariants:
    def test_goods_receipt_accept(self, client, db, stocked):
        before = stocked("IV1", 10)
        receipt = client.post(
            "/goods-receipts",
            json={
                "supplier_name": "Acme",
                "received_date": "2026-08-15",
                "branch": "HQ",
                "lines": [
                    {
                        "sku": "IV1",
                        "qty_expected": 25,
                        "qty_received": 25,
                        "unit_cost": 4,
                    }
                ],
            },
        ).json()
        client.post(f"/goods-receipts/{receipt['id']}/accept")
        after = assert_invariants(db, "IV1", before, what="accepting a goods receipt")
        assert after.stock == 35

    def test_purchase_order_receive(self, client, db, stocked):
        before = stocked("IV2", 10)
        item_id = _po(db, "PO-IV2", "IV2", 20)
        client.post(
            "/purchase-orders/PO-IV2/receive",
            json={"items": [{"id": item_id, "qty_received": 20}]},
        )
        after = assert_invariants(db, "IV2", before, what="receiving a purchase order")
        assert after.stock == 30


@pytest.mark.integration
class TestAdjustmentsHoldInvariants:
    def test_negative_adjustment(self, client, db, stocked):
        before = stocked("IV3", 50)
        client.post(
            "/inventory/IV3/adjust",
            json={"adjustment": -12, "reason": "Damaged", "branch": "HQ"},
        )
        after = assert_invariants(db, "IV3", before, what="adjusting stock down")
        assert after.stock == 38

    def test_positive_adjustment(self, client, db, stocked):
        before = stocked("IV4", 50)
        client.post(
            "/inventory/IV4/adjust",
            json={"adjustment": 7, "reason": "Found", "branch": "HQ"},
        )
        assert_invariants(db, "IV4", before, what="adjusting stock up")

    def test_stocktake_variance(self, client, db, stocked):
        before = stocked("IV5", 80)
        client.post(
            "/inventory/stocktake",
            json={
                "reference": "ST-IV5",
                "branch": "HQ",
                "items": [{"sku": "IV5", "counted_qty": 74}],
            },
        )
        after = assert_invariants(db, "IV5", before, what="a stocktake variance")
        assert after.stock == 74

    def test_stocktake_on_a_two_branch_item(self, client, db, make_inventory):
        """Every fixture above holds an item at one branch, where the position
        and the total are the same number — so a path that differences against
        the wrong one still reconciles. Splitting the stock is what exposes it."""
        make_inventory(sku="IV5B", stock=90)
        adjust_location(db, "IV5B", "HQ", on_hand=50)
        adjust_location(db, "IV5B", "MELB", on_hand=40)
        db.commit()
        before = snapshot(db, "IV5B")

        client.post(
            "/inventory/stocktake",
            json={
                "reference": "ST-IV5B",
                "branch": "MELB",
                "items": [{"sku": "IV5B", "counted_qty": 36}],
            },
        )

        after = assert_invariants(
            db, "IV5B", before, what="counting one branch of a two-branch item"
        )
        assert after.stock == 86, "four units short at MELB, HQ untouched"


@pytest.mark.integration
class TestTransfersHoldInvariants:
    def test_relocation_between_branches(self, client, db, stocked):
        before = stocked("IV6", 60)
        client.post(
            "/inventory/transfer",
            json={
                "from_sku": "IV6",
                "quantity": 25,
                "from_branch": "HQ",
                "to_branch": "MELB",
            },
        )
        after = assert_invariants(db, "IV6", before, what="a branch relocation")
        assert after.stock == 60, "relocating stock must not change the item total"

    def test_relocation_to_a_bin(self, client, db, stocked):
        before = stocked("IV7", 60)
        client.post(
            "/inventory/transfer",
            json={
                "from_sku": "IV7",
                "quantity": 15,
                "from_branch": "HQ",
                "to_location": "B-02-05",
            },
        )
        assert_invariants(db, "IV7", before, what="a bin relocation")

    def test_cross_sku_transfer_holds_for_both_items(self, client, db, stocked):
        before_from = stocked("IV8", 40)
        before_to = stocked("IV9", 0)
        client.post(
            "/inventory/transfer",
            json={
                "from_sku": "IV8",
                "to_sku": "IV9",
                "quantity": 10,
                "from_branch": "HQ",
            },
        )
        assert_invariants(db, "IV8", before_from, what="a cross-SKU transfer (source)")
        assert_invariants(db, "IV9", before_to, what="a cross-SKU transfer (target)")


@pytest.mark.integration
class TestJobLifecycleHoldsInvariants:
    def test_commit_on_order(self, client, db, stocked):
        before = stocked("IV10", 40)
        _job(db, "J-IV10", "IV10", 9)
        client.post("/jobs/J-IV10/status", json={"status": "ORDER"})
        after = assert_invariants(db, "IV10", before, what="committing a job")
        assert after.committed == 9 and after.stock == 40

    def test_release_back_to_quote(self, client, db, stocked):
        before = stocked("IV11", 40)
        _job(db, "J-IV11", "IV11", 9)
        client.post("/jobs/J-IV11/status", json={"status": "ORDER"})
        client.post("/jobs/J-IV11/status", json={"status": "QUOTE"})
        after = assert_invariants(db, "IV11", before, what="releasing a job")
        assert after.committed == 0

    def test_invoice_depletes(self, client, db, stocked):
        before = stocked("IV12", 40)
        _job(db, "J-IV12", "IV12", 12, status="FINISH")
        client.post("/jobs/J-IV12/status", json={"status": "INVOICE"})
        after = assert_invariants(db, "IV12", before, what="invoicing a job")
        assert after.stock == 28

    def test_unprint_restores(self, client, db, stocked):
        before = stocked("IV13", 40)
        _job(db, "J-IV13", "IV13", 12, status="FINISH")
        client.post("/jobs/J-IV13/status", json={"status": "INVOICE"})
        client.post("/jobs/J-IV13/unprint")
        after = assert_invariants(db, "IV13", before, what="unprinting a job")
        assert after.stock == 40

    def test_patch_status_commits(self, client, db, stocked):
        before = stocked("IV14", 40)
        _job(db, "J-IV14", "IV14", 6)
        client.patch("/jobs/J-IV14", json={"status": "ORDER"})
        after = assert_invariants(db, "IV14", before, what="committing a job via PATCH")
        assert after.committed == 6

    def test_full_lifecycle_quote_to_paid(self, client, db, stocked):
        before = stocked("IV15", 100)
        _job(db, "J-IV15", "IV15", 20)
        for status in ("ORDER", "In Progress", "PRINT", "Pick/Pack", "FINISH"):
            client.post("/jobs/J-IV15/status", json={"status": status})
            assert_invariants(db, "IV15", before, what=f"moving the job to {status}")
        client.post("/jobs/J-IV15/status", json={"status": "INVOICE"})
        client.post("/jobs/J-IV15/status", json={"status": "PAID"})
        after = assert_invariants(db, "IV15", before, what="the full job lifecycle")
        assert after.stock == 80
        assert after.committed == 0, "a paid job no longer reserves anything"

    def test_cancelling_an_order_returns_everything(self, client, db, stocked):
        before = stocked("IV16", 50)
        _job(db, "J-IV16", "IV16", 15)
        client.post("/jobs/J-IV16/status", json={"status": "ORDER"})
        client.post("/jobs/J-IV16/status", json={"status": "CANCEL"})
        after = assert_invariants(db, "IV16", before, what="cancelling an order")
        assert after.stock == 50 and after.committed == 0


@pytest.mark.integration
class TestDispatchHoldsInvariants:
    """Both dispatch paths can advance FINISH -> INVOICE, which depletes stock.

    Each used to hand-roll that move — setting the status, the invoice date and
    calling depletion directly — so each quietly skipped what the status
    endpoint also does on the same transition: invoice_status, and recalculating
    the customer's AR balance.
    """

    def test_dispatching_one_job_with_advance(self, client, db, stocked):
        before = stocked("IV17", 40)
        _job(db, "J-IV17", "IV17", 11, status="FINISH")
        r = client.post(
            "/jobs/J-IV17/dispatch",
            json={"ship_via": "TNT", "ship_ref": "R1", "advance_status": True},
        )
        assert r.status_code == 200
        after = assert_invariants(db, "IV17", before, what="dispatching with advance")
        assert after.stock == 29

        db.expire_all()
        job = db.query(Job).filter_by(id="J-IV17").one()
        assert job.status == "INVOICE"
        assert job.invoice_status == "invoiced"

    def test_dispatch_session_with_advance(self, client, db, stocked):
        before = stocked("IV18", 40)
        _job(db, "J-IV18", "IV18", 7, status="FINISH")
        r = client.post(
            "/dispatch-sessions",
            json={
                "lines": [
                    {
                        "job_id": "J-IV18",
                        "ship_via": "TNT",
                        "ship_ref": "R2",
                        "cartons": 1,
                        "advance_status": True,
                    }
                ]
            },
        )
        assert r.status_code in (200, 201)
        after = assert_invariants(db, "IV18", before, what="a dispatch session")
        assert after.stock == 33

        db.expire_all()
        assert db.query(Job).filter_by(id="J-IV18").one().invoice_status == "invoiced"

    def test_dispatching_without_advance_moves_no_stock(self, client, db, stocked):
        before = stocked("IV19", 40)
        _job(db, "J-IV19", "IV19", 9, status="FINISH")
        client.post(
            "/jobs/J-IV19/dispatch",
            json={"ship_via": "TNT", "ship_ref": "R3", "advance_status": False},
        )
        after = assert_invariants(
            db, "IV19", before, what="dispatching without advance"
        )
        assert after.stock == 40

"""Purchasing: what the second re-check of the simulation still broke.

F18, F29, F25, F17 and F08 — each had a path round its first fix. The
decisions are in docs/superpowers/plans/2026-10-26-simulation-gap-fixes.md,
"Round 2 (2026-10-30)".
"""

import pytest
from reportlab.platypus import Paragraph
from sqlalchemy import event, text

from app.core import job_weight, purchase_order_document, receiving
from app.models.customer import Customer
from app.models.inventory import InventoryItem
from app.models.job import Job, JobItem
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.routers import pdf

pytestmark = pytest.mark.integration

SKU = "PR-POLO"


def _po(db, po_id="PR-1", status="Sent", lines=((10, 0, 10.00),)):
    """A PO of `SKU`, one line per (ordered, received, unit cost)."""
    db.add(
        PurchaseOrder(
            id=po_id,
            supplier_name="Stitch Co",
            status=status,
            items=[
                PurchaseOrderItem(
                    sku=SKU,
                    description="Polo",
                    qty_ordered=ordered,
                    qty_received=received,
                    unit_cost=cost,
                )
                for ordered, received, cost in lines
            ],
        )
    )
    db.commit()
    return db.get(PurchaseOrder, po_id)


@pytest.fixture
def stock(make_inventory):
    return make_inventory(sku=SKU, stock=0, unit_cost=10.00, min_stock=0)


def _create_receipt(client, po_id="PR-1", qty=5):
    return client.post(
        "/goods-receipts",
        json={
            "po_id": po_id,
            "received_date": "2026-10-30",
            "lines": [{"sku": SKU, "qty_received": qty}],
        },
    )


def _receipt(client, po_id="PR-1", qty=5):
    r = _create_receipt(client, po_id, qty)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _quick_receive(client, db, qty, po_id="PR-1"):
    line = db.get(PurchaseOrder, po_id).items[0]
    return client.post(
        f"/purchase-orders/{po_id}/receive",
        json={"items": [{"id": line.id, "qty_received": qty}]},
    )


def _on_hand(db):
    db.expire_all()
    return db.query(InventoryItem).filter_by(sku=SKU).one().stock


def _received(db, po_id="PR-1"):
    db.expire_all()
    return [line.qty_received for line in db.get(PurchaseOrder, po_id).items]


def _status(db, po_id="PR-1"):
    db.expire_all()
    return db.get(PurchaseOrder, po_id).status


def _credit_line(db, qty, po_id="PR-1"):
    db.execute(
        text(
            "UPDATE purchase_order_items SET qty_received = qty_received + :q "
            "WHERE order_id = :po"
        ),
        {"q": qty, "po": po_id},
    )


@pytest.fixture
def rival(db, monkeypatch):
    """A second receive of 5 against the same PO line, beside the request.

    It needs the PO row's lock to credit the line. If the request took the
    lock before crediting, the rival waits and credits once the request has
    committed. If not, it credits the line between the request reading the
    line and writing it back — so both read 0 and both wrote 5 (F18).
    """
    seen = {"locked": False, "waiting": False}

    def record(state):
        stmt = state.statement
        if state.is_select and getattr(stmt, "_for_update_arg", None) is not None:
            entities = [d.get("entity") for d in stmt.column_descriptions]
            seen["locked"] = seen["locked"] or PurchaseOrder in entities

    real = receiving.credit_po_lines

    def credit(po, sku, qty, po_item=None):
        credits = real(po, sku, qty, po_item=po_item)
        if seen["locked"]:
            seen["waiting"] = True
        else:
            _credit_line(db, 5, po.id)
        return credits

    event.listen(db, "do_orm_execute", record)
    monkeypatch.setattr(receiving, "credit_po_lines", credit)
    yield seen
    event.remove(db, "do_orm_execute", record)


def _rival_finishes(db, rival):
    if rival["waiting"]:
        _credit_line(db, 5)
        db.commit()


@pytest.fixture
def locked(db):
    """The entities selected FOR UPDATE while the test runs."""
    seen = []

    def record(state):
        stmt = state.statement
        if state.is_select and getattr(stmt, "_for_update_arg", None) is not None:
            seen.extend(d.get("entity") for d in stmt.column_descriptions)

    event.listen(db, "do_orm_execute", record)
    yield seen
    event.remove(db, "do_orm_execute", record)


# ── F18: a receive credits the line as the last receive left it ─────────────


class TestBothReceivePathsLockThePurchaseOrder:
    def test_the_quick_receive_locks_the_po(self, client, db, stock, locked):
        _po(db)
        assert _quick_receive(client, db, 4).status_code == 200
        assert PurchaseOrder in locked

    def test_accepting_a_receipt_locks_the_po(self, client, db, stock, locked):
        _po(db)
        rid = _receipt(client)
        assert client.post(f"/goods-receipts/{rid}/accept").status_code == 200
        assert PurchaseOrder in locked

    def test_two_quick_receives_of_one_line_both_count(self, client, db, stock, rival):
        _po(db)
        r = _quick_receive(client, db, 5)
        assert r.status_code == 200, r.text
        _rival_finishes(db, rival)
        # 5 and 5 is 10 of 10, not a line that reads 5 with 10 shelved.
        assert _received(db) == [10]

    def test_a_receipt_accepted_beside_another_receive_both_count(
        self, client, db, stock, rival
    ):
        _po(db)
        rid = _receipt(client, qty=5)
        assert client.post(f"/goods-receipts/{rid}/accept").status_code == 200
        _rival_finishes(db, rival)
        assert _received(db) == [10]


# ── F29: a cancelled PO is not received ──────────────────────────────────────


class TestACancelledPurchaseOrderIsNotReceived:
    def test_the_quick_receive_is_refused(self, client, db, stock):
        _po(db, status="Cancelled")
        r = _quick_receive(client, db, 4)
        assert r.status_code == 409, r.text
        assert "PR-1" in r.json()["detail"]
        assert _on_hand(db) == 0
        assert _received(db) == [0]

    def test_a_goods_receipt_against_it_is_refused(self, client, db, stock):
        _po(db, status="Cancelled")
        r = _create_receipt(client)
        assert r.status_code == 409, r.text
        assert "PR-1" in r.json()["detail"]

    def test_a_receipt_raised_before_it_was_cancelled_is_not_accepted(
        self, client, db, stock
    ):
        _po(db)
        rid = _receipt(client)
        r = client.patch("/purchase-orders/PR-1", json={"status": "Cancelled"})
        assert r.status_code == 200, r.text
        r = client.post(f"/goods-receipts/{rid}/accept")
        assert r.status_code == 409, r.text
        assert _on_hand(db) == 0
        assert _received(db) == [0]
        assert _status(db) == "Cancelled"


# ── F25: a short-shipped PO can be closed; a new one starts with nothing ─────


class TestAPartialPurchaseOrderCanBeClosedShort:
    def test_partial_may_be_set_to_received(self, client, db):
        _po(db, status="Partial", lines=((10, 6, 10.00),))
        r = client.patch("/purchase-orders/PR-1", json={"status": "Received"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Received"
        assert r.json()["received_date"]
        # The lines still say what came: 6 of 10.
        assert _received(db) == [6]

    def test_closed_short_it_is_no_longer_committed_spend(self, client, db):
        _po(db, status="Partial", lines=((10, 6, 10.00),))
        before = client.get("/reports/aged-payables").json()
        assert [c["po_id"] for c in before["committed"]] == ["PR-1"]

        client.patch("/purchase-orders/PR-1", json={"status": "Received"})
        after = client.get("/reports/aged-payables").json()
        assert after["committed"] == []
        # What did come is still owed for: 6 x $10 + GST.
        assert [
            (r["po_id"], r["outstanding_inc"]) for r in after["received_not_billed"]
        ] == [("PR-1", 66.0)]

    def test_nothing_received_is_still_not_set_received(self, client, db):
        for status in ("Draft", "Sent"):
            _po(db, f"PR-{status}", status=status)
            r = client.patch(
                f"/purchase-orders/PR-{status}", json={"status": "Received"}
            )
            assert r.status_code == 422, (status, r.text)
            assert _status(db, f"PR-{status}") == status


def _waiting_job(db, po_id="PR-1", b_ord=4):
    """An open order with a line still waiting on `po_id` for `b_ord` units."""
    if not db.get(Customer, "PR-W"):
        db.add(Customer(id="PR-W", name="Wait Co", credit_limit=99999.0))
    db.add(
        Job(
            id="PR-WJ",
            customer_id="PR-W",
            customer_name="Wait Co",
            status="ORDER",
            items=[
                JobItem(
                    stock_code=SKU,
                    description="Polo",
                    display_type="product",
                    order_qty=10,
                    supply_qty=10 - b_ord,
                    b_ord=b_ord,
                    po_no=po_id,
                )
            ],
        )
    )
    db.commit()


def _to_buy(client):
    rows = client.get("/jobs/order-requirements?type=garment").json()
    return [(r["sku"], r["total_b_ord"]) for r in rows]


class TestAJobLineIsNotLeftWaitingOnAClosedPurchaseOrder:
    """A short-shipped PO closed as Received, or a PO cancelled, left its job
    lines pointing at it. The buying list skips a line that has a PO, so the
    sizes that never came were never suggested for buying again."""

    def test_closing_short_puts_the_missing_units_back_to_buy(self, client, db):
        _po(db, status="Partial", lines=((10, 6, 10.00),))
        _waiting_job(db, b_ord=4)
        assert _to_buy(client) == []

        client.patch("/purchase-orders/PR-1", json={"status": "Received"})
        assert _to_buy(client) == [(SKU, 4)]

    def test_cancelling_puts_the_lines_back_to_buy(self, client, db):
        _po(db, status="Sent")
        _waiting_job(db, b_ord=10)
        assert _to_buy(client) == []

        r = client.patch("/purchase-orders/PR-1", json={"status": "Cancelled"})
        assert r.status_code == 200, r.text
        assert _to_buy(client) == [(SKU, 10)]

    def test_a_line_that_got_everything_keeps_its_purchase_order(self, client, db):
        _po(db, status="Partial", lines=((10, 6, 10.00),))
        _waiting_job(db, b_ord=0)
        client.patch("/purchase-orders/PR-1", json={"status": "Received"})
        line = db.query(JobItem).filter(JobItem.job_id == "PR-WJ").one()
        db.refresh(line)
        assert line.po_no == "PR-1"


class TestANewPurchaseOrderStartsWithNothingReceived:
    @pytest.fixture(autouse=True)
    def supplier(self, make_supplier):
        return make_supplier(id="SUP001")

    @staticmethod
    def _create(client, status="Draft", qty_received=0):
        return client.post(
            "/purchase-orders",
            json={
                "id": "PR-NEW",
                "supplier_id": "SUP001",
                "status": status,
                "items": [
                    {
                        "sku": SKU,
                        "qty_ordered": 4,
                        "qty_received": qty_received,
                        "unit_cost": 11.0,
                    }
                ],
            },
        )

    @pytest.mark.parametrize("status", ["Partial", "Received", "Cancelled"])
    def test_it_is_not_created_in_a_later_status(self, client, db, status):
        r = self._create(client, status=status)
        assert r.status_code == 422, r.text
        assert db.get(PurchaseOrder, "PR-NEW") is None

    def test_it_is_not_created_with_goods_received(self, client, db):
        r = self._create(client, status="Sent", qty_received=4)
        assert r.status_code == 422, r.text
        assert db.get(PurchaseOrder, "PR-NEW") is None

    @pytest.mark.parametrize("status", ["Draft", "Sent"])
    def test_draft_or_sent_with_nothing_received_is_created(self, client, db, status):
        r = self._create(client, status=status)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == status
        assert [i["qty_received"] for i in r.json()["items"]] == [0]


# ── F17: a cancelled PO prints as cancelled ──────────────────────────────────


class TestTheDocumentOfACancelledPurchaseOrder:
    @staticmethod
    def _printed(client, monkeypatch, po_id):
        printed = []
        real = purchase_order_document._p

        def spy(text, *style):
            printed.append(str(text))
            return real(text, *style)

        monkeypatch.setattr(purchase_order_document, "_p", spy)
        assert client.get(f"/purchase-orders/{po_id}/pdf").status_code == 200
        return " ".join(printed)

    def test_it_says_cancelled(self, client, db, monkeypatch):
        _po(db, status="Cancelled")
        assert "CANCELLED" in self._printed(client, monkeypatch, "PR-1")

    def test_a_live_one_does_not(self, client, db, monkeypatch):
        _po(db, status="Sent")
        assert "CANCELLED" not in self._printed(client, monkeypatch, "PR-1")


# ── F08: the picking slip weighs the job as it prints ────────────────────────


def _job(db, job_id, items, weight_total=0):
    if not db.get(Customer, "PR-C"):
        db.add(Customer(id="PR-C", name="Weigh Co", credit_limit=99999.0))
    db.add(
        Job(
            id=job_id,
            customer_id="PR-C",
            customer_name="Weigh Co",
            status="ORDER",
            weight_total=weight_total,
            items=items,
        )
    )
    db.commit()
    return db.get(Job, job_id)


def _slip_text(client, monkeypatch, job_id):
    printed = []

    def spy(text, *args, **kwargs):
        printed.append(str(text))
        return Paragraph(text, *args, **kwargs)

    monkeypatch.setattr(pdf, "Paragraph", spy)
    r = client.get(f"/jobs/{job_id}/pdf?type=picking-slip")
    assert r.status_code == 200, r.text
    return " ".join(printed)


class TestThePickingSlipWeighsTheJobAsItPrints:
    def test_a_weight_entered_since_the_job_was_saved_is_printed(
        self, client, db, make_inventory, monkeypatch
    ):
        # Weighed at 0 when it was saved; the polo's weight was entered after.
        make_inventory(sku=SKU, stock=10, weight_kg=0.25)
        _job(
            db,
            "PR-J1",
            [
                JobItem(
                    sort=0, display_type="product", stock_code=SKU, order_qty=4, qty=4
                )
            ],
        )
        assert "Order Weight: 1.00 kg" in _slip_text(client, monkeypatch, "PR-J1")

    def test_a_stale_stored_weight_is_not_printed(
        self, client, db, make_inventory, monkeypatch
    ):
        make_inventory(sku=SKU, stock=10, weight_kg=0.25)
        _job(
            db,
            "PR-J2",
            [
                JobItem(
                    sort=0, display_type="product", stock_code=SKU, order_qty=4, qty=4
                )
            ],
            weight_total=9.5,
        )
        printed = _slip_text(client, monkeypatch, "PR-J2")
        assert "Order Weight: 1.00 kg" in printed
        assert "9.50" not in printed


class TestAGoodsLineWithNoStockCodeIsUnweighed:
    def _vest_job(self, db, job_id="PR-J3"):
        return _job(
            db,
            job_id,
            [
                JobItem(
                    sort=0,
                    display_type="product",
                    description="Hi-vis vest",
                    order_qty=4,
                    b_ord=4,
                ),
                # A note carries no quantity, and is nothing to weigh.
                JobItem(sort=1, display_type="note", description="Rear dock"),
            ],
        )

    def test_it_is_named_as_having_no_weight(self, db):
        job = self._vest_job(db)
        assert job_weight.unweighed_lines(job, db) == ["Hi-vis vest"]
        assert job_weight.order_weight(job, db) == 0

    def test_it_weighs_its_own_weight_when_it_has_one(self, db):
        job = _job(
            db,
            "PR-J4",
            [
                JobItem(
                    sort=0,
                    display_type="product",
                    description="Hi-vis vest",
                    order_qty=4,
                    weight_kg=0.2,
                )
            ],
        )
        assert job_weight.unweighed_lines(job, db) == []
        assert job_weight.order_weight(job, db) == 0.8

    def test_the_picking_slip_flags_it(self, client, db, monkeypatch):
        self._vest_job(db)
        printed = _slip_text(client, monkeypatch, "PR-J3")
        assert "1 item(s) have 0 weight: Hi-vis vest" in printed

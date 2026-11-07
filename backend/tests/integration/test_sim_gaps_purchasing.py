"""Receiving and purchase orders: the gaps the re-check of the simulation found.

F03, F15, F17, F18 and F29 — each was fixed on its main path, and each still
had a second path that brought the old fault back. The decisions are in
docs/superpowers/plans/2026-10-26-simulation-gap-fixes.md.
"""

import pytest
from sqlalchemy import event, text

from app.core import purchase_order_document
from app.models.goods_receipt import GoodsReceipt
from app.models.inventory import InventoryItem
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.settings import CompanySettings
from app.routers import email_router

pytestmark = pytest.mark.integration

SKU = "PG-POLO"


def _po(db, po_id="PG-1", status="Sent", lines=((10, 0, 15.55),), **header):
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
            **header,
        )
    )
    db.commit()
    return db.get(PurchaseOrder, po_id)


@pytest.fixture
def stock(make_inventory):
    return make_inventory(sku=SKU, stock=0, unit_cost=15.55, min_stock=0)


def _receipt(client, po_id="PG-1", qty=10):
    r = client.post(
        "/goods-receipts",
        json={
            "po_id": po_id,
            "received_date": "2026-10-27",
            "lines": [{"sku": SKU, "qty_received": qty}],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _on_hand(db):
    db.expire_all()
    return db.query(InventoryItem).filter_by(sku=SKU).one().stock


def _received(db, po_id="PG-1"):
    db.expire_all()
    return [line.qty_received for line in db.get(PurchaseOrder, po_id).items]


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


class _Server:
    """Stands in for smtplib.SMTP and keeps what was sent."""

    sent = []

    def __init__(self, host, port, timeout):
        pass

    def starttls(self):
        pass

    def login(self, user, password):
        pass

    def sendmail(self, sender, recipients, message):
        _Server.sent.append(recipients)

    def quit(self):
        pass


@pytest.fixture
def mail(db, monkeypatch):
    _Server.sent = []
    monkeypatch.setattr(email_router.smtplib, "SMTP", _Server)
    settings = db.query(CompanySettings).first()
    settings.smtp_host = "smtp.tig-mail.com"
    settings.smtp_port = 587
    settings.smtp_user = "orders@tig-mail.com"
    db.commit()
    return _Server


# ── F03: an accepted receipt is final ────────────────────────────────────────


class TestAnAcceptedReceiptIsFinal:
    def test_it_cannot_be_put_back_to_pending_and_shelved_twice(
        self, client, db, stock
    ):
        _po(db)
        rid = _receipt(client)
        assert client.post(f"/goods-receipts/{rid}/accept").status_code == 200

        r = client.patch(f"/goods-receipts/{rid}", json={"status": "Pending"})
        assert r.status_code == 409, r.text
        assert client.post(f"/goods-receipts/{rid}/accept").status_code == 409
        assert _on_hand(db) == 10
        assert _received(db) == [10]

    def test_patch_cannot_mark_one_accepted_without_shelving_it(
        self, client, db, stock
    ):
        _po(db)
        rid = _receipt(client)
        r = client.patch(f"/goods-receipts/{rid}", json={"status": "Accepted"})
        assert r.status_code == 409, r.text
        db.expire_all()
        assert db.get(GoodsReceipt, rid).status == "Pending"
        assert db.get(PurchaseOrder, "PG-1").status == "Sent"

    def test_it_moves_between_pending_inspecting_and_rejected(self, client, db, stock):
        _po(db)
        rid = _receipt(client)
        for status in ("Inspecting", "Rejected", "Pending"):
            r = client.patch(f"/goods-receipts/{rid}", json={"status": status})
            assert r.status_code == 200, r.text
            assert r.json()["status"] == status

    def test_nor_can_its_status_be_blanked_and_accepted_again(self, client, db, stock):
        _po(db)
        rid = _receipt(client)
        client.post(f"/goods-receipts/{rid}/accept")
        r = client.patch(f"/goods-receipts/{rid}", json={"status": None})
        assert r.status_code == 409, r.text
        assert client.post(f"/goods-receipts/{rid}/accept").status_code == 409
        assert _on_hand(db) == 10

    def test_an_accepted_receipt_still_takes_a_note(self, client, db, stock):
        _po(db)
        rid = _receipt(client)
        client.post(f"/goods-receipts/{rid}/accept")
        r = client.patch(f"/goods-receipts/{rid}", json={"notes": "two cartons"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Accepted"


# ── F18: two accepts at once cannot both shelve ──────────────────────────────


class TestAcceptingLocksTheReceipt:
    def test_the_receipt_row_is_locked_for_the_accept(self, client, db, stock, locked):
        _po(db)
        rid = _receipt(client)
        assert client.post(f"/goods-receipts/{rid}/accept").status_code == 200
        assert GoodsReceipt in locked

    def test_one_accepted_since_it_was_read_is_not_shelved_again(
        self, client, db, stock
    ):
        _po(db)
        rid = _receipt(client)
        # Read once (and held, as a request holds what it read)…
        read = db.get(GoodsReceipt, rid)
        assert read.status == "Pending"
        # …and accepted by another request before this one gets to it.
        db.execute(
            text("UPDATE goods_receipts SET status = 'Accepted' WHERE id = :id"),
            {"id": rid},
        )
        r = client.post(f"/goods-receipts/{rid}/accept")
        assert r.status_code == 409, r.text
        assert _on_hand(db) == 0
        assert _received(db) == [0]


# ── F29: Partial and Received come from the lines ────────────────────────────


class TestAPurchaseOrdersReceivedStatusComesFromItsLines:
    def test_partial_or_received_cannot_be_set_by_hand(self, client, db):
        _po(db)
        for status in ("Partial", "Received"):
            r = client.patch("/purchase-orders/PG-1", json={"status": status})
            assert r.status_code == 422, (status, r.text)
        db.expire_all()
        assert db.get(PurchaseOrder, "PG-1").status == "Sent"

    def test_one_part_received_cannot_be_set_back_or_cancelled(self, client, db):
        _po(db, status="Partial", lines=((6, 2, 15.55),))
        for status in ("Sent", "Draft", "Cancelled"):
            r = client.patch("/purchase-orders/PG-1", json={"status": status})
            assert r.status_code == 422, (status, r.text)
        db.expire_all()
        assert db.get(PurchaseOrder, "PG-1").status == "Partial"

    def test_one_with_nothing_received_can_be_sent_cancelled_or_drafted(
        self, client, db
    ):
        _po(db, status="Draft")
        for status in ("Sent", "Cancelled", "Draft"):
            r = client.patch("/purchase-orders/PG-1", json={"status": status})
            assert r.status_code == 200, r.text
            assert r.json()["status"] == status

    def test_an_unknown_status_is_refused(self, client, db):
        _po(db)
        r = client.patch("/purchase-orders/PG-1", json={"status": "Shipped"})
        assert r.status_code == 422

    def test_its_other_fields_still_change_once_part_received(self, client, db):
        _po(db, status="Partial", lines=((6, 2, 15.55),))
        r = client.patch("/purchase-orders/PG-1", json={"notes": "rest on Friday"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Partial"


# ── F15: auto-reorder totals its lines; health lists POs that do not ─────────


class TestAutoReorderTotalsItsLines:
    def test_the_po_it_raises_carries_gst(self, client, db, make_inventory):
        make_inventory(sku="PG-AR", stock=0, min_stock=10, reorder_qty=10)
        created = client.post("/inventory/auto-reorder").json()["purchase_orders"]
        assert len(created) == 1
        db.expire_all()
        po = db.get(PurchaseOrder, created[0])
        assert (float(po.total_ex), float(po.tax_total), float(po.total_inc)) == (
            100.0,
            10.0,
            110.0,
        )
        assert float(po.total) == 110.0
        assert [float(line.total) for line in po.items] == [100.0]

    def test_health_lists_a_po_whose_totals_are_not_its_lines(self, client, db):
        # As auto-reorder used to leave one: the ex-GST figure in `total` only.
        _po(db, "PG-H1", total=155.5)
        _po(
            db, "PG-H2", total=171.05, total_ex=155.5, tax_total=15.55, total_inc=171.05
        )
        rows = client.get("/accounting/health").json()["po_totals_disagree_with_lines"]
        assert rows == [
            {"po_id": "PG-H1", "supplier": "Stitch Co", "header": 0.0, "lines": 171.05}
        ]


# ── F17: the document totals its lines; a closed PO is not emailed ───────────


class TestThePurchaseOrderDocument:
    def test_it_prints_its_lines_total_not_the_stored_one(
        self, client, db, monkeypatch
    ):
        # 4 x 15.55 + 2 x 10.00 = 82.20 ex, 8.22 GST, 90.42 inc; stored as 0.
        _po(db, lines=((4, 0, 15.55), (2, 0, 10.00)), total=82.2)
        printed = []

        def spying(real):
            def spy(text, *style):
                printed.append(str(text))
                return real(text, *style)

            return spy

        # Data goes through _p, the document's own markup (the bold total)
        # through _rich.
        for helper in ("_p", "_rich"):
            monkeypatch.setattr(
                purchase_order_document,
                helper,
                spying(getattr(purchase_order_document, helper)),
            )
        assert client.get("/purchase-orders/PG-1/pdf").status_code == 200
        assert "$82.20" in printed
        assert "$8.22" in printed
        assert "<b>$90.42</b>" in printed
        assert "$0.00" not in printed and "<b>$0.00</b>" not in printed

    def test_a_cancelled_or_received_po_is_not_emailed(self, client, db, mail):
        _po(db, "PG-C", status="Cancelled")
        _po(db, "PG-R", status="Received", lines=((10, 10, 15.55),))
        for po_id in ("PG-C", "PG-R"):
            r = client.post(
                f"/purchase-orders/{po_id}/email",
                json={"to_email": "orders@stitch.example"},
            )
            assert r.status_code == 409, (po_id, r.text)
            assert po_id in r.json()["detail"]
        assert mail.sent == []

    def test_a_part_received_po_can_still_be_emailed(self, client, db, mail):
        _po(db, status="Partial", lines=((6, 2, 15.55),))
        r = client.post(
            "/purchase-orders/PG-1/email", json={"to_email": "orders@stitch.example"}
        )
        assert r.status_code == 200, r.text
        assert mail.sent == [["orders@stitch.example"]]

"""Receiving goods against a purchase order, by either path, the same way.

Simulation findings F03, F15, F18, F29 and F38, and the verifier's note that
the inline receive on the PO screen never filled back-orders:

- a goods receipt credited only the first PO line carrying its SKU, so a PO
  consolidated across jobs never closed (F03);
- a partial receipt left the PO at 'Sent' (F29);
- the movement a receipt posted named no PO or job, the job lines it filled
  never read 'Received', and back-orders were filled oldest-due-first with no
  regard for which job the PO line was raised for (F18);
- POs raised from requirements carried a total but no ex/GST/inc split, and
  the create response had no lines (F15);
- stock stats looked for receipts under a movement type nothing posts (F38).
"""

import pytest

from app.models.inventory import StockMovement
from app.models.job import Job, JobItem
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem


def _job(db, make_customer, job_id, sku, back_order, status="ORDER", due=None):
    if not db.query(Job).filter_by(customer_id="RCV-C").first():
        make_customer(id="RCV-C", credit_limit=99999.0)
    db.add(
        Job(
            id=job_id,
            customer_id="RCV-C",
            customer_name="Receiving Co",
            status=status,
            due=due,
            items=[
                JobItem(
                    display_type="product",
                    stock_code=sku,
                    order_qty=back_order,
                    supply_qty=0,
                    b_ord=back_order,
                )
            ],
        )
    )
    db.commit()


def _po(db, po_id, lines, status="Sent"):
    db.add(
        PurchaseOrder(
            id=po_id,
            supplier_name="Stitch Co",
            status=status,
            items=[
                PurchaseOrderItem(sku=sku, job_id=job_id, qty_ordered=qty, unit_cost=5)
                for sku, job_id, qty in lines
            ],
        )
    )
    db.commit()
    return db.get(PurchaseOrder, po_id)


def _receive(client, po_id, sku, qty, **line):
    gr = client.post(
        "/goods-receipts",
        json={
            "po_id": po_id,
            "received_date": "2026-10-20",
            "lines": [{"sku": sku, "qty_received": qty, **line}],
        },
    )
    assert gr.status_code == 201, gr.text
    accepted = client.post(f"/goods-receipts/{gr.json()['id']}/accept")
    assert accepted.status_code == 200, accepted.text
    return gr.json()


def _lines(db, po_id):
    db.expire_all()
    return {
        (i.job_id, i.qty_ordered): i.qty_received
        for i in db.query(PurchaseOrderItem).filter_by(order_id=po_id)
    }


# ── F03: a consolidated PO is credited line by line, and closes ──────────────


@pytest.mark.integration
class TestAConsolidatedPurchaseOrder:
    def test_one_receipt_fills_every_line_of_the_sku(self, client, db, make_inventory):
        make_inventory(sku="EMB-LHC", stock=0)
        _po(db, "PO-R1", [("EMB-LHC", "110000", 2), ("EMB-LHC", "110001", 4)])
        _receive(client, "PO-R1", "EMB-LHC", 6)
        assert _lines(db, "PO-R1") == {("110000", 2): 2, ("110001", 4): 4}
        assert db.get(PurchaseOrder, "PO-R1").status == "Received"

    def test_a_receipt_can_name_the_line_it_is_for(self, client, db, make_inventory):
        make_inventory(sku="EMB-LHC", stock=0)
        po = _po(db, "PO-R2", [("EMB-LHC", "110000", 2), ("EMB-LHC", "110001", 4)])
        second = next(i for i in po.items if i.job_id == "110001")
        _receive(client, "PO-R2", "EMB-LHC", 4, po_item_id=second.id)
        assert _lines(db, "PO-R2") == {("110000", 2): 0, ("110001", 4): 4}

    def test_naming_a_line_of_another_purchase_order_is_refused(
        self, client, db, make_inventory
    ):
        make_inventory(sku="EMB-LHC", stock=0)
        other = _po(db, "PO-R3", [("EMB-LHC", None, 2)])
        _po(db, "PO-R4", [("EMB-LHC", None, 2)])
        r = client.post(
            "/goods-receipts",
            json={
                "po_id": "PO-R4",
                "received_date": "2026-10-20",
                "lines": [
                    {
                        "sku": "EMB-LHC",
                        "qty_received": 2,
                        "po_item_id": other.items[0].id,
                    }
                ],
            },
        )
        assert r.status_code == 422

    def test_an_over_delivery_is_recorded_on_the_last_line(
        self, client, db, make_inventory
    ):
        make_inventory(sku="EMB-LHC", stock=0)
        _po(db, "PO-R5", [("EMB-LHC", "110000", 2), ("EMB-LHC", "110001", 4)])
        _receive(client, "PO-R5", "EMB-LHC", 7)
        assert _lines(db, "PO-R5") == {("110000", 2): 2, ("110001", 4): 5}


# ── F29: a part-received PO says so ──────────────────────────────────────────


@pytest.mark.integration
class TestPartReceived:
    def test_a_partial_receipt_marks_the_purchase_order_partial(
        self, client, db, make_inventory
    ):
        make_inventory(sku="POLO-M", stock=0)
        _po(db, "PO-P1", [("POLO-M", None, 6)])
        _receive(client, "PO-P1", "POLO-M", 4)
        assert db.get(PurchaseOrder, "PO-P1").status == "Partial"

    def test_the_rest_arriving_closes_it(self, client, db, make_inventory):
        make_inventory(sku="POLO-M", stock=0)
        _po(db, "PO-P2", [("POLO-M", None, 6)])
        _receive(client, "PO-P2", "POLO-M", 4)
        _receive(client, "PO-P2", "POLO-M", 2)
        db.expire_all()
        po = db.get(PurchaseOrder, "PO-P2")
        assert po.status == "Received" and po.received_date


# ── F18: what arrived is traceable to the PO line and the job ────────────────


@pytest.mark.integration
class TestReceiptsAreTraceable:
    def test_the_movement_names_the_purchase_order_and_the_job(
        self, client, db, make_inventory
    ):
        make_inventory(sku="EMB-LHC", stock=0)
        _po(db, "PO-T1", [("EMB-LHC", "110000", 2), ("EMB-LHC", "110001", 4)])
        _receive(client, "PO-T1", "EMB-LHC", 6)
        moves = (
            db.query(StockMovement)
            .filter_by(sku="EMB-LHC", type="GR")
            .order_by(StockMovement.id)
            .all()
        )
        assert [(m.po_id, m.job_id, m.quantity) for m in moves] == [
            ("PO-T1", "110000", 2),
            ("PO-T1", "110001", 4),
        ]
        lines = {
            i.job_id: i.id
            for i in db.query(PurchaseOrderItem).filter_by(order_id="PO-T1")
        }
        assert [m.po_line for m in moves] == [lines["110000"], lines["110001"]]

    def test_the_job_the_line_was_raised_for_is_filled_first(
        self, client, db, make_customer, make_inventory
    ):
        make_inventory(sku="POLO-L", stock=0)
        # An older job wants the same polo, but this PO was raised for J-NEW.
        _job(db, make_customer, "J-OLD", "POLO-L", 3, due="2026-10-01")
        _job(db, make_customer, "J-NEW", "POLO-L", 3, due="2026-12-01")
        _po(db, "PO-T2", [("POLO-L", "J-NEW", 3)])
        _receive(client, "PO-T2", "POLO-L", 3)
        db.expire_all()
        filled = {
            i.job_id: (i.supply_qty, i.b_ord, i.item_status)
            for i in db.query(JobItem).filter(JobItem.stock_code == "POLO-L")
        }
        assert filled == {"J-NEW": (3, 0, "Received"), "J-OLD": (0, 3, None)}

    def test_left_over_stock_still_fills_other_jobs(
        self, client, db, make_customer, make_inventory
    ):
        make_inventory(sku="POLO-L", stock=0)
        _job(db, make_customer, "J-A", "POLO-L", 2)
        _job(db, make_customer, "J-B", "POLO-L", 2)
        _po(db, "PO-T3", [("POLO-L", "J-A", 4)])
        _receive(client, "PO-T3", "POLO-L", 4)
        db.expire_all()
        assert {
            i.job_id: i.b_ord
            for i in db.query(JobItem).filter(JobItem.stock_code == "POLO-L")
        } == {"J-A": 0, "J-B": 0}


# ── The inline receive on the PO screen does the same ────────────────────────


@pytest.mark.integration
class TestTheInlineReceiveDoesTheSame:
    def test_it_fills_back_orders(self, client, db, make_customer, make_inventory):
        make_inventory(sku="PANT-32", stock=0)
        _job(db, make_customer, "J-INL", "PANT-32", 2)
        po = _po(db, "PO-I1", [("PANT-32", "J-INL", 2)])
        r = client.post(
            "/purchase-orders/PO-I1/receive",
            json={"items": [{"id": po.items[0].id, "qty_received": 2}]},
        )
        assert r.status_code == 200, r.text
        db.expire_all()
        line = db.query(JobItem).filter_by(job_id="J-INL").one()
        assert (line.supply_qty, line.b_ord, line.item_status) == (2, 0, "Received")

    def test_its_movement_is_dated_like_every_other(self, client, db, make_inventory):
        make_inventory(sku="PANT-32", stock=0)
        po = _po(db, "PO-I2", [("PANT-32", "J-INL", 2)])
        client.post(
            "/purchase-orders/PO-I2/receive",
            json={"items": [{"id": po.items[0].id, "qty_received": 2}]},
        )
        move = db.query(StockMovement).filter_by(po_id="PO-I2").one()
        assert move.job_id == "J-INL"
        assert len(move.date) == 10 and move.date[4] == "-"  # YYYY-MM-DD


# ── F15: a PO raised from requirements is totalled like any other ────────────


@pytest.mark.integration
class TestPurchaseOrdersFromRequirements:
    def test_it_carries_ex_gst_and_inc_and_its_lines(
        self, client, db, make_customer, make_inventory
    ):
        make_inventory(sku="POLO-XL", stock=0, unit_cost=15.55)
        _job(db, make_customer, "J-REQ", "POLO-XL", 10)
        item = db.query(JobItem).filter_by(job_id="J-REQ").one()
        r = client.post(
            "/purchase-orders/from-requirements",
            json={
                "id": "PO-Q1",
                "supplier_name": "Fly Apparel",
                "requirements": [{"item_id": item.id, "qty": 10}],
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert (body["total_ex"], body["tax_total"], body["total_inc"]) == (
            155.5,
            15.55,
            171.05,
        )
        assert len(body["items"]) == 1

    def test_from_back_orders_too(self, client, db):
        r = client.post(
            "/purchase-orders/from-back-orders",
            json={
                "id": "PO-Q2",
                "items": [{"sku": "POLO-XL", "qty": 10, "unit_cost": 15.55}],
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["total_inc"] == 171.05
        assert len(r.json()["items"]) == 1


# ── F38: stock stats see receipts ────────────────────────────────────────────


@pytest.mark.integration
class TestStockStatsSeeReceipts:
    def test_a_goods_receipt_is_a_receipt(self, client, db, make_inventory):
        make_inventory(sku="JKT-L", stock=0)
        _po(db, "PO-S1", [("JKT-L", None, 5)])
        _receive(client, "PO-S1", "JKT-L", 5)
        stats = client.get("/inventory/JKT-L/stats").json()
        assert stats["total_received_all_time"] == 5
        assert stats["last_received"]

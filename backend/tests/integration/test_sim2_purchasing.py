"""Buying and receiving for jobs: the 2026-11-01 simulation.

docs/backlog.md, SIM2:

- S2-04: a code that is no stock item — an indent — was received against its
  job's PO and never reached the job line;
- S2-17: closing a decoration PO short left the missing applications on no
  list, and scrapping goods an order held left the job supplied;
- S2-20 (in part): `items` PATCHed onto a PO were dropped with a 200.
"""

import pytest

from app.core.reservations import committed_total
from app.models.customer import Customer
from app.models.inventory import StockMovement
from app.models.job import Job, JobItem
from app.models.logo import Logo
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def customer(db):
    db.add(Customer(id="CLUB", name="Club Co", credit_limit=99999.0))
    db.commit()


def _book(client, *lines):
    r = client.post(
        "/jobs", json={"customer_id": "CLUB", "status": "ORDER", "items": list(lines)}
    )
    assert r.status_code == 200, r.text
    return r.json()


def _po(db, po_id, lines, status="Sent"):
    """`lines`: (sku, job_id, ordered, received)."""
    db.add(
        PurchaseOrder(
            id=po_id,
            supplier_name="Maker Co",
            status=status,
            items=[
                PurchaseOrderItem(
                    sku=sku,
                    job_id=job_id,
                    description=sku,
                    qty_ordered=ordered,
                    qty_received=received,
                    unit_cost=10,
                )
                for sku, job_id, ordered, received in lines
            ],
        )
    )
    db.commit()
    return db.get(PurchaseOrder, po_id)


def _lines(db, job_id):
    db.expire_all()
    return [
        (i.stock_code, i.order_qty, i.supply_qty, i.b_ord, i.item_status, i.po_no)
        for i in sorted(db.get(Job, job_id).items, key=lambda i: i.sort)
    ]


def _wanted(client, kind="garment"):
    r = client.get("/jobs/order-requirements", params={"type": kind})
    assert r.status_code == 200, r.text
    key = "total_b_ord" if kind == "garment" else "total_qty"
    return {row["sku"]: row[key] for row in r.json()}


# ── S2-04: a bought-in code reaches its job ──────────────────────────────────


class TestABoughtInCodeReachesItsJob:
    def _indent(self, client, db):
        job = _book(
            client, {"stock_code": "FB.INDENT", "order_qty": 10, "price_ex": 40}
        )
        po = _po(db, "PO-IND1", [("FB.INDENT", job["id"], 10, 0)])
        return job["id"], po.items[0].id

    def test_the_quick_receive_fills_the_job_line(self, client, db):
        job_id, line_id = self._indent(client, db)
        r = client.post(
            "/purchase-orders/PO-IND1/receive",
            json={"items": [{"id": line_id, "qty_received": 9}]},
        )
        assert r.status_code == 200, r.text
        assert _lines(db, job_id) == [("FB.INDENT", 10, 9, 1, None, None)]

    def test_a_goods_receipt_fills_the_job_line_and_closing_short_lists_the_rest(
        self, client, db
    ):
        job_id, _ = self._indent(client, db)
        r = client.post(
            "/goods-receipts",
            json={
                "po_id": "PO-IND1",
                "received_date": "2026-10-27",
                "lines": [{"sku": "FB.INDENT", "qty_received": 10}],
            },
        )
        assert r.status_code == 201, r.text
        assert (
            client.post(f"/goods-receipts/{r.json()['id']}/accept").status_code == 200
        )
        assert _lines(db, job_id) == [("FB.INDENT", 10, 10, 0, "Received", None)]
        assert "FB.INDENT" not in _wanted(client)

    def test_nothing_is_shelved(self, client, db):
        job_id, line_id = self._indent(client, db)
        client.post(
            "/purchase-orders/PO-IND1/receive",
            json={"items": [{"id": line_id, "qty_received": 10}]},
        )
        assert db.query(StockMovement).filter_by(sku="FB.INDENT").count() == 0


# ── S2-17: close short and scrap feed back to the job ────────────────────────


class TestClosingDecorationShort:
    def test_the_applications_not_brought_go_back_on_the_buying_list(self, client, db):
        db.add(
            Logo(
                code="EMB.SUB",
                customer_id="CLUB",
                name="Club crest",
                decoration_type="EMB",
                made_by="subcontract",
            )
        )
        db.commit()
        logo = db.query(Logo).filter_by(code="EMB.SUB").one()
        db.add(
            Job(
                id="E9",
                customer_id="CLUB",
                customer_name="Club Co",
                status="ORDER",
                items=[
                    JobItem(
                        sort=n,
                        stock_code="EMB.SUB",
                        decoration_type="EMB",
                        order_qty=qty,
                        supply_qty=qty,
                        logo_id=logo.id,
                        po_no="PO-EMB1",
                    )
                    for n, qty in enumerate((1, 1, 2))
                ],
            )
        )
        db.commit()
        _po(db, "PO-EMB1", [("EMB.SUB", "E9", 4, 2)], status="Partial")
        r = client.patch("/purchase-orders/PO-EMB1", json={"status": "Received"})
        assert r.status_code == 200, r.text
        assert [line[4:] for line in _lines(db, "E9")] == [
            ("Received", "PO-EMB1"),
            ("Received", "PO-EMB1"),
            (None, None),
        ]
        assert _wanted(client, "decoration") == {"EMB.SUB": 2}

    def test_a_line_brought_in_part_is_split(self, client, db):
        db.add(
            Logo(
                code="EMB.SUB",
                customer_id="CLUB",
                name="Club crest",
                decoration_type="EMB",
                made_by="subcontract",
            )
        )
        db.commit()
        logo = db.query(Logo).filter_by(code="EMB.SUB").one()
        db.add(
            Job(
                id="E10",
                customer_id="CLUB",
                customer_name="Club Co",
                status="ORDER",
                items=[
                    JobItem(
                        sort=0,
                        stock_code="EMB.SUB",
                        decoration_type="EMB",
                        order_qty=40,
                        supply_qty=40,
                        price_ex=2.5,
                        logo_id=logo.id,
                        po_no="PO-EMB2",
                    )
                ],
            )
        )
        db.commit()
        _po(db, "PO-EMB2", [("EMB.SUB", "E10", 40, 38)], status="Partial")
        r = client.patch("/purchase-orders/PO-EMB2", json={"status": "Received"})
        assert r.status_code == 200, r.text
        assert [(n[1], n[4], n[5]) for n in _lines(db, "E10")] == [
            (38, "Received", "PO-EMB2"),
            (2, None, None),
        ]
        assert _wanted(client, "decoration") == {"EMB.SUB": 2}
        assert float(db.get(Job, "E10").total_ex) == 100.0


class TestScrapAgainstAJob:
    @pytest.fixture
    def held(self, client, make_inventory):
        make_inventory(sku="HV-L", stock=30)
        return _book(client, {"stock_code": "HV-L", "order_qty": 30, "price_ex": 40})

    def _scrap(self, client, job_id, qty=4):
        return client.post(
            "/inventory/HV-L/adjust",
            json={"adjustment": -qty, "reason": "Tape covered", "job_id": job_id},
        )

    def test_the_job_back_orders_what_was_written_off(self, client, db, held):
        r = self._scrap(client, held["id"])
        assert r.status_code == 200, r.text
        assert _lines(db, held["id"]) == [("HV-L", 30, 26, 4, None, None)]
        assert committed_total(db, "HV-L") == 26
        assert _wanted(client) == {"HV-L": 4}

    def test_the_write_off_is_the_jobs(self, client, db, held):
        self._scrap(client, held["id"])
        adjustment = db.query(StockMovement).filter_by(type="Adjustment").one()
        assert (adjustment.quantity, adjustment.job_id) == (-4, held["id"])

    def test_a_line_whose_po_is_closed_is_bought_again(self, client, db, held):
        _po(db, "PO-HV1", [("HV-L", held["id"], 30, 30)], status="Received")
        db.query(JobItem).filter_by(job_id=held["id"]).update({"po_no": "PO-HV1"})
        db.commit()
        self._scrap(client, held["id"])
        assert _lines(db, held["id"])[0][5] is None

    def test_a_line_waiting_on_an_open_po_keeps_it(self, client, db, held):
        _po(db, "PO-HV2", [("HV-L", held["id"], 30, 10)], status="Partial")
        db.query(JobItem).filter_by(job_id=held["id"]).update({"po_no": "PO-HV2"})
        db.commit()
        self._scrap(client, held["id"])
        assert _lines(db, held["id"])[0][5] == "PO-HV2"

    def test_more_than_the_job_holds_is_refused(self, client, db, held):
        r = self._scrap(client, held["id"], qty=31)
        assert r.status_code in (400, 409)
        assert _lines(db, held["id"]) == [("HV-L", 30, 30, 0, None, None)]

    def test_a_picked_line_no_longer_picks_what_is_gone(self, client, db, held):
        db.query(JobItem).filter_by(job_id=held["id"]).update({"qty_pick": 30})
        db.commit()
        self._scrap(client, held["id"])
        db.expire_all()
        line = db.query(JobItem).filter_by(job_id=held["id"]).one()
        assert (line.supply_qty, line.qty_pick) == (26, 26)

    def test_written_off_where_the_job_holds_it(self, client, db, make_inventory):
        make_inventory(sku="HV-M", stock=10)
        r = client.post(
            "/jobs",
            json={
                "customer_id": "CLUB",
                "status": "ORDER",
                "branch": "AF",
                "items": [{"stock_code": "HV-M", "order_qty": 5, "price_ex": 40}],
            },
        )
        job_id = r.json()["id"]
        r = client.post(
            "/inventory/HV-M/adjust",
            json={"adjustment": -2, "reason": "Damaged", "job_id": job_id},
        )
        assert r.status_code == 200, r.text
        moved = db.query(StockMovement).filter(
            StockMovement.sku == "HV-M",
            StockMovement.type.in_(("Released", "Adjustment")),
        )
        assert {(m.type, m.location_branch) for m in moved} == {
            ("Released", "AF"),
            ("Adjustment", "AF"),
        }
        r = client.post(
            "/inventory/HV-M/adjust",
            json={"adjustment": -1, "reason": "x", "job_id": job_id, "branch": "HQ"},
        )
        assert r.status_code == 422

    def test_only_a_write_off_is_made_against_a_job(self, client, held):
        r = client.post(
            "/inventory/HV-L/adjust",
            json={"adjustment": 4, "reason": "Found", "job_id": held["id"]},
        )
        assert r.status_code == 422


# ── S2-20: a PO PATCH says what it does ──────────────────────────────────────


class TestPatchingAPurchaseOrder:
    def test_a_field_it_does_not_know_is_refused(self, client, db):
        _po(db, "PO-PRT1", [("PRINT", None, 150, 0)])
        r = client.patch(
            "/purchase-orders/PO-PRT1",
            json={"items": [{"sku": "SETUP", "qty_ordered": 1, "unit_cost": 60}]},
        )
        assert r.status_code == 422

    def test_a_set_up_charge_is_added_to_the_po(self, client, db):
        _po(db, "PO-PRT1", [("PRINT", None, 150, 0)])
        r = client.patch(
            "/purchase-orders/PO-PRT1",
            json={"add_items": [{"sku": "SETUP", "qty_ordered": 1, "unit_cost": 60}]},
        )
        assert r.status_code == 200, r.text
        assert sorted(i["sku"] for i in r.json()["items"]) == ["PRINT", "SETUP"]
        assert r.json()["total_ex"] == 1560.0

    def test_nothing_is_added_to_a_closed_po(self, client, db):
        _po(db, "PO-PRT1", [("PRINT", None, 150, 150)], status="Received")
        r = client.patch(
            "/purchase-orders/PO-PRT1",
            json={"add_items": [{"sku": "SETUP", "qty_ordered": 1, "unit_cost": 60}]},
        )
        assert r.status_code == 409

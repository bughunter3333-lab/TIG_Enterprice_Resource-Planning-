"""Stock and job defects a review reproduced in the working tree.

- Confirming a New or QUOTE job reserved the supply worked out when it was
  booked, so two orders held the same units and nothing was back-ordered.
- A PO raised from the back-order report put no job on its lines, so the
  receipt filled the oldest job due instead of the one it was bought for.
- Filling a back-order (and picking, and linking a PO) did not move the job's
  version, so a job form opened earlier saved over it.
- Subcontracted decoration, bought through order requirements, was received
  into on-hand stock of the logo's stock item and never left.
- The Committed tab and the picking-slip weight counted decoration lines.
- The portal's duplicate check missed a retry whose order number ended in a
  tab or newline.
- FINISH -> PAID (a cash sale) left a job PAID and owed in full.
- Removing every line from a job left the old header total standing.
"""

import pytest

from app.core import job_weight
from app.core.reservations import committed_total
from app.core.stock_ledger import ON_HAND_TYPES
from app.models.inventory import InventoryItem, StockMovement
from app.models.job import Job, JobComment, JobItem
from app.models.logo import Logo
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem

CUSTOMER = "RV-C"


@pytest.fixture(autouse=True)
def customer(make_customer):
    make_customer(id=CUSTOMER, name="Review Co", credit_limit=99999.0)


def _book(client, status, *lines):
    r = client.post(
        "/jobs",
        json={"customer_id": CUSTOMER, "status": status, "items": list(lines)},
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _goods(sku, qty, **fields):
    return {"stock_code": sku, "order_qty": qty, **fields}


def _split(db, job_id, sku):
    db.expire_all()
    line = db.query(JobItem).filter_by(job_id=job_id, stock_code=sku).one()
    return (line.supply_qty, line.b_ord)


def _waiting_job(db, job_id, sku, qty, due=None, status="ORDER"):
    """An open order whose one line is wholly back-ordered."""
    db.add(
        Job(
            id=job_id,
            customer_id=CUSTOMER,
            customer_name="Review Co",
            status=status,
            due=due,
            items=[
                JobItem(
                    display_type="product",
                    stock_code=sku,
                    order_qty=qty,
                    supply_qty=0,
                    b_ord=qty,
                )
            ],
        )
    )
    db.commit()


def _version(client, job_id):
    return str(client.get(f"/jobs/{job_id}").json()["version"])


def _po(db, po_id, sku, job_id, qty):
    db.add(
        PurchaseOrder(
            id=po_id,
            supplier_name="Stitch Co",
            status="Sent",
            items=[
                PurchaseOrderItem(sku=sku, job_id=job_id, qty_ordered=qty, unit_cost=5)
            ],
        )
    )
    db.commit()
    return db.get(PurchaseOrder, po_id)


def _quick_receive(client, po_id, qty):
    po = client.get(f"/purchase-orders/{po_id}").json()
    r = client.post(
        f"/purchase-orders/{po_id}/receive",
        json={"items": [{"id": po["items"][0]["id"], "qty_received": qty}]},
    )
    assert r.status_code == 200, r.text


def _goods_receipt(client, po_id, sku, qty):
    gr = client.post(
        "/goods-receipts",
        json={
            "po_id": po_id,
            "received_date": "2026-10-25",
            "lines": [{"sku": sku, "qty_received": qty}],
        },
    )
    assert gr.status_code == 201, gr.text
    accepted = client.post(f"/goods-receipts/{gr.json()['id']}/accept")
    assert accepted.status_code == 200, accepted.text


RECEIVERS = {
    "quick receive": lambda client, po_id, sku, qty: _quick_receive(client, po_id, qty),
    "goods receipt": _goods_receipt,
}


# ── 1. Confirming an order works its split out against stock free now ───────


@pytest.mark.integration
class TestConfirmingAnOrder:
    @pytest.mark.parametrize("booked_as", ["New", "QUOTE"])
    def test_what_another_order_took_since_is_back_ordered(
        self, client, db, make_inventory, booked_as
    ):
        make_inventory(sku="RV-POLO", stock=5)
        first = _book(client, booked_as, _goods("RV-POLO", 5))
        assert _split(db, first, "RV-POLO") == (5, 0)  # all there when booked
        # An order taken meanwhile is entitled to the stock: the first job
        # reserved nothing while it was New or a quote.
        second = _book(client, "ORDER", _goods("RV-POLO", 5))
        assert _split(db, second, "RV-POLO") == (5, 0)

        r = client.post(f"/jobs/{first}/status", json={"status": "ORDER"})
        assert r.status_code == 200, r.text

        assert _split(db, first, "RV-POLO") == (0, 5)
        assert committed_total(db, "RV-POLO") == 5
        to_buy = client.get("/jobs/order-requirements").json()
        assert [(row["sku"], row["total_b_ord"]) for row in to_buy] == [("RV-POLO", 5)]
        trail = [c.comment for c in db.query(JobComment).filter_by(job_id=first).all()]
        assert any("RV-POLO" in c and "back-ordered" in c for c in trail), trail

    def test_a_bulk_confirmation_shares_the_shelf_between_the_jobs(
        self, client, db, make_inventory
    ):
        make_inventory(sku="RV-TEE", stock=5)
        a = _book(client, "New", _goods("RV-TEE", 3))
        b = _book(client, "New", _goods("RV-TEE", 3))
        r = client.post(
            "/jobs/bulk-status", json={"job_ids": [a, b], "status": "ORDER"}
        )
        assert r.json() == {"moved": 2, "failed": []}
        assert _split(db, a, "RV-TEE") == (3, 0)
        assert _split(db, b, "RV-TEE") == (2, 1)
        assert committed_total(db, "RV-TEE") == 5

    def test_a_line_that_chose_to_buy_in_keeps_that_choice(
        self, client, db, make_inventory
    ):
        make_inventory(sku="RV-CAP", stock=10)
        job = _book(client, "QUOTE", _goods("RV-CAP", 4, supply_qty=0, b_ord=4))
        client.post(f"/jobs/{job}/status", json={"status": "ORDER"})
        assert _split(db, job, "RV-CAP") == (0, 4)


# ── 2. A PO raised from the back-order report says which job it is for ──────


@pytest.mark.integration
class TestPurchaseOrdersFromBackOrders:
    def test_the_receipt_fills_the_job_it_was_raised_for(
        self, client, db, make_inventory
    ):
        make_inventory(sku="RV-JKT", stock=0)
        _waiting_job(db, "RV-A", "RV-JKT", 5, due="2026-11-01")
        _waiting_job(db, "RV-B", "RV-JKT", 5, due="2026-12-01")
        r = client.post(
            "/purchase-orders/from-back-orders",
            json={
                "id": "PO-RV1",
                "items": [
                    {"sku": "RV-JKT", "qty": 5, "unit_cost": 10, "job_ids": ["RV-B"]}
                ],
            },
        )
        assert r.status_code == 200, r.text
        assert [(i["job_id"], i["qty_ordered"]) for i in r.json()["items"]] == [
            ("RV-B", 5)
        ]

        _quick_receive(client, "PO-RV1", 5)

        db.expire_all()
        assert {
            i.job_id: (i.supply_qty, i.b_ord, i.po_no)
            for i in db.query(JobItem).filter_by(stock_code="RV-JKT")
        } == {"RV-A": (0, 5, None), "RV-B": (5, 0, "PO-RV1")}

    def test_a_row_for_several_jobs_is_a_line_per_job(self, client, db, make_inventory):
        make_inventory(sku="RV-JKT", stock=0)
        _waiting_job(db, "RV-A", "RV-JKT", 2)
        _waiting_job(db, "RV-B", "RV-JKT", 3)
        r = client.post(
            "/purchase-orders/from-back-orders",
            json={
                "id": "PO-RV2",
                "items": [
                    {
                        "sku": "RV-JKT",
                        "qty": 9,
                        "unit_cost": 10,
                        "job_ids": ["RV-A", "RV-B"],
                    }
                ],
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Each job's back-order, then what is bought beyond them for stock.
        assert [(i["job_id"], i["qty_ordered"]) for i in body["items"]] == [
            ("RV-A", 2),
            ("RV-B", 3),
            (None, 4),
        ]
        assert body["total_ex"] == 90.0


# ── 3. Changing a job's lines off the job form moves its version ────────────


@pytest.mark.integration
class TestOffFormChangesMoveTheVersion:
    @pytest.mark.parametrize("receive", list(RECEIVERS))
    def test_a_filled_back_order_is_not_saved_over_by_an_older_form(
        self, client, db, make_inventory, receive
    ):
        make_inventory(sku="RV-BO", stock=0)
        _waiting_job(db, "RV-V1", "RV-BO", 5)
        stale = _version(client, "RV-V1")
        line = client.get("/jobs/RV-V1").json()["items"][0]
        _po(db, "PO-V1", "RV-BO", "RV-V1", 5)

        RECEIVERS[receive](client, "PO-V1", "RV-BO", 5)
        assert _split(db, "RV-V1", "RV-BO") == (5, 0)

        r = client.patch(
            "/jobs/RV-V1",
            json={
                "items": [
                    {
                        "id": line["id"],
                        "stock_code": "RV-BO",
                        "order_qty": 5,
                        "supply_qty": 0,
                        "b_ord": 5,
                    }
                ]
            },
            headers={"If-Match": stale},
        )
        assert r.status_code == 409, r.text
        assert _split(db, "RV-V1", "RV-BO") == (5, 0)
        assert committed_total(db, "RV-BO") == 5

    @pytest.mark.parametrize("path", ["pick", "auto-pick"])
    def test_picking_moves_the_version(self, client, db, path):
        job = _book(client, "ORDER", {"description": "Polo", "order_qty": 2})
        stale = _version(client, job)
        item_id = client.get(f"/jobs/{job}").json()["items"][0]["id"]
        if path == "pick":
            r = client.post(
                f"/jobs/{job}/pick",
                json={"picks": [{"item_id": item_id, "qty_pick": 2}]},
            )
        else:
            r = client.post("/jobs/auto-pick", json={"job_ids": [job]})
        assert r.status_code == 200, r.text
        assert _version(client, job) != stale

    def test_raising_a_po_against_a_line_moves_the_version(
        self, client, db, make_inventory
    ):
        make_inventory(sku="RV-PO", stock=0)
        _waiting_job(db, "RV-V2", "RV-PO", 4)
        _waiting_job(db, "RV-V3", "RV-PO", 4)
        stale = {j: _version(client, j) for j in ("RV-V2", "RV-V3")}
        item_id = client.get("/jobs/RV-V2").json()["items"][0]["id"]
        r = client.post(
            "/purchase-orders/from-requirements",
            json={"id": "PO-V2", "requirements": [{"item_id": item_id, "qty": 4}]},
        )
        assert r.status_code == 200, r.text
        r = client.post(
            "/purchase-orders/from-back-orders",
            json={
                "id": "PO-V3",
                "items": [{"sku": "RV-PO", "qty": 4, "job_ids": ["RV-V3"]}],
            },
        )
        assert r.status_code == 200, r.text
        assert all(_version(client, j) != v for j, v in stale.items())


# ── 4. Subcontracted decoration is a service, not stock ─────────────────────


def _decorated_order(client, db, make_inventory, code, made_by):
    make_inventory(sku="RV-POLO", stock=10)
    # Jim2 holds a logo as a stock item too, so its code is an inventory SKU.
    make_inventory(sku=code, stock=0, weight_kg=0)
    db.add(
        Logo(
            code=code,
            customer_id=CUSTOMER,
            decoration_type="EMB",
            made_by=made_by,
        )
    )
    db.commit()
    return _book(
        client,
        "ORDER",
        {"sort": 0, "stock_code": "RV-POLO", "order_qty": 3},
        {"sort": 1, "stock_code": code, "order_qty": 3, "applies_to_line": 0},
    )


@pytest.mark.integration
class TestSubcontractedDecorationIsNotStock:
    @pytest.mark.parametrize("receive", list(RECEIVERS))
    def test_receiving_it_closes_the_po_and_adds_no_stock(
        self, client, db, make_inventory, receive
    ):
        job = _decorated_order(client, db, make_inventory, "EMB.RV.SUB", "subcontract")
        wanted = client.get("/jobs/order-requirements", params={"type": "decoration"})
        [row] = wanted.json()
        r = client.post(
            "/purchase-orders/from-requirements",
            json={
                "id": "PO-DEC1",
                "supplier_name": "Stitch Co",
                "requirements": [{"item_id": row["jobs"][0]["item_id"], "qty": 3}],
            },
        )
        assert r.status_code == 200, r.text

        RECEIVERS[receive](client, "PO-DEC1", "EMB.RV.SUB", 3)

        db.expire_all()
        assert db.query(InventoryItem).filter_by(sku="EMB.RV.SUB").one().stock == 0
        assert (
            db.query(StockMovement)
            .filter(
                StockMovement.sku == "EMB.RV.SUB",
                StockMovement.type.in_(list(ON_HAND_TYPES)),
            )
            .count()
            == 0
        )
        po = db.get(PurchaseOrder, "PO-DEC1")
        assert (po.status, po.items[0].qty_received) == ("Received", 3)
        decoration = (
            db.query(JobItem).filter_by(job_id=job, stock_code="EMB.RV.SUB").one()
        )
        assert decoration.item_status == "Received"

    def test_a_costed_receipt_of_it_leaves_the_stock_cost_alone(
        self, client, db, make_inventory
    ):
        """Nothing is shelved, so nothing is averaged: weighting a cost against
        units that never arrived would move the logo item's cost of goods."""
        _decorated_order(client, db, make_inventory, "EMB.RV.COST", "subcontract")
        item = db.query(InventoryItem).filter_by(sku="EMB.RV.COST").one()
        before = (item.unit_cost, item.avg_cog, item.last_cost, item.max_cog)
        [row] = client.get(
            "/jobs/order-requirements", params={"type": "decoration"}
        ).json()
        assert (
            client.post(
                "/purchase-orders/from-requirements",
                json={
                    "id": "PO-DEC2",
                    "supplier_name": "Stitch Co",
                    "requirements": [{"item_id": row["jobs"][0]["item_id"], "qty": 3}],
                },
            ).status_code
            == 200
        )
        gr = client.post(
            "/goods-receipts",
            json={
                "po_id": "PO-DEC2",
                "received_date": "2026-10-25",
                "lines": [{"sku": "EMB.RV.COST", "qty_received": 3, "unit_cost": 4.5}],
            },
        )
        assert gr.status_code == 201, gr.text
        assert (
            client.post(f"/goods-receipts/{gr.json()['id']}/accept").status_code == 200
        )

        db.expire_all()
        item = db.query(InventoryItem).filter_by(sku="EMB.RV.COST").one()
        assert (item.unit_cost, item.avg_cog, item.last_cost, item.max_cog) == before

    def test_garments_bought_for_the_same_job_are_still_stock(
        self, client, db, make_inventory
    ):
        make_inventory(sku="RV-HAT", stock=0)
        _waiting_job(db, "RV-G1", "RV-HAT", 2)
        _po(db, "PO-G1", "RV-HAT", "RV-G1", 2)
        _quick_receive(client, "PO-G1", 2)
        db.expire_all()
        assert db.query(InventoryItem).filter_by(sku="RV-HAT").one().stock == 2


# ── 5. The Committed tab lists goods lines only ─────────────────────────────


@pytest.mark.integration
class TestTheCommittedTab:
    def test_a_decoration_line_is_not_listed_as_reserved(
        self, client, db, make_inventory
    ):
        job = _decorated_order(client, db, make_inventory, "EMB.RV.LHC", "in_house")
        assert client.get("/inventory/EMB.RV.LHC/committed").json() == []
        garment = client.get("/inventory/RV-POLO/committed").json()
        assert [(row["job_id"], row["qty"]) for row in garment] == [(job, 3)]


# ── 6. The picking-slip weight weighs goods lines only ──────────────────────


@pytest.mark.integration
class TestTheOrderWeight:
    def test_a_decoration_line_is_not_named_as_unweighed(
        self, client, db, make_inventory
    ):
        job_id = _decorated_order(client, db, make_inventory, "EMB.RV2.LHC", "in_house")
        db.query(InventoryItem).filter_by(sku="RV-POLO").update({"weight_kg": 0.25})
        db.commit()
        db.expire_all()
        assert job_weight.unweighed_lines(db.get(Job, job_id), db) == []

    def test_a_weighted_logo_stock_item_adds_nothing_to_freight(
        self, client, db, make_inventory
    ):
        job_id = _decorated_order(client, db, make_inventory, "EMB.RV3.LHC", "in_house")
        db.query(InventoryItem).filter_by(sku="RV-POLO").update({"weight_kg": 0.25})
        db.query(InventoryItem).filter_by(sku="EMB.RV3.LHC").update({"weight_kg": 0.5})
        db.commit()
        db.expire_all()
        assert job_weight.order_weight(db.get(Job, job_id), db) == 0.75


# ── 7. A portal retry is recognised whatever whitespace trails it ───────────


@pytest.mark.integration
class TestAPortalRetry:
    @pytest.fixture
    def portal(self, client_as):
        return client_as("portal")

    @staticmethod
    def _order(serial):
        return {
            "customer_id": CUSTOMER,
            "status": "New",
            "serial_no": serial,
            "items": [{"stock_code": "POLO-M", "order_qty": 2, "price_ex": 30}],
        }

    @pytest.mark.parametrize("serial", ["WEB-1001\t", "WEB-1001\n", " WEB-1001\r\n"])
    def test_an_exact_retry_is_refused(self, portal, db, serial):
        first = portal.post("/jobs", json=self._order(serial))
        assert first.status_code == 200, first.text
        again = portal.post("/jobs", json=self._order(serial))
        assert again.status_code == 409, again.text
        assert again.json()["detail"]["job_id"] == first.json()["id"]
        db.expire_all()
        assert [j.serial_no for j in db.query(Job).filter_by(item_no="NOP.ONLINE")] == [
            "WEB-1001"
        ]

    def test_an_order_number_stored_before_with_a_tab_still_matches(self, portal, db):
        db.add(
            Job(
                id="RV-OLD",
                customer_id=CUSTOMER,
                status="New",
                item_no="NOP.ONLINE",
                serial_no="WEB-2002\t",
            )
        )
        db.commit()
        r = portal.post("/jobs", json=self._order("WEB-2002"))
        assert r.status_code == 409, r.text


# ── 8. A job is PAID only once its payments cover it ────────────────────────


def _finished(db, job_id):
    db.add(
        Job(
            id=job_id,
            customer_id=CUSTOMER,
            customer_name="Review Co",
            status="FINISH",
            invoice=f"INV-{job_id}",
            total_ex=100,
            tax=10,
            total_inc=110,
            deposit=0,
            balance_due=110,
        )
    )
    db.commit()


def _move(client, job_id, status):
    return client.post(f"/jobs/{job_id}/status", json={"status": status})


def _pay(client, job_id, amount):
    r = client.post(
        f"/jobs/{job_id}/payment", json={"amount": amount, "method": "Cash"}
    )
    assert r.status_code == 200, r.text


@pytest.mark.integration
class TestPaidMeansPaid:
    def test_a_cash_sale_is_refused_until_its_payment_is_recorded(self, client, db):
        _finished(db, "RV-CASH")
        r = _move(client, "RV-CASH", "PAID")
        assert r.status_code == 422, r.text
        assert "record the payment" in r.json()["detail"].lower()
        db.expire_all()
        job = db.get(Job, "RV-CASH")
        assert (job.status, job.invoice_date) == ("FINISH", None)

        _pay(client, "RV-CASH", 110)
        assert _move(client, "RV-CASH", "PAID").status_code == 200

        health = client.get("/accounting/health").json()
        assert health["paid_with_balance_owing"] == []
        assert health["receivables"]["ledger"] == 0.0
        assert client.get(f"/customers/{CUSTOMER}").json()["balance"] == 0.0

    def test_an_invoice_is_not_marked_paid_while_anything_is_owed(self, client, db):
        _finished(db, "RV-INV")
        assert _move(client, "RV-INV", "INVOICE").status_code == 200
        assert _move(client, "RV-INV", "PAID").status_code == 422
        _pay(client, "RV-INV", 60)
        assert _move(client, "RV-INV", "PAID").status_code == 422
        _pay(client, "RV-INV", 50)
        assert _move(client, "RV-INV", "PAID").status_code == 200


# ── 9. A job with no lines left totals zero ─────────────────────────────────


@pytest.mark.integration
class TestRemovingEveryLine:
    def test_the_job_then_totals_zero(self, client, db):
        job = _book(
            client, "ORDER", {"description": "Polo", "order_qty": 2, "price_ex": 71}
        )
        assert client.get(f"/jobs/{job}").json()["total_inc"] == 156.2
        r = client.patch(f"/jobs/{job}", json={"items": []})
        assert r.status_code == 200, r.text
        body = r.json()
        assert (body["total_ex"], body["tax"], body["total_inc"]) == (0, 0, 0)
        assert body["balance_due"] == 0

    def test_a_header_only_job_keeps_its_totals_on_a_save(self, client, db):
        # A Jim2 import carries totals and no lines; the job form saves it with
        # an empty list of lines.
        db.add(
            Job(
                id="RV-HDR",
                customer_id=CUSTOMER,
                status="ORDER",
                total_ex=100,
                tax=10,
                total_inc=110,
                deposit=0,
                balance_due=110,
            )
        )
        db.commit()
        r = client.patch("/jobs/RV-HDR", json={"items": [], "notes": "rang them"})
        assert r.status_code == 200, r.text
        assert r.json()["total_inc"] == 110

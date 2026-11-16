"""Stock, payables and documents: the gaps the re-check of the simulation found.

F01, F08, F14, F16, F21, F25 and F36 — each was fixed on its main path, and each
still had a second path, an edge case or an old record that brought the old
fault back. The decisions are in
docs/superpowers/plans/2026-10-26-simulation-gap-fixes.md.
"""

import pytest

from app.core import despatch_documents, job_weight
from app.core.reservations import committed_total
from app.core.stock_location import adjust_location
from app.models.customer import Customer
from app.models.job import Job, JobItem
from app.models.logo import Logo
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.stock_location import StockLocation
from app.models.supplier import Supplier
from app.models.supplier_bill import SupplierBill

pytestmark = pytest.mark.integration


def _customer(db, customer_id="SG-C"):
    if not db.get(Customer, customer_id):
        db.add(Customer(id=customer_id, name="Gaps Co", credit_limit=99999.0))
        db.commit()


def _job(db, job_id, items, status="ORDER", **fields):
    _customer(db)
    db.add(
        Job(
            id=job_id,
            customer_id="SG-C",
            customer_name="Gaps Co",
            status=status,
            items=items,
            **fields,
        )
    )
    db.commit()
    return db.get(Job, job_id)


def _supplier(db, supplier_id="SG-S"):
    if not db.get(Supplier, supplier_id):
        db.add(Supplier(id=supplier_id, name="Stitch Co"))
        db.commit()


def _po(db, po_id, status="Sent", lines=((10, 0, 5.0),), **header):
    """A PO, one line per (ordered, received, unit cost ex GST)."""
    _supplier(db)
    db.add(
        PurchaseOrder(
            id=po_id,
            supplier_id="SG-S",
            supplier_name="Stitch Co",
            status=status,
            order_date="2026-06-01",
            items=[
                PurchaseOrderItem(
                    sku="SG-POLO",
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


def _bill(db, po_id, amount_inc):
    bill = SupplierBill(
        supplier_id="SG-S",
        supplier_name="Stitch Co",
        po_id=po_id,
        bill_number=f"B-{po_id}",
        bill_date="2026-06-10",
        amount_ex=round(amount_inc / 1.1, 2),
        tax=round(amount_inc - amount_inc / 1.1, 2),
        amount_inc=amount_inc,
        status="pending",
    )
    db.add(bill)
    db.commit()
    return bill


def _payables(client):
    r = client.get("/reports/aged-payables", params={"as_at": "2026-06-30"})
    assert r.status_code == 200, r.text
    return r.json()


class TestReceivedButNotBilled:
    """F25: a PO received in full left committed spend, and with no bill it was
    in neither list — goods received and owed vanished from the report."""

    def test_a_received_po_with_no_bill_is_listed(self, client, db):
        _po(db, "SG-RX1", status="Received", lines=((10, 10, 5.0),), total_inc=55)
        data = _payables(client)
        assert [
            (r["po_id"], r["received_inc"], r["billed_inc"], r["outstanding_inc"])
            for r in data["received_not_billed"]
        ] == [("SG-RX1", 55.0, 0.0, 55.0)]
        assert data["totals"]["received_not_billed"] == 55.0
        assert data["committed"] == []

    def test_once_billed_it_is_owed_on_the_bill_instead(self, client, db):
        _po(db, "SG-RX2", status="Received", lines=((10, 10, 5.0),), total_inc=55)
        _bill(db, "SG-RX2", 55.0)
        data = _payables(client)
        assert data["received_not_billed"] == []
        assert data["totals"]["total"] == 55.0

    def test_a_part_received_po_is_not_counted_twice(self, client, db):
        # Still open, so all of it is committed spend; listing its received half
        # again would count those dollars twice.
        _po(db, "SG-RX3", status="Partial", lines=((10, 5, 5.0),), total_inc=55)
        data = _payables(client)
        assert data["received_not_billed"] == []
        assert [c["po_id"] for c in data["committed"]] == ["SG-RX3"]

    def test_committed_spend_totals_the_lines(self, client, db):
        # Auto-reorder used to leave total_inc at 0 (F15): the order was real,
        # and committed spend read it as nothing.
        _po(db, "SG-RX4", status="Sent", lines=((10, 0, 5.0),), total_inc=0)
        data = _payables(client)
        assert [(c["po_id"], c["unbilled"]) for c in data["committed"]] == [
            ("SG-RX4", 55.0)
        ]


class TestBillMatchSaysWhatWasOrdered:
    """F36: the match compared billed with received and never said what the PO
    ordered."""

    def test_ordered_received_and_billed(self, client, db):
        _po(db, "SG-M1", status="Partial", lines=((10, 5, 10.0),))
        bill = _bill(db, "SG-M1", 55.0)
        match = client.get(f"/ap/bills/{bill.id}").json()["po_match"]
        assert match == {
            "po_id": "SG-M1",
            "ordered_inc": 110.0,
            "received_inc": 55.0,
            "billed_inc": 55.0,
            "difference": 0.0,
            "matches": True,
        }


class TestInHouseWorkIsNotBought:
    """F16: raising a PO from requirements took an in-house logo line and
    bought it."""

    def _line(self, db, made_by, code):
        _customer(db)
        db.add(
            Logo(
                code=code,
                customer_id="SG-C",
                name=code,
                decoration_type="EMB",
                made_by=made_by,
            )
        )
        db.commit()
        logo = db.query(Logo).filter_by(code=code).one()
        job = _job(
            db,
            f"SG-{code}",
            [
                JobItem(
                    sort=0,
                    stock_code=code,
                    description="Logo",
                    order_qty=5,
                    supply_qty=5,
                    decoration_type="EMB",
                    logo_id=logo.id,
                )
            ],
        )
        return job.items[0].id

    def _raise(self, client, po_id, item_id):
        return client.post(
            "/purchase-orders/from-requirements",
            json={
                "id": po_id,
                "supplier_name": "Stitch Co",
                "requirements": [{"item_id": item_id, "qty": 5}],
            },
        )

    def test_an_in_house_logo_line_is_refused_by_name(self, client, db):
        item_id = self._line(db, "in_house", "EMB.SG.IH")
        r = self._raise(client, "SG-PO-IH", item_id)
        assert r.status_code == 422, r.text
        assert "EMB.SG.IH" in str(r.json()["detail"])
        assert db.get(PurchaseOrder, "SG-PO-IH") is None

    def test_subcontracted_work_is_still_bought(self, client, db):
        item_id = self._line(db, "subcontract", "EMB.SG.SUB")
        assert self._raise(client, "SG-PO-SUB", item_id).status_code == 200


class TestOneDefinitionOfAGoodsLine:
    """F14: what jobs reserve counted a note line with a stock code, which is
    never posted, picked or shipped."""

    def test_a_note_line_reserves_nothing(self, db):
        _job(
            db,
            "SG-NT",
            [
                JobItem(
                    sort=0,
                    display_type="product",
                    stock_code="SG-NT1",
                    order_qty=1,
                    supply_qty=1,
                ),
                JobItem(
                    sort=1,
                    display_type="note",
                    stock_code="SG-NT1",
                    order_qty=2,
                    supply_qty=2,
                ),
            ],
        )
        assert committed_total(db, "SG-NT1") == 1


class TestLocationWritesReturnTheDerivedFigure:
    """F14: POST and PATCH on a stock position answered with the stored
    counter, which drifts from the jobs (a branch move left it behind); the GET
    beside them reads the jobs."""

    def _reserve(self, db, sku, branch, qty):
        _job(
            db,
            f"SG-{sku}-{branch}",
            [
                JobItem(
                    sort=0,
                    display_type="product",
                    stock_code=sku,
                    order_qty=qty,
                    supply_qty=qty,
                )
            ],
            branch=branch,
        )

    def test_patch_returns_what_the_jobs_reserve(self, client, db, make_inventory):
        make_inventory(sku="SG-L1", stock=10)
        adjust_location(db, "SG-L1", "HQ", on_hand=10)
        db.commit()
        db.query(StockLocation).filter_by(
            sku="SG-L1", branch="HQ"
        ).one().committed_qty = 3
        db.commit()
        r = client.patch("/inventory/SG-L1/locations/HQ", json={"zone": "A"})
        assert r.status_code == 200, r.text
        assert (r.json()["committed_qty"], r.json()["available_qty"]) == (0, 10)

    def test_post_returns_what_the_jobs_reserve(self, client, db, make_inventory):
        make_inventory(sku="SG-L2", stock=0)
        self._reserve(db, "SG-L2", "AF", 4)
        r = client.post(
            "/inventory/SG-L2/locations",
            json={"branch": "AF", "qty_on_hand": 10, "committed_qty": 99},
        )
        assert r.status_code == 200, r.text
        assert (r.json()["committed_qty"], r.json()["available_qty"]) == (4, 6)


class TestABoughtInGarmentIsWeighed:
    """F08: a goods line whose code is not a stock item was neither weighed
    nor flagged — 10 bought-in polos at 0.3 kg read as 0 kg, no warning."""

    def test_weighed_by_its_own_weight_or_flagged(self, db):
        job = _job(
            db,
            "SG-WT",
            [
                JobItem(
                    sort=0,
                    display_type="product",
                    stock_code="BUYIN-POLO",
                    order_qty=10,
                    qty=10,
                    weight_kg=0.3,
                ),
                JobItem(
                    sort=1,
                    display_type="product",
                    stock_code="BUYIN-TEE",
                    order_qty=4,
                    qty=4,
                ),
            ],
        )
        assert job_weight.order_weight(job, db) == 3.0
        assert job_weight.unweighed_lines(job, db) == ["BUYIN-TEE"]


class TestTheDeliveryNoteSaysWhatIsGoing:
    """F21: the note printed the order quantity for a line not yet supplied or
    picked, as though it were in the carton."""

    def test_going_and_back_ordered(self, client, db):
        job = _job(
            db,
            "SG-DN",
            [
                JobItem(sort=0, stock_code="JKT-L", order_qty=3, supply_qty=0, b_ord=3),
                JobItem(sort=1, stock_code="POLO-M", order_qty=5, supply_qty=2),
                JobItem(
                    sort=2, stock_code="TEE-S", order_qty=5, supply_qty=5, qty_pick=4
                ),
            ],
            status="Desp/Ready",
        )
        assert [
            (it.stock_code, going, back_ordered)
            for it, going, back_ordered in despatch_documents.delivery_lines(job)
        ] == [("JKT-L", 0, 3), ("POLO-M", 2, 3), ("TEE-S", 4, 1)]
        r = client.get("/jobs/SG-DN/pdf", params={"type": "delivery-note"})
        assert r.status_code == 200, r.text


class TestPortalOrdersBookedTwice:
    """F01: the refusal stops a new repeat; older ones are already in the data,
    and a unique index would fail the deploy. The health check lists them."""

    def test_listed_by_customer_and_order_number(self, client, db):
        _customer(db)
        for job_id, serial, status in (
            ("SG-W1", "WEB-1", "New"),
            ("SG-W2", "web-1\n", "ORDER"),
            ("SG-W3", "WEB-1", "CANCEL"),
            ("SG-W4", "WEB-2", "New"),
        ):
            db.add(
                Job(
                    id=job_id,
                    customer_id="SG-C",
                    customer_name="Gaps Co",
                    item_no="NOP.ONLINE",
                    serial_no=serial,
                    status=status,
                )
            )
        db.commit()
        rows = client.get("/accounting/health").json()["portal_orders_booked_twice"]
        assert rows == [
            {
                "customer_id": "SG-C",
                "customer": "Gaps Co",
                "order_no": "WEB-1",
                "job_ids": ["SG-W1", "SG-W2"],
            }
        ]

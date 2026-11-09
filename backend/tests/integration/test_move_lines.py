"""Moving lines to another job (docs/superpowers/specs/2026-11-08-move-lines.md).

Lines go to another open job of the same customer; the stock they reserve goes
with them; a garment takes its decoration; nothing on order or already sent
moves.
"""

import pytest

from app.models.customer import Customer
from app.models.inventory import InventoryItem
from app.models.job import Job, JobComment, JobItem
from app.models.logo import Logo

pytestmark = pytest.mark.integration


def _setup(db):
    if not db.get(Customer, "MV-C"):
        db.add(Customer(id="MV-C", name="Move Co", credit_limit=99999.0))
        db.add(Customer(id="MV-D", name="Other Co", credit_limit=99999.0))
        db.add(
            InventoryItem(
                sku="MV-TEE", name="Tee", stock=50, unit_cost=5, sell_price=10
            )
        )
        db.add(
            InventoryItem(sku="MV-CAP", name="Cap", stock=50, unit_cost=3, sell_price=8)
        )
        db.commit()


def _make(client, db, status="ORDER", customer="MV-C", lines=None):
    _setup(db)
    lines = lines or [
        {"sort": 0, "stock_code": "MV-TEE", "order_qty": 4, "price_ex": 10},
        {"sort": 1, "stock_code": "MV-CAP", "order_qty": 2, "price_ex": 8},
    ]
    r = client.post(
        "/jobs", json={"customer_id": customer, "status": status, "items": lines}
    )
    assert r.status_code == 200, r.text
    return r.json()


def _item_ids(job, code):
    return [i["id"] for i in job["items"] if i["stock_code"] == code]


def _committed(db, sku):
    db.expire_all()
    return db.query(InventoryItem).filter_by(sku=sku).one().committed_qty


def _move(client, job_id, item_ids, to_job_id):
    return client.post(
        f"/jobs/{job_id}/move-lines",
        json={"item_ids": item_ids, "to_job_id": to_job_id},
    )


class TestMovingLines:
    def test_lines_go_to_the_end_of_the_other_job_with_their_prices(self, client, db):
        a, b = _make(client, db), _make(client, db)
        r = _move(client, a["id"], _item_ids(a, "MV-CAP"), b["id"])
        assert r.status_code == 200, r.text
        a2, b2 = (
            client.get(f"/jobs/{a['id']}").json(),
            client.get(f"/jobs/{b['id']}").json(),
        )
        assert [i["stock_code"] for i in a2["items"]] == ["MV-TEE"]
        assert [i["stock_code"] for i in b2["items"]] == ["MV-TEE", "MV-CAP", "MV-CAP"]
        moved = b2["items"][-1]
        assert float(moved["price_ex"]) == 8.0 and moved["order_qty"] == 2

    def test_both_totals_are_the_lines(self, client, db):
        a, b = _make(client, db), _make(client, db)
        _move(client, a["id"], _item_ids(a, "MV-CAP"), b["id"])
        a2, b2 = (
            client.get(f"/jobs/{a['id']}").json(),
            client.get(f"/jobs/{b['id']}").json(),
        )
        assert float(a2["total_ex"]) == 40.0
        assert float(b2["total_ex"]) == 72.0

    def test_two_open_orders_keep_the_stock_reserved_once(self, client, db):
        a, b = _make(client, db), _make(client, db)
        before = _committed(db, "MV-CAP")
        _move(client, a["id"], _item_ids(a, "MV-CAP"), b["id"])
        assert _committed(db, "MV-CAP") == before == 4

    def test_to_a_booked_job_the_reservation_is_released(self, client, db):
        a = _make(client, db)
        booked = _make(client, db, status="New")
        assert _committed(db, "MV-CAP") == 2
        _move(client, a["id"], _item_ids(a, "MV-CAP"), booked["id"])
        assert _committed(db, "MV-CAP") == 0

    def test_from_a_quote_to_an_order_it_is_reserved(self, client, db):
        quote = _make(client, db, status="QUOTE")
        order = _make(client, db)
        _move(client, quote["id"], _item_ids(quote, "MV-TEE"), order["id"])
        assert _committed(db, "MV-TEE") == 8

    def test_a_garment_takes_its_decoration_with_it(self, client, db):
        _setup(db)
        db.add(Logo(code="EMB.MV", customer_id="MV-C", decoration_type="EMB"))
        db.commit()
        logo = db.query(Logo).filter_by(code="EMB.MV").one()
        a = _make(
            client,
            db,
            lines=[
                {"sort": 0, "stock_code": "MV-TEE", "order_qty": 4, "price_ex": 10},
                {
                    "sort": 1,
                    "stock_code": "EMB.MV",
                    "order_qty": 4,
                    "price_ex": 3,
                    "logo_id": logo.id,
                    "applies_to_line": 0,
                },
            ],
        )
        b = _make(client, db)
        tee = _item_ids(a, "MV-TEE")
        assert _move(client, a["id"], tee, b["id"]).status_code == 200
        b2 = client.get(f"/jobs/{b['id']}").json()
        moved_tee = b2["items"][-2]
        moved_logo = b2["items"][-1]
        assert moved_logo["stock_code"] == "EMB.MV"
        assert moved_logo["applies_to_item_id"] == moved_tee["id"]
        assert client.get(f"/jobs/{a['id']}").json()["items"] == []

    def test_a_decoration_alone_is_refused(self, client, db):
        _setup(db)
        db.add(Logo(code="EMB.MV2", customer_id="MV-C", decoration_type="EMB"))
        db.commit()
        logo = db.query(Logo).filter_by(code="EMB.MV2").one()
        a = _make(
            client,
            db,
            lines=[
                {"sort": 0, "stock_code": "MV-TEE", "order_qty": 4, "price_ex": 10},
                {
                    "sort": 1,
                    "stock_code": "EMB.MV2",
                    "order_qty": 4,
                    "price_ex": 3,
                    "logo_id": logo.id,
                    "applies_to_line": 0,
                },
            ],
        )
        b = _make(client, db)
        r = _move(client, a["id"], _item_ids(a, "EMB.MV2"), b["id"])
        assert r.status_code == 422
        assert "applies to" in r.json()["detail"]

    def test_the_trail_says_where_on_both_jobs(self, client, db):
        a, b = _make(client, db), _make(client, db)
        _move(client, a["id"], _item_ids(a, "MV-CAP"), b["id"])
        said = {
            c.job_id: c.comment
            for c in db.query(JobComment).filter(
                JobComment.job_id.in_([a["id"], b["id"]])
            )
            if "moved" in c.comment
        }
        assert said[a["id"]] == f"Line 2 moved to job {b['id']}"
        assert said[b["id"]] == f"Line 3 moved here from job {a['id']}"

    def test_both_versions_move(self, client, db):
        a, b = _make(client, db), _make(client, db)
        va, vb = a["version"], b["version"]
        _move(client, a["id"], _item_ids(a, "MV-CAP"), b["id"])
        assert client.get(f"/jobs/{a['id']}").json()["version"] != va
        assert client.get(f"/jobs/{b['id']}").json()["version"] != vb


class TestWhatDoesNotMove:
    def test_another_customers_job(self, client, db):
        a, other = _make(client, db), _make(client, db, customer="MV-D")
        assert (
            _move(client, a["id"], _item_ids(a, "MV-CAP"), other["id"]).status_code
            == 422
        )

    @pytest.mark.parametrize("status", ["FINISH", "INVOICE", "CANCEL"])
    def test_to_or_from_a_job_that_is_not_open(self, client, db, status):
        a, b = _make(client, db), _make(client, db)
        db.query(Job).filter_by(id=b["id"]).update({"status": status})
        db.commit()
        assert (
            _move(client, a["id"], _item_ids(a, "MV-CAP"), b["id"]).status_code == 409
        )
        assert (
            _move(client, b["id"], _item_ids(b, "MV-CAP"), a["id"]).status_code == 409
        )

    def test_a_locked_job(self, client, db):
        a, b = _make(client, db), _make(client, db)
        db.query(Job).filter_by(id=b["id"]).update({"locked": True})
        db.commit()
        assert _move(client, a["id"], _item_ids(a, "MV-CAP"), b["id"]).status_code in (
            409,
            423,
        )

    def test_a_line_still_on_order(self, client, db):
        a, b = _make(client, db), _make(client, db)
        cap = _item_ids(a, "MV-CAP")[0]
        db.query(JobItem).filter_by(id=cap).update({"po_no": "PO-1", "b_ord": 2})
        db.commit()
        r = _move(client, a["id"], [cap], b["id"])
        assert r.status_code == 422
        assert "on order" in r.json()["detail"]

    def test_a_line_already_sent(self, client, db):
        a, b = _make(client, db), _make(client, db)
        cap = _item_ids(a, "MV-CAP")[0]
        db.query(JobItem).filter_by(id=cap).update({"qty_delivered": 1})
        db.commit()
        assert _move(client, a["id"], [cap], b["id"]).status_code == 422

    def test_a_line_of_another_job(self, client, db):
        a, b = _make(client, db), _make(client, db)
        r = _move(client, a["id"], _item_ids(b, "MV-CAP"), b["id"])
        assert r.status_code == 422

    def test_to_itself(self, client, db):
        a = _make(client, db)
        assert (
            _move(client, a["id"], _item_ids(a, "MV-CAP"), a["id"]).status_code == 422
        )

    def test_overseas_staff_do_not_edit_lines(self, client, client_as, db):
        a, b = _make(client, db), _make(client, db)
        floor = client_as("overseas_staff")
        assert _move(floor, a["id"], _item_ids(a, "MV-CAP"), b["id"]).status_code == 403

"""F21 round 2: each despatch records what it sent of each line.

A job line's picked and supplied quantities are running totals. A further
consignment (F22's `again`) printed them as the carton's contents, so the
second delivery note said 5 went when 3 did.
"""

import pytest

from app.core import despatch_documents
from app.models.customer import Customer
from app.models.dispatch_session import DispatchLineItem
from app.models.job import Job, JobItem

pytestmark = pytest.mark.integration


def _job(db, job_id, items, status="Desp/Ready"):
    if not db.get(Customer, "DL-C"):
        db.add(Customer(id="DL-C", name="Lines Co", credit_limit=99999.0))
    db.add(
        Job(
            id=job_id,
            customer_id="DL-C",
            customer_name="Lines Co",
            status=status,
            items=items,
        )
    )
    db.commit()
    return db.get(Job, job_id)


def _send(client, job_id, ref, **extra):
    return client.post(
        f"/jobs/{job_id}/dispatch",
        json={"ship_via": "TNT", "ship_ref": ref, **extra},
    )


def _note(db, job_id):
    db.expire_all()
    return [
        (it.stock_code, going, back_ordered)
        for it, going, back_ordered in despatch_documents.delivery_lines(
            db.get(Job, job_id)
        )
    ]


def _back_ordered_sizes_follow(db, job_id):
    """The back-ordered three arrive and are picked: the line's totals run on."""
    db.expire_all()
    line = db.get(Job, job_id).items[0]
    line.supply_qty, line.qty_pick, line.b_ord = 5, 5, 0
    db.commit()
    return line.id


class TestEachConsignmentRecordsWhatItSent:
    def test_a_further_consignment_sends_and_prints_only_the_rest(self, client, db):
        job = _job(
            db,
            "DL-1",
            [
                JobItem(
                    sort=0,
                    stock_code="POLO-M",
                    order_qty=5,
                    supply_qty=2,
                    qty_pick=2,
                    b_ord=3,
                )
            ],
        )
        line_id = job.items[0].id

        first = _send(client, "DL-1", "C1")
        assert first.status_code == 200, first.text
        assert first.json()["despatched"] == [{"job_item_id": line_id, "qty": 2}]
        assert _note(db, "DL-1") == [("POLO-M", 2, 3)]

        _back_ordered_sizes_follow(db, "DL-1")
        second = _send(client, "DL-1", "C2", again=True)
        assert second.status_code == 200, second.text
        assert second.json()["connote"] == "C1, C2"
        assert second.json()["despatched"] == [{"job_item_id": line_id, "qty": 3}]
        # The C2 note: the three in this carton, nothing still to come.
        assert _note(db, "DL-1") == [("POLO-M", 3, 0)]
        r = client.get("/jobs/DL-1/pdf", params={"type": "delivery-note"})
        assert r.status_code == 200, r.text

    def test_a_line_with_nothing_new_is_not_in_the_consignment(self, client, db):
        job = _job(
            db,
            "DL-2",
            [
                JobItem(
                    sort=0, stock_code="POLO-M", order_qty=5, supply_qty=2, b_ord=3
                ),
                JobItem(sort=1, stock_code="CAP", order_qty=4, supply_qty=4),
            ],
        )
        polo, cap = (it.id for it in job.items)
        assert _send(client, "DL-2", "C1").status_code == 200
        _back_ordered_sizes_follow(db, "DL-2")

        r = _send(client, "DL-2", "C2", again=True)
        assert r.status_code == 200, r.text
        assert r.json()["despatched"] == [{"job_item_id": polo, "qty": 3}]
        # The caps went in C1: not in this carton, and not owed either, so the
        # C2 note does not name them (S2-20).
        assert _note(db, "DL-2") == [("POLO-M", 3, 0)]
        sent = {
            (row.job_item_id, row.qty)
            for row in db.query(DispatchLineItem).filter(
                DispatchLineItem.job_item_id.in_([polo, cap])
            )
        }
        assert sent == {(polo, 2), (cap, 4), (polo, 3)}


class TestNothingLeftToSend:
    def test_a_further_consignment_with_nothing_new_is_a_409(self, client, db):
        _job(
            db,
            "DL-3",
            [JobItem(sort=0, stock_code="TEE", order_qty=5, supply_qty=5, qty_pick=5)],
        )
        assert _send(client, "DL-3", "C1").status_code == 200
        r = _send(client, "DL-3", "C2", again=True)
        assert r.status_code == 409, r.text
        assert "nothing left to send" in r.json()["detail"]
        db.expire_all()
        assert db.get(Job, "DL-3").connote == "C1"

    def test_goods_with_nothing_picked_or_supplied_are_a_409(self, client, db):
        _job(
            db,
            "DL-4",
            [JobItem(sort=0, stock_code="JKT", order_qty=3, supply_qty=0, b_ord=3)],
        )
        r = _send(client, "DL-4", "C1")
        assert r.status_code == 409, r.text
        db.expire_all()
        assert db.get(Job, "DL-4").dispatched_at is None
        assert db.query(DispatchLineItem).count() == 0

    def test_a_batch_names_the_job_with_nothing_to_send(self, client, db):
        # Left out and named while the rest go (S2-20); it refused the batch.
        _job(
            db,
            "DL-5",
            [JobItem(sort=0, stock_code="JKT", order_qty=3, supply_qty=0, b_ord=3)],
        )
        _job(db, "DL-6", [JobItem(sort=0, stock_code="CAP", order_qty=2, supply_qty=2)])
        r = client.post(
            "/dispatch-sessions",
            json={"lines": [{"job_id": "DL-6"}, {"job_id": "DL-5"}]},
        )
        assert r.status_code == 200, r.text
        assert [s["job_id"] for s in r.json()["skipped"]] == ["DL-5"]
        db.expire_all()
        assert db.get(Job, "DL-6").dispatched_at is not None
        assert db.get(Job, "DL-5").dispatched_at is None


class TestTheSessionShowsWhatWent:
    def test_create_and_detail_list_each_lines_quantities(self, client, db):
        job = _job(
            db,
            "DL-7",
            [
                JobItem(sort=0, stock_code="POLO-M", order_qty=5, supply_qty=5),
                JobItem(sort=1, display_type="note", description="Fold, do not hang"),
            ],
        )
        polo = job.items[0].id
        r = client.post(
            "/dispatch-sessions",
            json={"lines": [{"job_id": "DL-7", "ship_via": "TNT", "ship_ref": "X1"}]},
        )
        assert r.status_code == 200, r.text
        assert r.json()["lines"][0]["items"] == [{"job_item_id": polo, "qty": 5}]
        detail = client.get(f"/dispatch-sessions/{r.json()['id']}").json()
        assert detail["lines"][0]["items"] == [{"job_item_id": polo, "qty": 5}]

    def test_a_job_with_no_goods_lines_still_goes(self, client, db):
        # Decorating the customer's own garments: the work goes back, and
        # there is no line of ours to count.
        _job(db, "DL-8", [], status="Pick/Pack")
        r = _send(client, "DL-8", "C1")
        assert r.status_code == 200, r.text
        assert r.json()["despatched"] == []

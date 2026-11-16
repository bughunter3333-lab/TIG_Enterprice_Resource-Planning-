"""The job status ladder, and what despatching a job records.

Simulation findings F22, F30, F32 and F33, with the owner's decision of
2026-10-25 for F30: add Desp/Ready — packed, waiting for the carrier — before
FINISH, and let staff move a job forward past steps it does not need, as TIG
does in bulk. And the verifier's note that admins bypassed the ladder entirely.

- F30: non-admins had to walk every step, and nothing meant "packed, waiting
  for the carrier";
- F32: FINISH stamped dispatched_at whether or not anything had gone out;
- F22: despatch did not check the job was ready, record where it went, or put
  the connote on the job — it lived in a comment;
- F33: unprinting left the job saying 'invoiced', with the old invoice date.
"""

import pytest

from app.models.customer import Customer
from app.models.customer_ship_to import CustomerShipTo
from app.models.dispatch_session import DispatchSessionLine
from app.models.job import Job


def _customer(db):
    if not db.get(Customer, "SL-C"):
        db.add(Customer(id="SL-C", name="Ladder Co", credit_limit=99999.0))
        db.commit()
    return "SL-C"


def _job(db, job_id, status, total_ex=100.0, **fields):
    _customer(db)
    db.add(
        Job(
            id=job_id,
            customer_id="SL-C",
            customer_name="Ladder Co",
            status=status,
            total_ex=total_ex,
            tax=round(total_ex * 0.1, 2),
            total_inc=round(total_ex * 1.1, 2),
            balance_due=round(total_ex * 1.1, 2),
            deposit=0,
            **fields,
        )
    )
    db.commit()


def _move(client, job_id, status):
    return client.post(f"/jobs/{job_id}/status", json={"status": status})


def _reload(db, job_id):
    db.expire_all()
    return db.get(Job, job_id)


# ── F30: Desp/Ready, and forward past steps a job does not need ──────────────


@pytest.mark.integration
class TestTheLadder:
    @pytest.fixture
    def staff(self, client_as):
        return client_as("staff")

    def test_staff_can_skip_steps_a_job_does_not_need(self, staff, db):
        _job(db, "SL-1", "ORDER")
        assert _move(staff, "SL-1", "Pick/Pack").status_code == 200

    def test_desp_ready_sits_between_packing_and_finish(self, staff, db):
        _job(db, "SL-2", "Pick/Pack")
        assert _move(staff, "SL-2", "Desp/Ready").status_code == 200
        assert _move(staff, "SL-2", "FINISH").status_code == 200

    def test_a_job_cannot_skip_into_invoice(self, staff, db):
        _job(db, "SL-3", "ORDER")
        r = _move(staff, "SL-3", "INVOICE")
        assert r.status_code == 422
        assert _reload(db, "SL-3").status == "ORDER"

    def test_staff_go_back_one_step_not_two(self, staff, db):
        _job(db, "SL-4", "Pick/Pack")
        _job(db, "SL-5", "Pick/Pack")
        assert _move(staff, "SL-4", "PRINT").status_code == 200
        assert _move(staff, "SL-5", "ORDER").status_code == 422

    def test_an_admin_may_go_further_back(self, client, db):
        _job(db, "SL-6", "Pick/Pack")
        assert _move(client, "SL-6", "ORDER").status_code == 200

    def test_an_admin_does_not_jump_the_ladder_into_invoice(self, client, db):
        _job(db, "SL-7", "QUOTE")
        r = _move(client, "SL-7", "INVOICE")
        assert r.status_code == 422
        assert _reload(db, "SL-7").status == "QUOTE"

    def test_desp_ready_still_holds_its_stock(self, client, db, make_inventory):
        make_inventory(sku="SL-SKU", stock=10)
        r = client.post(
            "/jobs",
            json={
                "customer_id": _customer(db),
                "status": "ORDER",
                "items": [{"stock_code": "SL-SKU", "order_qty": 4}],
            },
        )
        job_id = r.json()["id"]
        assert _move(client, job_id, "Desp/Ready").status_code == 200
        listed = next(
            i for i in client.get("/inventory").json() if i["sku"] == "SL-SKU"
        )
        assert listed["committed_qty"] == 4


# ── F32 + F22: despatch is what says the goods went ──────────────────────────


@pytest.mark.integration
class TestDespatch:
    def _despatch(self, client, job_id, **fields):
        return client.post(
            f"/jobs/{job_id}/dispatch",
            json={
                "ship_via": "StarTrack",
                "ship_ref": "CN88421",
                "cartons": 2,
                **fields,
            },
        )

    def test_finish_alone_does_not_say_the_goods_went(self, client, db):
        _job(db, "SD-1", "Desp/Ready")
        assert _move(client, "SD-1", "FINISH").status_code == 200
        assert _reload(db, "SD-1").dispatched_at is None

    def test_despatching_a_ready_job_finishes_it(self, client, db):
        _job(db, "SD-2", "Desp/Ready")
        r = self._despatch(client, "SD-2")
        assert r.status_code == 200, r.text
        job = _reload(db, "SD-2")
        assert job.status == "FINISH"
        assert job.dispatched_at
        assert (job.ship_via, job.connote) == ("StarTrack", "CN88421")

    def test_a_job_still_in_production_cannot_be_despatched(self, client, db):
        _job(db, "SD-3", "PRINT")
        r = self._despatch(client, "SD-3")
        assert r.status_code == 409
        assert _reload(db, "SD-3").dispatched_at is None

    def test_where_it_went_is_recorded(self, client, db):
        _job(db, "SD-4", "Desp/Ready")
        site = CustomerShipTo(
            customer_id="SL-C",
            code="SITE.013",
            name="Kalgoorlie Site",
            address="1 Mine Rd",
            city="Kalgoorlie",
            state="WA",
            postcode="6430",
        )
        db.add(site)
        db.commit()
        job = db.get(Job, "SD-4")
        job.ship_to, job.ship_to_id = "SITE.013", site.id
        db.commit()
        self._despatch(client, "SD-4")
        (line,) = db.query(DispatchSessionLine).filter_by(job_id="SD-4").all()
        assert line.ship_to == "SITE.013"
        assert "Kalgoorlie" in line.address
        assert (line.ship_via, line.ship_ref, line.cartons) == (
            "StarTrack",
            "CN88421",
            2,
        )

    def test_one_job_despatched_has_a_despatch_number_too(self, client, db):
        _job(db, "SD-5", "Desp/Ready")
        self._despatch(client, "SD-5")
        assert db.query(DispatchSessionLine).filter_by(job_id="SD-5").count() == 1

    def test_a_despatch_batch_finishes_ready_jobs_and_writes_their_connotes(
        self, client, db
    ):
        _job(db, "SD-6", "Desp/Ready")
        _job(db, "SD-7", "Desp/Ready")
        r = client.post(
            "/dispatch-sessions",
            json={
                "lines": [
                    {"job_id": "SD-6", "ship_via": "TNT", "ship_ref": "T-1"},
                    {"job_id": "SD-7", "ship_via": "TNT", "ship_ref": "T-2"},
                ]
            },
        )
        assert r.status_code == 200, r.text
        assert [
            (_reload(db, j).status, _reload(db, j).connote) for j in ("SD-6", "SD-7")
        ] == [
            ("FINISH", "T-1"),
            ("FINISH", "T-2"),
        ]

    def test_a_batch_with_a_job_not_ready_moves_none(self, client, db):
        _job(db, "SD-8", "Desp/Ready")
        _job(db, "SD-9", "ORDER")
        r = client.post(
            "/dispatch-sessions",
            json={"lines": [{"job_id": "SD-8"}, {"job_id": "SD-9"}]},
        )
        assert r.status_code == 409
        assert "SD-9" in r.json()["detail"]
        assert _reload(db, "SD-8").status == "Desp/Ready"

    def test_ready_and_invoiced_in_one_go(self, client, db):
        _job(db, "SD-10", "Desp/Ready")
        r = self._despatch(client, "SD-10", advance_status=True)
        assert r.status_code == 200, r.text
        assert _reload(db, "SD-10").status == "INVOICE"


# ── F20: Auto Pick across the despatch list ──────────────────────────────────


@pytest.mark.integration
class TestAutoPick:
    """Portal work is many small jobs; picking them one request at a time, each
    listing every line id, is the cost Jim2's Auto Pick takes away."""

    def _with_line(self, client, db, make_inventory, sku, on_hand, qty):
        if not db.query(Job).filter(Job.customer_id == "SL-C").first():
            _customer(db)
        make_inventory(sku=sku, stock=on_hand)
        r = client.post(
            "/jobs",
            json={
                "customer_id": _customer(db),
                "status": "Pick/Pack",
                "items": [{"stock_code": sku, "order_qty": qty}],
            },
        )
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_every_job_is_picked_to_what_it_supplies(self, client, db, make_inventory):
        a = self._with_line(client, db, make_inventory, "AP-1", 10, 2)
        b = self._with_line(client, db, make_inventory, "AP-2", 10, 3)
        r = client.post("/jobs/auto-pick", json={"job_ids": [a, b]})
        assert r.status_code == 200, r.text
        assert {j["job_id"]: j["all_picked"] for j in r.json()["jobs"]} == {
            a: True,
            b: True,
        }
        db.expire_all()
        lines = db.query(Job).filter(Job.id.in_([a, b])).all()
        assert {(i.qty_pick, i.item_status) for job in lines for i in job.items} == {
            (2, "Picked"),
            (3, "Picked"),
        }

    def test_a_job_waiting_on_stock_is_picked_as_far_as_it_can_be(
        self, client, db, make_inventory
    ):
        short = self._with_line(client, db, make_inventory, "AP-3", 1, 3)
        r = client.post("/jobs/auto-pick", json={"job_ids": [short]})
        (job,) = r.json()["jobs"]
        assert job["all_picked"] is False
        db.expire_all()
        (line,) = db.get(Job, short).items
        assert (line.qty_pick, line.item_status) == (1, "Partial")

    def test_a_job_that_cannot_be_picked_does_not_stop_the_rest(
        self, client, db, make_inventory
    ):
        ok = self._with_line(client, db, make_inventory, "AP-4", 10, 1)
        locked = self._with_line(client, db, make_inventory, "AP-5", 10, 1)
        db.get(Job, locked).locked = True
        db.commit()
        body = client.post(
            "/jobs/auto-pick", json={"job_ids": [ok, locked, "NOPE"]}
        ).json()
        assert [j["job_id"] for j in body["jobs"]] == [ok]
        assert {f["job_id"] for f in body["failed"]} == {locked, "NOPE"}


# ── F33: unprinting takes the invoice back, all of it ────────────────────────


@pytest.mark.integration
class TestUnprint:
    def test_unprint_leaves_the_job_not_invoiced(self, client, db):
        _job(db, "SU-1", "FINISH", invoice="INV-SU1")
        assert _move(client, "SU-1", "INVOICE").status_code == 200
        assert client.post("/jobs/SU-1/unprint").status_code == 200
        job = _reload(db, "SU-1")
        assert (job.status, job.invoice_status, job.invoice_date) == (
            "FINISH",
            "not_invoiced",
            None,
        )

    def test_reinvoicing_keeps_the_number_and_dates_it_again(self, client, db):
        _job(db, "SU-2", "FINISH", invoice="INV-SU2")
        _move(client, "SU-2", "INVOICE")
        job = _reload(db, "SU-2")
        job.invoice_date = "2026-01-01"  # as if invoiced in January
        db.commit()
        client.post("/jobs/SU-2/unprint")
        assert _move(client, "SU-2", "INVOICE").status_code == 200
        job = _reload(db, "SU-2")
        assert job.invoice == "INV-SU2"
        assert job.invoice_date != "2026-01-01"

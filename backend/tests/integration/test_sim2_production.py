"""Production and despatch: the 2026-11-01 simulation.

docs/backlog.md, SIM2:

- S2-15: a job reached PRINT with its logo's proof never approved;
- S2-20 (in part): one job with nothing to send refused a whole despatch
  batch, and a further consignment's note listed lines not in the carton.
"""

from datetime import date, timedelta

import pytest

from app.core import despatch_documents
from app.models.customer import Customer
from app.models.job import Job, JobItem
from app.models.logo import Logo

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def setup(db, make_inventory):
    db.add(Customer(id="AGED", name="Aged Care Co", credit_limit=99999.0))
    db.commit()
    make_inventory(sku="TOP-M", stock=20)
    make_inventory(sku="TOP-3XL", stock=0)


def _book(client, *lines):
    r = client.post(
        "/jobs", json={"customer_id": "AGED", "status": "ORDER", "items": list(lines)}
    )
    assert r.status_code == 200, r.text
    return r.json()


def _move(client, job_id, status):
    return client.post(f"/jobs/{job_id}/status", json={"status": status})


# ── S2-15: the proof gate ────────────────────────────────────────────────────


class TestPrintWaitsForTheProof:
    @pytest.fixture
    def job(self, client, db):
        db.add(
            Logo(
                code="EMB.AGED.LC",
                customer_id="AGED",
                name="Left chest",
                decoration_type="EMB",
                made_by="in_house",
            )
        )
        db.commit()
        return _book(
            client,
            {"stock_code": "TOP-M", "order_qty": 2, "price_ex": 20},
            {"stock_code": "EMB.AGED.LC", "order_qty": 2, "sort": 1},
        )

    def _approve(self, client, db, status="approved"):
        logo = db.query(Logo).filter_by(code="EMB.AGED.LC").one()
        r = client.post(f"/logos/{logo.id}/proof", json={"status": status})
        assert r.status_code == 200, r.text

    def test_print_is_refused_naming_the_logo(self, client, job):
        r = _move(client, job["id"], "PRINT")
        assert r.status_code == 422
        assert "EMB.AGED.LC" in r.json()["detail"]

    def test_skipping_past_print_is_refused_too(self, client, job):
        assert _move(client, job["id"], "Pick/Pack").status_code == 422

    def test_a_proof_only_sent_is_not_approved(self, client, db, job):
        self._approve(client, db, "sent")
        assert _move(client, job["id"], "PRINT").status_code == 422

    def test_approved_it_goes_to_print(self, client, db, job):
        self._approve(client, db)
        assert _move(client, job["id"], "PRINT").status_code == 200

    def test_a_job_brought_back_to_print_is_not_held(self, client, db, job):
        self._approve(client, db)
        assert _move(client, job["id"], "Pick/Pack").status_code == 200
        self._approve(client, db, "rejected")
        assert _move(client, job["id"], "PRINT").status_code == 200

    def test_from_a_quote_or_on_creation_it_is_held_too(self, client, db, job):
        quote = client.post(
            "/jobs",
            json={
                "customer_id": "AGED",
                "status": "QUOTE",
                "items": [{"stock_code": "EMB.AGED.LC", "order_qty": 1}],
            },
        ).json()
        assert _move(client, quote["id"], "PRINT").status_code == 422
        r = client.post(
            "/jobs",
            json={
                "customer_id": "AGED",
                "status": "PRINT",
                "items": [{"stock_code": "EMB.AGED.LC", "order_qty": 1}],
            },
        )
        assert r.status_code == 422
        assert db.query(Job).count() == 2  # the fixture's job and the quote

    def test_a_job_with_no_logo_is_not_held(self, client):
        plain = _book(client, {"stock_code": "TOP-M", "order_qty": 1, "price_ex": 20})
        assert _move(client, plain["id"], "PRINT").status_code == 200


# ── S2-20: despatch batches and further consignments ─────────────────────────


def _packed(client, *lines):
    job = _book(client, *lines)
    assert _move(client, job["id"], "Pick/Pack").status_code == 200
    return job


def _despatch(client, *job_ids, again=False):
    return client.post(
        "/dispatch-sessions",
        json={"lines": [{"job_id": j, "again": again} for j in job_ids]},
    )


class TestADespatchBatch:
    def test_a_job_with_nothing_to_send_is_left_out_and_named(self, client, db):
        ready = _packed(client, {"stock_code": "TOP-M", "order_qty": 2, "price_ex": 20})
        waiting = _packed(
            client, {"stock_code": "TOP-3XL", "order_qty": 1, "price_ex": 20}
        )
        r = _despatch(client, ready["id"], waiting["id"])
        assert r.status_code == 200, r.text
        assert [line["job_id"] for line in r.json()["lines"]] == [ready["id"]]
        assert [s["job_id"] for s in r.json()["skipped"]] == [waiting["id"]]
        db.expire_all()
        assert db.get(Job, ready["id"]).status == "FINISH"
        assert db.get(Job, waiting["id"]).status == "Pick/Pack"

    def test_a_batch_with_nothing_to_send_at_all_is_refused(self, client):
        waiting = _packed(
            client, {"stock_code": "TOP-3XL", "order_qty": 1, "price_ex": 20}
        )
        r = _despatch(client, waiting["id"])
        assert r.status_code == 409
        assert "Nothing was despatched" in r.json()["detail"]

    def test_any_other_refusal_still_refuses_the_batch(self, client, db):
        ready = _packed(client, {"stock_code": "TOP-M", "order_qty": 2, "price_ex": 20})
        unpacked = _book(
            client, {"stock_code": "TOP-M", "order_qty": 1, "price_ex": 20}
        )
        r = _despatch(client, ready["id"], unpacked["id"])
        assert r.status_code == 409
        db.expire_all()
        assert db.get(Job, ready["id"]).status == "Pick/Pack"


class TestTheDespatchDate:
    """B1-07: a consignment after the carrier's cut-off goes the next day."""

    def test_a_batch_dated_tomorrow_goes_tomorrow(self, client, db):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        job = _packed(client, {"stock_code": "TOP-M", "order_qty": 2, "price_ex": 20})
        r = client.post(
            "/dispatch-sessions",
            json={"lines": [{"job_id": job["id"]}], "despatch_date": tomorrow},
        )
        assert r.status_code == 200, r.text
        assert r.json()["lines"][0]["despatch_date"] == tomorrow
        db.expire_all()
        assert db.get(Job, job["id"]).dispatched_at == tomorrow

    def test_undated_it_goes_today(self, client, db):
        job = _packed(client, {"stock_code": "TOP-M", "order_qty": 2, "price_ex": 20})
        r = _despatch(client, job["id"])
        assert r.json()["lines"][0]["despatch_date"] == date.today().isoformat()

    @pytest.mark.parametrize("days", [-31, 15])
    def test_the_browsers_day_ahead_of_the_servers_is_taken(self, client, db, days):
        # Sydney is a day ahead of the API's UTC until 10 or 11 am: the
        # screen's furthest date, a day further on the server, is not refused.
        job = _packed(client, {"stock_code": "TOP-M", "order_qty": 2, "price_ex": 20})
        r = client.post(
            "/dispatch-sessions",
            json={
                "lines": [{"job_id": job["id"]}],
                "despatch_date": (date.today() + timedelta(days=days)).isoformat(),
            },
        )
        assert r.status_code == 200, r.text

    @pytest.mark.parametrize("days", [-32, 16])
    def test_a_date_far_off_is_refused_and_nothing_goes(self, client, db, days):
        job = _packed(client, {"stock_code": "TOP-M", "order_qty": 2, "price_ex": 20})
        r = client.post(
            "/dispatch-sessions",
            json={
                "lines": [{"job_id": job["id"]}],
                "despatch_date": (date.today() + timedelta(days=days)).isoformat(),
            },
        )
        assert r.status_code == 422
        db.expire_all()
        assert db.get(Job, job["id"]).dispatched_at is None

    def test_one_job_despatched_on_its_own_takes_a_date_too(self, client, db):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        job = _packed(client, {"stock_code": "TOP-M", "order_qty": 2, "price_ex": 20})
        r = client.post(
            f"/jobs/{job['id']}/dispatch",
            json={"ship_via": "StarTrack", "ship_ref": "C1", "despatch_date": tomorrow},
        )
        assert r.status_code == 200, r.text
        assert r.json()["dispatched_at"] == tomorrow

    def test_the_delivery_note_prints_it(self, client, db, monkeypatch):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        job = _packed(client, {"stock_code": "TOP-M", "order_qty": 2, "price_ex": 20})
        client.post(
            "/dispatch-sessions",
            json={"lines": [{"job_id": job["id"]}], "despatch_date": tomorrow},
        )
        printed = []

        def spying(real):
            def spy(text, *args, **kwargs):
                printed.append(str(text))
                return real(text, *args, **kwargs)

            return spy

        # Data goes through _p, the note's own markup (with the date in it)
        # through _rich.
        for helper in ("_p", "_rich"):
            monkeypatch.setattr(
                despatch_documents,
                helper,
                spying(getattr(despatch_documents, helper)),
            )
        r = client.get(f"/jobs/{job['id']}/pdf", params={"type": "delivery-note"})
        assert r.status_code == 200, r.text
        assert f"Despatched: <b>{tomorrow}</b>" in printed


class TestAFurtherConsignmentsNote:
    def test_lists_only_what_is_in_the_carton_or_still_to_come(self, client, db):
        job = _packed(
            client,
            {"stock_code": "TOP-M", "order_qty": 2, "price_ex": 20},
            {"stock_code": "TOP-3XL", "order_qty": 1, "price_ex": 20, "sort": 1},
        )
        assert _despatch(client, job["id"]).status_code == 200
        db.expire_all()
        stored = db.get(Job, job["id"])
        first = [
            (it.stock_code, going, bo)
            for it, going, bo in despatch_documents.delivery_lines(stored)
        ]
        assert first == [("TOP-M", 2, 0), ("TOP-3XL", 0, 1)]
        # The 3XL arrives and goes on its own.
        line = db.query(JobItem).filter_by(job_id=job["id"], stock_code="TOP-3XL").one()
        line.supply_qty, line.b_ord = 1, 0
        db.commit()
        assert _despatch(client, job["id"], again=True).status_code == 200
        db.expire_all()
        second = [
            (it.stock_code, going, bo)
            for it, going, bo in despatch_documents.delivery_lines(
                db.get(Job, job["id"])
            )
        ]
        assert second == [("TOP-3XL", 1, 0)]

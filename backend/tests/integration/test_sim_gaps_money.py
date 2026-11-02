"""Money, status and despatch: the gaps the 2026-10-26 re-check found still open.

The decided fix for each is in docs/superpowers/plans/2026-10-26-simulation-gap-fixes.md.

- F04: a job with no lines was invoiced at whatever total the caller sent, and
  an import overwrote the header of a job that has lines;
- F10: the status, bulk, duplicate, payment, despatch, pick and session bodies
  accepted and dropped misspelt fields;
- F14: moving an open order to another branch left its reservation behind;
- F22: a despatched job could be despatched again, and one batch could name a
  job twice;
- F24: a typed invoice number was checked without the lock `issue()` takes;
- F27: growing an open order was never credit-checked, and the customer row
  was not locked for the check;
- F28: Create Similar and the Jim2 import wrote no opening comment;
- F31: a job line did not say its logo's proof, and changed artwork stayed
  approved;
- F33: an import put an invoice date back on a job that is not invoiced, and
  re-invoicing such a job left it reading not invoiced.
"""

from datetime import datetime

import pytest
from sqlalchemy import event

from app.models.customer import Customer
from app.models.job import Job, JobComment
from app.models.logo import Logo
from app.models.settings import CompanySettings
from app.models.stock_location import StockLocation

TODAY = datetime.now().strftime("%Y-%m-%d")

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def customers(db):
    db.add(Customer(id="MNY", name="Money Co", credit_limit=99999.0))
    db.add(Customer(id="TGT", name="Tight Co", credit_limit=200.0))
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


def _book(client, *lines, status="ORDER", customer="MNY", **fields):
    r = client.post(
        "/jobs",
        json={
            "customer_id": customer,
            "status": status,
            "items": list(lines),
            **fields,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def _service(qty=2, price=71.0, sort=0):
    # No stock code: nothing to reserve or buy, so the money is all that moves.
    return {"description": "Polo", "order_qty": qty, "price_ex": price, "sort": sort}


def _import(client, *rows, header="Job#,Cust#,Customer,Status,Total Ex,Tax,Total Inc"):
    body = "\n".join((header, *rows)) + "\n"
    r = client.post("/import/jobs", files={"file": ("jobs.csv", body, "text/csv")})
    assert r.status_code == 200, r.text
    return r.json()


def _trail(db, job_id):
    return [
        c.comment
        for c in db.query(JobComment)
        .filter(JobComment.job_id == job_id)
        .order_by(JobComment.id)
    ]


# ── F04: only the Jim2 import writes header totals ───────────────────────────


class TestHeaderTotals:
    def test_a_job_created_with_no_lines_totals_zero(self, client, db):
        job = _book(client, status="QUOTE", total_ex=100, tax=0, total_inc=5000)
        assert (job["total_ex"], job["tax"], job["total_inc"]) == (0, 0, 0)

    def test_a_patch_does_not_change_a_lineless_jobs_totals(self, client, db):
        db.add(
            Job(
                id="HDR-1",
                customer_id="MNY",
                status="QUOTE",
                total_ex=100,
                tax=10,
                total_inc=110,
            )
        )
        db.commit()
        r = client.patch(
            "/jobs/HDR-1", json={"total_ex": 1, "tax": 0, "total_inc": 5000}
        )
        assert r.status_code == 200, r.text
        assert float(r.json()["total_inc"]) == 110

    def test_a_copy_of_a_lineless_job_totals_zero(self, client, db):
        db.add(Job(id="HDR-2", customer_id="MNY", status="QUOTE", total_inc=110))
        db.commit()
        r = client.post("/jobs/HDR-2/duplicate", json={})
        assert r.status_code == 200, r.text
        assert float(r.json()["total_inc"]) == 0

    def test_an_import_may_not_change_the_totals_of_a_job_with_lines(self, client, db):
        job = _book(client, _service(qty=3, price=100.0), status="QUOTE")
        assert job["total_inc"] == 330
        out = _import(client, f"{job['id']},MNY,Money Co,Quote,1,0.1,1.1")
        assert out["skipped"] == 1
        reason = out["errors"][0]["error"]
        assert "330.00" in reason and "1.10" in reason
        db.expire_all()
        assert float(db.get(Job, job["id"]).total_inc) == 330

    def test_imported_header_parts_must_agree(self, client, db):
        out = _import(client, "HDR-3,MNY,Money Co,Quote,100,10,5000")
        assert out["skipped"] == 1
        assert "5000.00" in out["errors"][0]["error"]
        assert db.get(Job, "HDR-3") is None

    def test_an_import_still_writes_a_lineless_jobs_totals(self, client, db):
        out = _import(client, "HDR-4,MNY,Money Co,Quote,100,10,110")
        assert out["inserted"] == 1, out
        assert float(db.get(Job, "HDR-4").total_inc) == 110


# ── F10: unknown fields are refused, not dropped ─────────────────────────────


class TestUnknownFieldsRefused:
    @pytest.mark.parametrize(
        "path, body",
        [
            (
                "/jobs/{id}/status",
                {"status": "In Progress", "allow_negative_stocks": True},
            ),
            (
                "/jobs/bulk-status",
                {"job_ids": ["{id}"], "status": "In Progress", "x": 1},
            ),
            ("/jobs/{id}/duplicate", {"ship_too": "SITE-2"}),
            ("/jobs/{id}/payment", {"amount": 1, "methd": "EFT"}),
            (
                "/jobs/{id}/dispatch",
                {"ship_via": "TNT", "ship_ref": "C1", "advance": True},
            ),
            ("/jobs/{id}/pick", {"picks": [], "all": True}),
            ("/jobs/{id}/pick", {"picks": [{"item_id": 1, "qty_pick": 1, "qty": 1}]}),
            ("/jobs/{id}/lock", {"locked": True, "why": "x"}),
            ("/jobs/auto-pick", {"job_ids": ["{id}"], "force": True}),
            ("/dispatch-sessions", {"lines": [{"job_id": "{id}", "advance": True}]}),
            ("/dispatch-sessions", {"lines": [{"job_id": "{id}"}], "note": "x"}),
        ],
    )
    def test_a_misspelt_field_is_a_422(self, client, path, body):
        job = _book(client)
        jid = job["id"]

        def fill(value):
            if isinstance(value, str):
                return value.replace("{id}", jid)
            if isinstance(value, list):
                return [fill(v) for v in value]
            if isinstance(value, dict):
                return {k: fill(v) for k, v in value.items()}
            return value

        r = client.post(path.replace("{id}", jid), json=fill(body))
        assert r.status_code == 422, r.text

    def test_what_the_screen_sends_is_accepted(self, client):
        job = _book(client, status="Pick/Pack")
        r = client.post(
            f"/jobs/{job['id']}/dispatch",
            json={
                "ship_via": "TNT",
                "ship_ref": "C1",
                "cartons": 1,
                "notes": None,
                "advance_status": False,
            },
        )
        assert r.status_code == 200, r.text
        r = client.post(
            f"/jobs/{job['id']}/duplicate",
            json={"ship_to": "S2", "ship_to_id": None, "shipping_address": "1 St"},
        )
        assert r.status_code == 200, r.text


# ── F14: moving an open order's branch moves its reservation ─────────────────


class TestBranchMove:
    def _committed(self, db, sku):
        db.expire_all()
        return {
            r.branch: r.committed_qty
            for r in db.query(StockLocation).filter(StockLocation.sku == sku)
        }

    def test_the_reservation_follows_the_order(self, client, db, make_inventory):
        make_inventory(sku="BR-POLO", stock=10)
        job = _book(client, {"stock_code": "BR-POLO", "order_qty": 3, "price_ex": 5})
        assert self._committed(db, "BR-POLO").get("HQ") == 3
        r = client.patch(f"/jobs/{job['id']}", json={"branch": "PER"})
        assert r.status_code == 200, r.text
        held = self._committed(db, "BR-POLO")
        assert held.get("HQ", 0) == 0
        assert held.get("PER") == 3

    def test_a_quote_has_nothing_to_move(self, client, db, make_inventory):
        make_inventory(sku="BR-TEE", stock=10)
        job = _book(
            client,
            {"stock_code": "BR-TEE", "order_qty": 3, "price_ex": 5},
            status="QUOTE",
        )
        r = client.patch(f"/jobs/{job['id']}", json={"branch": "PER"})
        assert r.status_code == 200, r.text
        assert all(q == 0 for q in self._committed(db, "BR-TEE").values())


# ── F22: a despatched job goes again only as a further consignment ──────────


class TestDespatchOnce:
    def _send(self, client, jid, ref, **extra):
        return client.post(
            f"/jobs/{jid}/dispatch",
            json={"ship_via": "TNT", "ship_ref": ref, **extra},
        )

    def test_a_second_despatch_is_refused(self, client, db):
        jid = _book(client, status="Pick/Pack")["id"]
        assert self._send(client, jid, "C1").status_code == 200
        r = self._send(client, jid, "C2")
        assert r.status_code == 409, r.text
        assert TODAY in r.json()["detail"] and "C1" in r.json()["detail"]
        db.expire_all()
        assert db.get(Job, jid).connote == "C1"

    def test_a_further_consignment_appends_its_connote(self, client, db):
        jid = _book(client, status="Pick/Pack")["id"]
        assert self._send(client, jid, "C1").status_code == 200
        r = self._send(client, jid, "C2", again=True)
        assert r.status_code == 200, r.text
        assert r.json()["connote"] == "C1, C2"

    def test_a_batch_refuses_a_despatched_job_unless_again(self, client):
        jid = _book(client, status="Pick/Pack")["id"]
        assert self._send(client, jid, "C1").status_code == 200
        line = {"job_id": jid, "ship_via": "TNT", "ship_ref": "C2"}
        r = client.post("/dispatch-sessions", json={"lines": [line]})
        assert r.status_code == 409, r.text
        r = client.post("/dispatch-sessions", json={"lines": [{**line, "again": True}]})
        assert r.status_code == 200, r.text

    def test_one_batch_naming_a_job_twice_is_a_400(self, client, db):
        jid = _book(client, status="Pick/Pack")["id"]
        line = {"job_id": jid, "ship_via": "TNT", "ship_ref": "C1"}
        r = client.post("/dispatch-sessions", json={"lines": [line, line]})
        assert r.status_code == 400, r.text
        assert jid in r.json()["detail"]
        db.expire_all()
        assert db.get(Job, jid).dispatched_at is None


# ── F24: a typed invoice number is checked under the sequence lock ───────────


class TestTypedInvoiceNumberLocks:
    def test_a_typed_number_takes_the_settings_lock(self, client, locked):
        jid = _book(client, status="QUOTE")["id"]
        locked.clear()
        r = client.patch(f"/jobs/{jid}", json={"invoice": "INV-T1"})
        assert r.status_code == 200, r.text
        assert CompanySettings in locked

    def test_a_typed_number_on_create_takes_the_settings_lock(self, client, locked):
        _book(client, status="QUOTE", invoice="INV-T2")
        assert CompanySettings in locked

    def test_a_held_number_is_still_refused(self, client):
        _book(client, status="QUOTE", invoice="INV-T3")
        jid = _book(client, status="QUOTE")["id"]
        r = client.patch(f"/jobs/{jid}", json={"invoice": "inv-t3 "})
        assert r.status_code == 409, r.text


# ── F27: growing an open order is credit-checked, under a lock ──────────────


class TestGrowingAnOrder:
    def test_an_order_grown_past_the_limit_is_refused(self, client, db):
        job = _book(client, _service(qty=2), customer="TGT")
        assert job["total_inc"] == pytest.approx(156.2)
        line = {**_service(qty=20), "id": job["items"][0]["id"]}
        r = client.patch(f"/jobs/{job['id']}", json={"items": [line]})
        assert r.status_code == 422, r.text
        assert "credit limit" in r.json()["detail"]
        assert "this order $1562.00" in r.json()["detail"]

    def test_an_order_grown_within_the_limit_is_accepted(self, client):
        job = _book(client, _service(qty=1), customer="TGT")
        line = {**_service(qty=2), "id": job["items"][0]["id"]}
        r = client.patch(f"/jobs/{job['id']}", json={"items": [line]})
        assert r.status_code == 200, r.text
        assert r.json()["total_inc"] == pytest.approx(156.2)

    def test_a_quote_grows_unchecked(self, client):
        job = _book(client, _service(qty=1), customer="TGT", status="QUOTE")
        line = {**_service(qty=20), "id": job["items"][0]["id"]}
        r = client.patch(f"/jobs/{job['id']}", json={"items": [line]})
        assert r.status_code == 200, r.text

    def test_the_customer_row_is_locked_for_the_check(self, client, locked):
        _book(client, _service(qty=1), customer="TGT")
        assert Customer in locked


# ── F28: every way a job is made opens its trail ─────────────────────────────


class TestOpeningComment:
    def test_create_similar_says_what_it_copied(self, client, db):
        src = _book(client, _service(), status="QUOTE")
        r = client.post(f"/jobs/{src['id']}/duplicate", json={})
        assert r.status_code == 200, r.text
        assert _trail(db, r.json()["id"])[0] == (
            f"Created as QUOTE — a copy of job {src['id']}"
        )

    def test_an_imported_job_says_it_was_imported(self, client, db):
        _import(client, "IMP-T1,MNY,Money Co,Quote,100,10,110")
        assert _trail(db, "IMP-T1")[0] == "Imported from Jim2"


# ── F31: the job line reads its logo's proof; new artwork needs a new proof ──


class TestLogoProofOnTheJob:
    def _logo(self, db):
        logo = Logo(
            code="EMB.MNY.LC",
            customer_id="MNY",
            name="Money left chest",
            decoration_type="EMB",
            stitch_count=8000,
            artwork_ref="art-v1",
            made_by="in_house",
            price_ex=7.0,
            cost_ex=3.0,
            is_active=True,
        )
        db.add(logo)
        db.commit()
        return logo

    def test_a_logo_line_reports_the_logos_proof(self, client, db):
        logo = self._logo(db)
        job = _book(
            client,
            {"stock_code": "POLO", "order_qty": 2, "price_ex": 30, "sort": 0},
            {
                "stock_code": "EMB.MNY.LC",
                "order_qty": 2,
                "sort": 1,
                "applies_to_line": 0,
            },
            status="QUOTE",
        )
        line = next(i for i in job["items"] if i["sort"] == 1)
        assert (line["logo_id"], line["logo_code"]) == (logo.id, "EMB.MNY.LC")
        assert line["logo_proof_status"] == "none"
        garment = next(i for i in job["items"] if i["sort"] == 0)
        assert garment["logo_proof_status"] is None

        r = client.post(f"/logos/{logo.id}/proof", json={"status": "approved"})
        assert r.status_code == 200, r.text
        got = client.get(f"/jobs/{job['id']}").json()
        line = next(i for i in got["items"] if i["sort"] == 1)
        assert line["logo_proof_status"] == "approved"

    @pytest.mark.parametrize(
        "change", [{"artwork_ref": "art-v2"}, {"stitch_count": 9000}]
    )
    def test_changed_artwork_needs_a_new_proof(self, client, db, change):
        logo = self._logo(db)
        client.post(f"/logos/{logo.id}/proof", json={"status": "approved"})
        r = client.patch(f"/logos/{logo.id}", json=change)
        assert r.status_code == 200, r.text
        assert r.json()["proof_status"] == "none"

    def test_a_price_change_keeps_the_approval(self, client, db):
        logo = self._logo(db)
        client.post(f"/logos/{logo.id}/proof", json={"status": "approved"})
        r = client.patch(
            f"/logos/{logo.id}", json={"price_ex": 8.0, "artwork_ref": "art-v1"}
        )
        assert r.status_code == 200, r.text
        assert r.json()["proof_status"] == "approved"


# ── F33: an invoice date belongs to an invoiced job ──────────────────────────


class TestInvoiceDate:
    def test_a_reimport_does_not_date_a_job_that_is_not_invoiced(self, client, db):
        jid = _book(client, _service(qty=1, price=100.0), status="FINISH")["id"]
        assert (
            client.post(f"/jobs/{jid}/status", json={"status": "INVOICE"}).status_code
            == 200
        )
        r = client.post(f"/jobs/{jid}/unprint")
        assert r.status_code == 200, r.text
        number = r.json()["invoice"]
        out = _import(
            client,
            f"{jid},MNY,Money Co,Finished,{number},01/09/2026,100,10,110",
            header="Job#,Cust#,Customer,Status,Inv#,Inv Date,Total Ex,Tax,Total Inc",
        )
        assert out["updated"] == 1, out
        db.expire_all()
        assert db.get(Job, jid).invoice_date is None

        r = client.post(f"/jobs/{jid}/status", json={"status": "INVOICE"})
        assert r.status_code == 200, r.text
        assert (r.json()["invoice_status"], r.json()["invoice_date"]) == (
            "invoiced",
            TODAY,
        )

    def test_entering_invoice_marks_it_invoiced_keeping_a_date_it_has(self, client, db):
        jid = _book(client, _service(qty=1, price=100.0), status="FINISH")["id"]
        job = db.get(Job, jid)
        job.invoice_date = "2026-09-01"
        job.invoice_status = "not_invoiced"
        db.commit()
        r = client.post(f"/jobs/{jid}/status", json={"status": "INVOICE"})
        assert r.status_code == 200, r.text
        assert (r.json()["invoice_status"], r.json()["invoice_date"]) == (
            "invoiced",
            "2026-09-01",
        )

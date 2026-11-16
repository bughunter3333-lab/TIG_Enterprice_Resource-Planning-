"""Jobs rules: the paths the 2026-10-30 re-check still found round the fixes.

The decided fix for each is in docs/superpowers/plans/2026-10-26-simulation-gap-fixes.md,
section "Round 2 (2026-10-30)".

- F01: changing only the customer, or a Jim2 re-import writing an order number,
  booked a repeat; the server search did not match the customer or ship-to code;
- F02: a logo line recoded to a garment kept its logo; a line keyed before its
  logo was registered never linked;
- F09: moving a job to another customer kept the first customer's logo lines;
  Create Similar copied a retired logo;
- F12: a portal decoration line marked only by `emb_code`/`dec_code` was bought;
- F19: turning the garment into a note, or deleting it, left the alteration
  pointing at nothing;
- F27: moving a committed job to another customer was never credit-checked;
- F14: `branch: ""` stored a branch the derived figures did not read as HQ;
- F04: a re-import without the total columns zeroed the job's totals;
- F31: changing a logo's method, colour count or position kept its approval.
"""

import pytest

from app.core.reservations import committed_by_branch
from app.models.customer import Customer
from app.models.job import Job, JobComment
from app.models.logo import Logo


@pytest.fixture(autouse=True)
def customers(db):
    db.add(Customer(id="CFG", name="CFG Mining", credit_limit=99999.0))
    db.add(Customer(id="OTH", name="Other Co", credit_limit=99999.0))
    db.commit()


def _logo(db, **fields):
    logo = Logo(
        **{
            "code": "EMB.CFG.LC",
            "customer_id": "CFG",
            "name": "CFG left chest",
            "decoration_type": "EMB",
            "position": "L.Chest",
            "stitch_count": 8000,
            "color_count": 3,
            "made_by": "in_house",
            "price_ex": 7.0,
            "cost_ex": 3.21,
            "is_active": True,
            **fields,
        }
    )
    db.add(logo)
    db.commit()
    return logo


def _garment(sku="POLO-M", qty=3, sort=0):
    return {"stock_code": sku, "order_qty": qty, "sort": sort, "price_ex": 30.0}


def _book(client, *lines, status="QUOTE", customer_id="CFG", **fields):
    r = client.post(
        "/jobs",
        json={
            "customer_id": customer_id,
            "status": status,
            "items": list(lines),
            **fields,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def _line(job, sort):
    return next(i for i in job["items"] if i["sort"] == sort)


def _bought(client):
    return [r["sku"] for r in client.get("/jobs/order-requirements").json()]


def _import(client, header, *rows):
    body = "\n".join((header, *rows)) + "\n"
    r = client.post("/import/jobs", files={"file": ("jobs.csv", body, "text/csv")})
    assert r.status_code == 200, r.text
    return r.json()


# ── F01: one portal order, one job ───────────────────────────────────────────


def _portal_job(client, serial, customer_id="CFG"):
    return _book(
        client,
        _garment(),
        customer_id=customer_id,
        item_no="NOP.ONLINE",
        serial_no=serial,
    )


@pytest.mark.integration
class TestARepeatCannotBeBookedRoundTheCheck:
    def test_moving_to_the_customer_who_has_the_order_is_refused(self, client, db):
        first = _portal_job(client, "WEB-1")
        other = _portal_job(client, "WEB-1", customer_id="OTH")
        r = client.patch(f"/jobs/{other['id']}", json={"customer_id": "CFG"})
        assert r.status_code == 409, r.text
        assert r.json()["detail"]["job_id"] == first["id"]
        db.expire_all()
        assert db.get(Job, other["id"]).customer_id == "OTH"

    def test_a_re_import_cannot_give_a_portal_job_a_booked_number(self, client, db):
        first = _portal_job(client, "WEB-7")
        second = _portal_job(client, "WEB-8")
        out = _import(
            client, "Job#,Cust#,Status,Serial#", f"{second['id']},CFG,Quote,WEB-7"
        )
        assert out["skipped"] == 1, out
        assert first["id"] in out["errors"][0]["error"]
        db.expire_all()
        assert db.get(Job, second["id"]).serial_no == "WEB-8"

    def test_a_re_import_of_its_own_number_is_accepted(self, client):
        job = _portal_job(client, "WEB-7")
        out = _import(
            client, "Job#,Cust#,Status,Serial#", f"{job['id']},CFG,Quote,WEB-7"
        )
        assert out["updated"] == 1, out

    def test_search_finds_a_job_by_its_customer_code_and_ship_to(self, client):
        job = _book(client, _garment(), customer_id="OTH", ship_to="SITE-9")
        found = [j["id"] for j in client.get("/jobs?search=oth").json()]
        assert job["id"] in found
        found = [j["id"] for j in client.get("/jobs?search=site-9").json()]
        assert found == [job["id"]]


# ── F02: a line's logo follows its code ──────────────────────────────────────


@pytest.mark.integration
class TestALinesLogoFollowsItsCode:
    def test_recoded_to_a_garment_it_drops_the_logo_and_is_bought(self, client, db):
        _logo(db)
        job = _book(
            client,
            _garment(),
            {"stock_code": "EMB.CFG.LC", "order_qty": 2, "sort": 1},
            status="ORDER",
        )
        assert _line(job, 1)["logo_id"] is not None
        r = client.patch(
            f"/jobs/{job['id']}",
            json={
                "items": [
                    {"id": _line(job, 0)["id"]},
                    {"id": _line(job, 1)["id"], "stock_code": "BUYIN-POLO"},
                ]
            },
        )
        assert r.status_code == 200, r.text
        line = _line(r.json(), 1)
        assert line["logo_id"] is None
        assert (line["supply_qty"], line["b_ord"]) == (0, 2)
        assert "BUYIN-POLO" in _bought(client)

    def test_a_line_keyed_before_its_logo_links_on_the_next_save(self, client, db):
        job = _book(
            client,
            _garment(),
            {"stock_code": "EMB.C1.NEW", "order_qty": 2, "sort": 1},
            status="ORDER",
        )
        assert "EMB.C1.NEW" in _bought(client)
        logo = _logo(db, code="EMB.C1.NEW")
        r = client.patch(
            f"/jobs/{job['id']}",
            json={
                "items": [
                    {"id": _line(job, 0)["id"]},
                    {"id": _line(job, 1)["id"], "stock_code": "EMB.C1.NEW"},
                ]
            },
        )
        assert r.status_code == 200, r.text
        line = _line(r.json(), 1)
        assert line["logo_id"] == logo.id
        assert (line["supply_qty"], line["b_ord"]) == (2, 0)
        assert "EMB.C1.NEW" not in _bought(client)


# ── F09: a job carries only its own customer's logos ─────────────────────────


@pytest.mark.integration
class TestAJobCarriesItsOwnCustomersLogos:
    def _job(self, client, db):
        _logo(db)
        return _book(
            client, _garment(), {"stock_code": "EMB.CFG.LC", "order_qty": 3, "sort": 1}
        )

    def test_moving_it_with_anothers_logo_lines_is_refused(self, client, db):
        job = self._job(client, db)
        r = client.patch(f"/jobs/{job['id']}", json={"customer_id": "OTH"})
        assert r.status_code == 422, r.text
        assert "EMB.CFG.LC" in r.json()["detail"]
        assert "line 1" in r.json()["detail"]
        db.expire_all()
        assert db.get(Job, job["id"]).customer_id == "CFG"

    def test_moving_it_without_them_is_accepted(self, client, db):
        job = self._job(client, db)
        r = client.patch(
            f"/jobs/{job['id']}",
            json={"customer_id": "OTH", "items": [{"id": _line(job, 0)["id"]}]},
        )
        assert r.status_code == 200, r.text
        assert r.json()["customer_id"] == "OTH"

    def test_an_import_cannot_move_it_either(self, client, db):
        job = self._job(client, db)
        out = _import(client, "Job#,Cust#,Status", f"{job['id']},OTH,Quote")
        assert out["skipped"] == 1, out
        assert "EMB.CFG.LC" in out["errors"][0]["error"]
        db.expire_all()
        assert db.get(Job, job["id"]).customer_id == "CFG"

    def test_create_similar_refuses_a_retired_logo(self, client, db):
        job = self._job(client, db)
        logo = db.query(Logo).one()
        logo.is_active = False
        db.commit()
        r = client.post(f"/jobs/{job['id']}/duplicate", json={})
        assert r.status_code == 422, r.text
        assert "EMB.CFG.LC" in r.json()["detail"]
        assert db.query(Job).count() == 1

    def test_create_similar_copies_an_active_logo(self, client, db):
        job = self._job(client, db)
        r = client.post(f"/jobs/{job['id']}/duplicate", json={})
        assert r.status_code == 200, r.text
        assert _line(r.json(), 1)["logo_id"] == _line(job, 1)["logo_id"]


# ── F12: a portal decoration line, however it is marked ──────────────────────


def _portal_order(*lines):
    return {
        "customer_id": "CFG",
        "status": "New",
        "serial_no": "WEB-77",
        "items": [_garment(), *lines],
    }


@pytest.mark.integration
class TestAPortalDecorationIsRegistered:
    @pytest.mark.parametrize("decoration_type", [None, "None", ""])
    def test_one_marked_by_its_emb_and_dec_codes_is_refused(
        self, client_as, decoration_type
    ):
        line = {
            "stock_code": "EMB.C1.NEW",
            "emb_code": "EMB.C1.NEW",
            "dec_code": "EMB.C1.NEW",
            "order_qty": 2,
            "sort": 1,
        }
        if decoration_type is not None:
            line["decoration_type"] = decoration_type
        r = client_as("portal").post("/jobs", json=_portal_order(line))
        assert r.status_code == 422, r.text
        assert "register the logo" in r.json()["detail"]

    def test_a_dec_code_alone_marks_it(self, client_as):
        line = {"stock_code": "EMB.C1.NEW", "dec_code": "EMB.C1.NEW", "sort": 1}
        r = client_as("portal").post(
            "/jobs", json=_portal_order({**line, "order_qty": 2})
        )
        assert r.status_code == 422, r.text

    def test_codes_left_as_none_do_not_mark_a_garment(self, client_as):
        line = {
            "stock_code": "BUYIN-POLO",
            "emb_code": "None",
            "dec_code": " ",
            "order_qty": 2,
            "sort": 1,
        }
        r = client_as("portal").post("/jobs", json=_portal_order(line))
        assert r.status_code == 200, r.text


# ── F19: every alteration still points at a goods line ───────────────────────


@pytest.mark.integration
class TestEveryAlterationPointsAtGoods:
    def _job(self, client):
        return _book(
            client,
            _garment(),
            {"stock_code": "ALT.HEM", "order_qty": 3, "sort": 1, "applies_to_line": 0},
        )

    def test_turning_the_garment_into_a_note_is_refused(self, client):
        job = self._job(client)
        assert _line(job, 1)["applies_to_item_id"] == _line(job, 0)["id"]
        r = client.patch(
            f"/jobs/{job['id']}",
            json={
                "items": [
                    {"id": _line(job, 0)["id"], "display_type": "note"},
                    {"id": _line(job, 1)["id"]},
                ]
            },
        )
        assert r.status_code == 422, r.text
        assert "Line 1" in r.json()["detail"] and "line 0" in r.json()["detail"]

    def test_deleting_the_garment_is_refused(self, client):
        job = self._job(client)
        r = client.patch(
            f"/jobs/{job['id']}",
            json={"items": [{"id": _line(job, 1)["id"], "sort": 1}]},
        )
        assert r.status_code == 422, r.text
        assert "Line 1" in r.json()["detail"] and "line 0" in r.json()["detail"]

    def test_dropping_the_link_with_the_garment_is_accepted(self, client):
        job = self._job(client)
        r = client.patch(
            f"/jobs/{job['id']}",
            json={"items": [{"id": _line(job, 1)["id"], "applies_to_item_id": None}]},
        )
        assert r.status_code == 200, r.text

    def test_an_unrelated_save_is_accepted(self, client):
        job = self._job(client)
        r = client.patch(
            f"/jobs/{job['id']}",
            json={
                "items": [
                    {"id": _line(job, 0)["id"], "order_qty": 4},
                    {"id": _line(job, 1)["id"]},
                ]
            },
        )
        assert r.status_code == 200, r.text


# ── F27: the customer an order moves to is credit-checked ────────────────────


@pytest.mark.integration
class TestMovingAnOrderIsCreditChecked:
    @pytest.fixture(autouse=True)
    def limited(self, db):
        db.add(Customer(id="UNL", name="Unlimited Co", credit_limit=0))
        db.add(Customer(id="PB27", name="Small Co", credit_limit=200.0))
        db.commit()

    def _order(self, client):
        # 10 x $30 ex: $330 inc, over PB27's $200.
        return _book(client, _garment(qty=10), status="ORDER", customer_id="UNL")

    def test_moving_it_past_the_new_customers_limit_is_refused(self, client, db):
        job = self._order(client)
        r = client.patch(f"/jobs/{job['id']}", json={"customer_id": "PB27"})
        assert r.status_code == 422, r.text
        assert "credit limit" in r.json()["detail"]
        db.expire_all()
        assert db.get(Job, job["id"]).customer_id == "UNL"

    def test_moving_it_within_the_limit_says_so_on_the_trail(self, client, db):
        db.get(Customer, "PB27").credit_limit = 5000.0
        db.commit()
        job = self._order(client)
        r = client.patch(f"/jobs/{job['id']}", json={"customer_id": "PB27"})
        assert r.status_code == 200, r.text
        trail = [
            c.comment
            for c in db.query(JobComment).filter(JobComment.job_id == job["id"])
        ]
        assert any("Ordered on account" in text for text in trail), trail

    def test_moving_a_quote_is_not_checked(self, client):
        job = _book(client, _garment(qty=10), customer_id="UNL")
        r = client.patch(f"/jobs/{job['id']}", json={"customer_id": "PB27"})
        assert r.status_code == 200, r.text


# ── F14: a blank branch is HQ ────────────────────────────────────────────────


@pytest.mark.integration
class TestABlankBranchIsHQ:
    def test_it_is_stored_as_null_and_the_reservation_stays_at_hq(
        self, client, db, make_inventory
    ):
        make_inventory(sku="POLO-M", stock=10)
        job = _book(client, _garment(qty=2), status="ORDER")
        r = client.patch(f"/jobs/{job['id']}", json={"branch": ""})
        assert r.status_code == 200, r.text
        db.expire_all()
        assert db.get(Job, job["id"]).branch is None
        assert committed_by_branch(db, "POLO-M") == {"HQ": 2}

    def test_a_new_job_with_a_blank_branch_is_hq(self, client, db):
        job = _book(client, _garment(), branch="  ")
        assert db.get(Job, job["id"]).branch in (None, "HQ")


# ── F04: an import writes only the totals its file carries ───────────────────


_TOTALS_HEADER = "Job#,Cust#,Customer,Status,Total Ex,Tax,Total Inc"


@pytest.mark.integration
class TestAnImportWritesOnlyTheTotalsItCarries:
    def test_a_file_without_totals_keeps_a_lineless_jobs_total(self, client, db):
        _import(client, _TOTALS_HEADER, "IMP-Z,CFG,CFG Mining,Quote,100,10,110")
        out = _import(client, "Job#,Cust#,Status,Notes", "IMP-Z,CFG,Quote,re-keyed")
        assert out["updated"] == 1, out
        db.expire_all()
        job = db.get(Job, "IMP-Z")
        assert (float(job.total_ex), float(job.tax), float(job.total_inc)) == (
            100,
            10,
            110,
        )
        assert job.notes == "re-keyed"

    def test_a_file_without_totals_does_not_refuse_a_job_with_lines(self, client, db):
        job = _book(client, _garment())
        out = _import(client, "Job#,Cust#,Status,Notes", f"{job['id']},CFG,Quote,hi")
        assert out["updated"] == 1, out
        db.expire_all()
        assert float(db.get(Job, job["id"]).total_inc) == job["total_inc"]

    def test_no_tax_column_is_not_a_disagreement(self, client, db):
        out = _import(
            client, "Job#,Cust#,Status,Total Ex,Total Inc", "IMP-T,CFG,Quote,100,110"
        )
        assert out["inserted"] == 1, out
        job = db.get(Job, "IMP-T")
        assert (float(job.total_ex), float(job.tax), float(job.total_inc)) == (
            100,
            10,
            110,
        )

    def test_parts_it_carries_still_have_to_agree(self, client, db):
        out = _import(client, _TOTALS_HEADER, "IMP-B,CFG,CFG Mining,Quote,100,10,5000")
        assert out["skipped"] == 1, out
        assert db.get(Job, "IMP-B") is None


# ── F31: what the customer approved is the whole of the logo ─────────────────


@pytest.mark.integration
class TestChangingWhatWasProofedNeedsAProof:
    @pytest.mark.parametrize(
        "change",
        [{"decoration_type": "Print"}, {"color_count": 9}, {"position": "Back"}],
    )
    def test_it_goes_back_to_not_proofed(self, client, db, change):
        logo = _logo(db, proof_status="approved")
        r = client.patch(f"/logos/{logo.id}", json=change)
        assert r.status_code == 200, r.text
        db.expire_all()
        assert db.get(Logo, logo.id).proof_status == "none"

    def test_a_price_change_keeps_the_approval(self, client, db):
        logo = _logo(db, proof_status="approved")
        r = client.patch(f"/logos/{logo.id}", json={"price_ex": 8.0})
        assert r.status_code == 200, r.text
        db.expire_all()
        assert db.get(Logo, logo.id).proof_status == "approved"

    def test_the_same_value_keeps_the_approval(self, client, db):
        logo = _logo(db, proof_status="approved")
        r = client.patch(f"/logos/{logo.id}", json={"position": "L.Chest"})
        assert r.status_code == 200, r.text
        db.expire_all()
        assert db.get(Logo, logo.id).proof_status == "approved"

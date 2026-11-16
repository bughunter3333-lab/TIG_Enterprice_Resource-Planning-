"""The production board (docs/superpowers/specs/2026-11-07-production-board.md).

Who has which work, by lane: Picking · Embroidery · Print · a lane per outside
decorator · Packing. A card is a job at a lane; what moves is a garment. A
hand-off records the lane and an optional person, writes a printed comment, and
never changes the job's status (owner decisions 2026-11-07).
"""

import pytest

from app.models.customer import Customer
from app.models.job import Job, JobComment, JobItem
from app.models.logo import Logo
from app.models.supplier import Supplier

pytestmark = pytest.mark.integration


def _customer(db):
    if not db.get(Customer, "PB-C"):
        db.add(Customer(id="PB-C", name="Board Co", credit_limit=99999.0))
        db.commit()


def _job(db, job_id, status="ORDER", *garments, due="20/11/2026"):
    """A job with garment lines; returns {sort: line}."""
    _customer(db)
    job = Job(
        id=job_id,
        customer_id="PB-C",
        customer_name="Board Co",
        status=status,
        due=due,
        items=list(garments),
    )
    db.add(job)
    db.commit()
    return job


def _garment(sort, code="POLO", qty=4, picked=0, b_ord=0, decoration="None"):
    return JobItem(
        sort=sort,
        stock_code=code,
        description=f"{code} garment",
        order_qty=qty + b_ord,
        supply_qty=qty,
        b_ord=b_ord,
        qty_pick=picked,
        decoration_type=decoration,
    )


def _logo(db, code, made_by="in_house", supplier_id=None, decoration_type="EMB"):
    _customer(db)
    logo = Logo(
        code=code,
        customer_id="PB-C",
        decoration_type=decoration_type,
        made_by=made_by,
        supplier_id=supplier_id,
    )
    db.add(logo)
    db.commit()
    return logo


def _apply(db, job, garment, logo, sort=9):
    line = JobItem(
        job_id=job.id,
        sort=sort,
        stock_code=logo.code,
        description="decoration",
        order_qty=garment.order_qty,
        supply_qty=garment.supply_qty,
        logo_id=logo.id,
        applies_to_item_id=garment.id,
    )
    db.add(line)
    db.commit()
    return line


def _board(client):
    r = client.get("/production-board")
    assert r.status_code == 200, r.text
    return r.json()


def _cards(board, job_id):
    return {c["lane"]: c for c in board["cards"] if c["job_id"] == job_id}


class TestWhereWorkIsBeforeAnyHandOff:
    def test_a_garment_not_picked_is_at_picking(self, client, db):
        _job(db, "PB-1", "ORDER", _garment(0))
        assert set(_cards(_board(client), "PB-1")) == {"picking"}

    def test_a_back_order_keeps_it_at_picking(self, client, db):
        # All of what is here is picked, the rest is still to come.
        _job(db, "PB-2", "ORDER", _garment(0, qty=4, picked=4, b_ord=6))
        assert set(_cards(_board(client), "PB-2")) == {"picking"}

    def test_picked_and_embroidered_in_house_is_at_embroidery(self, client, db):
        job = _job(db, "PB-3", "Picked", _garment(0, picked=4))
        _apply(db, job, job.items[0], _logo(db, "EMB.PB3"))
        cards = _cards(_board(client), "PB-3")
        assert set(cards) == {"embroidery"}
        (line,) = cards["embroidery"]["lines"]
        assert line["decoration"] == ["EMB.PB3"]

    def test_picked_and_printed_in_house_is_at_print(self, client, db):
        _job(db, "PB-4", "Picked", _garment(0, picked=4, decoration="DTF"))
        assert set(_cards(_board(client), "PB-4")) == {"print"}

    def test_a_decorators_logo_goes_to_that_decorators_lane(self, client, db):
        db.add(Supplier(id="PB-STITCH", name="Stitchworks Embroidery"))
        db.commit()
        job = _job(db, "PB-5", "ORDER", _garment(0, picked=4))
        _apply(db, job, job.items[0], _logo(db, "EMB.PB5", "subcontract", "PB-STITCH"))
        board = _board(client)
        assert set(_cards(board, "PB-5")) == {"decorator:PB-STITCH"}
        lane = next(x for x in board["lanes"] if x["key"] == "decorator:PB-STITCH")
        assert lane["label"] == "Stitchworks Embroidery"

    def test_picked_with_nothing_to_decorate_is_at_packing(self, client, db):
        _job(db, "PB-6", "Picked", _garment(0, picked=4))
        assert set(_cards(_board(client), "PB-6")) == {"packing"}

    def test_one_job_in_two_lanes_is_two_cards(self, client, db):
        _job(db, "PB-7", "Inco/Pick", _garment(0, picked=4), _garment(1, "CAP"))
        cards = _cards(_board(client), "PB-7")
        assert set(cards) == {"packing", "picking"}
        assert [ln["line"] for ln in cards["picking"]["lines"]] == [2]

    @pytest.mark.parametrize("status", ["QUOTE", "New", "FINISH", "Ready", "CANCEL"])
    def test_only_work_in_hand_is_on_the_board(self, client, db, status):
        _job(db, "PB-8", status, _garment(0))
        assert _cards(_board(client), "PB-8") == {}

    def test_decoration_lines_are_not_garments(self, client, db):
        job = _job(db, "PB-9", "ORDER", _garment(0))
        _apply(db, job, job.items[0], _logo(db, "EMB.PB9"))
        (card,) = _cards(_board(client), "PB-9").values()
        assert [ln["stock_code"] for ln in card["lines"]] == ["POLO"]

    def test_the_fixed_lanes_come_in_floor_order(self, client, db):
        db.add(Supplier(id="PB-ZED", name="Zed Prints"))
        db.commit()
        _logo(db, "DTF.PBZ", "subcontract", "PB-ZED", decoration_type="DTF")
        keys = [x["key"] for x in _board(client)["lanes"]]
        assert keys[:3] == ["picking", "embroidery", "print"]
        assert keys[-1] == "packing"
        assert "decorator:PB-ZED" in keys  # a decorator with no work yet

    def test_the_board_carries_no_money(self, client, db):
        _job(db, "PB-10", "ORDER", _garment(0))
        text = client.get("/production-board").text
        for word in ("price", "total", "margin", "cost", "balance"):
            assert word not in text


class TestHandingOff:
    def _hand(self, client, job_id, from_lane, to_lane, holder=None):
        body = {"job_id": job_id, "from_lane": from_lane, "to_lane": to_lane}
        if holder is not None:
            body["holder"] = holder
        return client.post("/production-board/hand-off", json=body)

    def test_given_to_a_person_at_a_lane(self, client, db):
        job = _job(db, "PB-20", "Picked", _garment(0, picked=4))
        _apply(db, job, job.items[0], _logo(db, "EMB.PB20"))
        r = self._hand(client, "PB-20", "embroidery", "embroidery", "  Lina ")
        assert r.status_code == 200, r.text
        card = _cards(_board(client), "PB-20")["embroidery"]
        assert card["holder"] == "Lina"
        assert card["since"]
        assert "Lina" in _board(client)["holders"]

    def test_it_writes_the_trail_as_jim2_did(self, client, db):
        _job(db, "PB-21", "ORDER", _garment(0), _garment(1, "CAP"))
        self._hand(client, "PB-21", "picking", "embroidery", "Lina")
        comment = (
            db.query(JobComment)
            .filter_by(job_id="PB-21")
            .order_by(JobComment.id.desc())
            .first()
        )
        assert comment.comment == "Lines 1, 2 given to Lina for Embroidery"

    def test_with_no_person_the_trail_names_only_the_lane(self, client, db):
        _job(db, "PB-22", "ORDER", _garment(0))
        self._hand(client, "PB-22", "picking", "packing", "   ")
        comment = db.query(JobComment).filter_by(job_id="PB-22").one()
        assert comment.comment == "Line 1 given to Packing"
        assert _cards(_board(client), "PB-22")["packing"]["holder"] is None

    def test_it_never_changes_the_status_or_the_stock(self, client, db):
        _job(db, "PB-23", "In Progress", _garment(0))
        before = client.get("/jobs/PB-23").json()
        self._hand(client, "PB-23", "picking", "print", "Sam")
        after = client.get("/jobs/PB-23").json()
        assert after["status"] == "In Progress"
        assert after["items"][0]["supply_qty"] == before["items"][0]["supply_qty"]
        assert after["items"][0]["qty_pick"] == before["items"][0]["qty_pick"]

    def test_it_moves_the_jobs_version(self, client, db):
        _job(db, "PB-24", "ORDER", _garment(0))
        before = client.get("/jobs/PB-24").json()["version"]
        self._hand(client, "PB-24", "picking", "embroidery")
        assert client.get("/jobs/PB-24").json()["version"] != before

    def test_handed_work_stays_where_it_was_handed(self, client, db):
        # Picked in full now, but someone has it at Embroidery: it stays.
        _job(db, "PB-25", "ORDER", _garment(0))
        self._hand(client, "PB-25", "picking", "embroidery")
        db.query(JobItem).filter_by(job_id="PB-25").update({"qty_pick": 4})
        db.commit()
        assert set(_cards(_board(client), "PB-25")) == {"embroidery"}

    def test_a_card_moved_on_another_tablet_is_not_moved_again(self, client, db):
        _job(db, "PB-26", "ORDER", _garment(0))
        assert self._hand(client, "PB-26", "picking", "print").status_code == 200
        r = self._hand(client, "PB-26", "picking", "packing")
        assert r.status_code == 409
        assert set(_cards(_board(client), "PB-26")) == {"print"}

    @pytest.mark.parametrize("lane", ["oven", "decorator:NOBODY", "decorator:"])
    def test_a_lane_that_does_not_exist_is_refused(self, client, db, lane):
        _job(db, "PB-27", "ORDER", _garment(0))
        assert self._hand(client, "PB-27", "picking", lane).status_code == 422

    def test_a_job_not_in_work_is_refused(self, client, db):
        _job(db, "PB-28", "FINISH", _garment(0))
        assert self._hand(client, "PB-28", "picking", "packing").status_code == 409

    def test_a_name_longer_than_the_field_is_refused(self, client, db):
        _job(db, "PB-29", "ORDER", _garment(0))
        r = self._hand(client, "PB-29", "picking", "packing", "x" * 51)
        assert r.status_code == 422

    def test_the_floor_hands_off_overseas_staff_included(self, client_as, db):
        _job(db, "PB-30", "ORDER", _garment(0))
        floor = client_as("overseas_staff")
        assert (
            self._hand(floor, "PB-30", "picking", "packing", "Ana").status_code == 200
        )
        assert floor.get("/production-board").status_code == 200

    def test_to_a_decorator_by_its_supplier(self, client, db):
        db.add(Supplier(id="PB-OUT", name="Outside Prints"))
        db.commit()
        _job(db, "PB-31", "ORDER", _garment(0))
        r = self._hand(client, "PB-31", "picking", "decorator:PB-OUT")
        assert r.status_code == 200, r.text
        assert set(_cards(_board(client), "PB-31")) == {"decorator:PB-OUT"}
        comment = db.query(JobComment).filter_by(job_id="PB-31").one()
        assert comment.comment == "Line 1 given to Outside Prints"


class TestWhatTheReviewFound:
    def test_the_hand_off_lock_is_on_the_job_row_alone(self, db):
        # PostgreSQL refuses FOR UPDATE over the outer join an eager load of
        # the lines makes; SQLite drops FOR UPDATE, so only the SQL shows it.
        from sqlalchemy.dialects import postgresql

        from app.routers.production_board import locked_job

        sql = str(locked_job(db, "X").statement.compile(dialect=postgresql.dialect()))
        assert "FOR UPDATE" in sql
        assert "JOIN" not in sql

    def test_the_trail_is_an_internal_note_not_on_customer_papers(self, client, db):
        _job(db, "PB-40", "ORDER", _garment(0))
        client.post(
            "/production-board/hand-off",
            json={"job_id": "PB-40", "from_lane": "picking", "to_lane": "packing"},
        )
        comment = db.query(JobComment).filter_by(job_id="PB-40").one()
        assert comment.is_internal is True
        assert not comment.inc

    def test_a_decorator_with_a_blank_name_is_still_a_lane(self, client, db):
        db.add(Supplier(id="PB-BLANK", name=""))
        db.commit()
        _job(db, "PB-41", "ORDER", _garment(0))
        r = client.post(
            "/production-board/hand-off",
            json={
                "job_id": "PB-41",
                "from_lane": "picking",
                "to_lane": "decorator:PB-BLANK",
            },
        )
        assert r.status_code == 200, r.text
        lane = next(
            x for x in _board(client)["lanes"] if x["key"] == "decorator:PB-BLANK"
        )
        assert lane["label"] == "PB-BLANK"

    def test_work_at_a_removed_decorator_can_still_change_hands(self, client, db):
        db.add(Supplier(id="PB-GONE", name="Gone Prints"))
        db.commit()
        _job(db, "PB-42", "ORDER", _garment(0))
        hand = {
            "job_id": "PB-42",
            "from_lane": "picking",
            "to_lane": "decorator:PB-GONE",
        }
        assert client.post("/production-board/hand-off", json=hand).status_code == 200
        db.delete(db.get(Supplier, "PB-GONE"))
        db.commit()
        again = {**hand, "from_lane": "decorator:PB-GONE", "holder": "Ana"}
        r = client.post("/production-board/hand-off", json=again)
        assert r.status_code == 200, r.text

    def test_customers_own_garments_go_straight_to_their_decoration(self, client, db):
        job = _job(db, "PB-43", "ORDER")
        db.add(
            JobItem(
                job_id=job.id,
                sort=0,
                stock_code="EMB.PB43",
                order_qty=10,
                supply_qty=10,
                logo_id=_logo(db, "EMB.PB43").id,
            )
        )
        db.commit()
        cards = _cards(_board(client), "PB-43")
        assert set(cards) == {"embroidery"}
        assert cards["embroidery"]["lines"][0]["decoration"] == ["EMB.PB43"]

    def test_a_line_for_nothing_is_not_left_at_picking(self, client, db):
        _job(db, "PB-44", "Picked", _garment(0, picked=4), _garment(1, "CAP", qty=0))
        assert set(_cards(_board(client), "PB-44")) == {"packing"}

    def test_a_job_with_nothing_to_hand_on_says_so(self, client, db):
        _job(db, "PB-45", "ORDER")
        r = client.post(
            "/production-board/hand-off",
            json={"job_id": "PB-45", "from_lane": "picking", "to_lane": "packing"},
        )
        assert r.status_code == 409
        assert "no garments" in r.json()["detail"]

"""Orders from the online store: the portal account, and what intake records.

Owner decision of 2026-10-25 for F26: a fifth, limited 'portal' role that can
only create jobs and comment on its own intake. And the findings that go with
it:

- F26: the portal had to hold a full staff account, which can read supplier
  bills and money reports, delete jobs and pay bills;
- F01: a retried portal order became a second job, and search could not find
  a job by its portal order number;
- F10: fields the server does not know were accepted and silently dropped, so
  the portal was told its data was saved when it was not;
- F28: intake wrote no comment — the trail of who took the order and on what
  terms — so the portal posted each one itself.
"""

import pytest
from starlette.testclient import TestClient

from app.core.dependencies import get_current_user, get_db, get_signed_in_user
from app.main import app
from app.models.customer import Customer
from app.models.job import Job, JobComment
from app.models.user import User


@pytest.fixture
def customer(db):
    db.add(Customer(id="CFG", name="CFG Mining", credit_limit=5000.0))
    db.add(Customer(id="OTH", name="Other Co", credit_limit=5000.0))
    db.commit()


class _Acting:
    """A client that answers as one fixed account on every request.

    The app's overrides are global, so two clients made the usual way both
    answer as whichever was made last. These set the account per request.
    """

    def __init__(self, user, session):
        self.user, self.session = user, session

    def __getattr__(self, method):
        def call(*args, **kwargs):
            app.dependency_overrides[get_db] = lambda: self.session
            app.dependency_overrides[get_current_user] = lambda: self.user
            app.dependency_overrides[get_signed_in_user] = lambda: self.user
            with TestClient(app) as c:
                return getattr(c, method)(*args, **kwargs)

        return call


def _account(db, role):
    user = User(
        username=f"pi_{role}",
        email=f"pi_{role}@test.com",
        full_name=f"Intake {role}",
        hashed_password="unused",
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def portal(db, customer):
    yield _Acting(_account(db, "portal"), db)
    app.dependency_overrides.clear()


@pytest.fixture
def staff(db, customer):
    yield _Acting(_account(db, "admin"), db)
    app.dependency_overrides.clear()


def _order(serial="7700101", customer_id="CFG", **fields):
    return {
        "customer_id": customer_id,
        "status": "New",
        "serial_no": serial,
        "name_contact": "Jo Bloggs",
        "items": [{"stock_code": "POLO-M", "order_qty": 2, "price_ex": 30}],
        **fields,
    }


def _comments(db, job_id):
    db.expire_all()
    return [
        c.comment
        for c in db.query(JobComment).filter_by(job_id=job_id).order_by(JobComment.id)
    ]


# ── F26: the portal account can book orders and nothing else ────────────────


@pytest.mark.integration
class TestThePortalRole:
    def test_it_books_an_order(self, portal, db):
        r = portal.post("/jobs", json=_order())
        assert r.status_code == 200, r.text
        job = db.get(Job, r.json()["id"])
        assert (job.status, job.item_no, job.serial_no) == (
            "New",
            "NOP.ONLINE",
            "7700101",
        )
        assert job.created_by_user_id is not None

    @pytest.mark.parametrize(
        "method, path",
        [
            ("get", "/jobs"),
            ("get", "/ap/bills"),
            ("get", "/reports/aged-receivables"),
            ("get", "/purchase-orders"),
            ("get", "/inventory"),
            ("get", "/customers"),
            ("delete", "/jobs/110000"),
            ("post", "/jobs/110000/status"),
        ],
    )
    def test_it_reaches_nothing_else(self, portal, method, path):
        r = getattr(portal, method)(
            path, **({"json": {"status": "ORDER"}} if method == "post" else {})
        )
        assert r.status_code == 403

    def test_it_books_as_new_for_the_shop_to_confirm(self, portal):
        r = portal.post("/jobs", json=_order(status="ORDER"))
        assert r.status_code == 422
        assert "New" in r.json()["detail"]

    def test_an_order_carries_its_order_number(self, portal):
        body = _order()
        del body["serial_no"]
        r = portal.post("/jobs", json=body)
        assert r.status_code == 422
        assert "order number" in r.json()["detail"]

    def test_it_comments_on_its_own_orders_only(self, portal, staff, db):
        mine = portal.post("/jobs", json=_order()).json()["id"]
        assert (
            portal.post(
                f"/jobs/{mine}/comments", json={"comment": "Paid by card"}
            ).status_code
            == 200
        )
        db.add(Job(id="STAFF-1", customer_id="CFG", status="ORDER"))
        db.commit()
        assert (
            portal.post("/jobs/STAFF-1/comments", json={"comment": "x"}).status_code
            == 404
        )

    def test_what_it_can_call_is_two_things(self, portal):
        from app.core.access import role_access
        from app.main import app

        allowed = set(role_access(app, "portal")["allowed"])
        assert {"POST /jobs", "POST /jobs/{job_id}/comments"} <= allowed
        assert not {
            a for a in allowed if not a.startswith(("POST /jobs", "GET /users/me"))
        }


# ── F01: a retried order is the same order ───────────────────────────────────


@pytest.mark.integration
class TestARetriedOrderIsNotASecondJob:
    def test_the_same_order_number_again_is_refused_with_the_job_it_already_made(
        self, portal, db
    ):
        first = portal.post("/jobs", json=_order()).json()
        again = portal.post("/jobs", json=_order())
        assert again.status_code == 409
        assert again.json()["detail"]["job_id"] == first["id"]
        assert db.query(Job).filter_by(serial_no="7700101").count() == 1

    def test_a_cancelled_order_does_not_block_its_replacement(self, portal, staff, db):
        first = portal.post("/jobs", json=_order()).json()
        staff.post(f"/jobs/{first['id']}/status", json={"status": "CANCEL"})
        assert portal.post("/jobs", json=_order()).status_code == 200

    def test_the_same_number_for_another_customer_is_another_order(self, portal):
        portal.post("/jobs", json=_order())
        assert portal.post("/jobs", json=_order(customer_id="OTH")).status_code == 200

    def test_staff_keying_a_portal_order_by_hand_are_held_to_it_too(
        self, portal, staff
    ):
        portal.post("/jobs", json=_order())
        r = staff.post("/jobs", json=_order(item_no="NOP.ONLINE"))
        assert r.status_code == 409

    def test_search_finds_a_job_by_its_order_number_and_contact(self, portal, staff):
        made = portal.post("/jobs", json=_order()).json()["id"]
        for term in ("7700101", "Bloggs"):
            found = [
                j["id"] for j in staff.get("/jobs", params={"search": term}).json()
            ]
            assert found == [made], term


# ── F10: what the server does not know, it says so ───────────────────────────


@pytest.mark.integration
class TestUnknownFieldsAreRefused:
    def test_an_unknown_job_field(self, portal):
        r = portal.post("/jobs", json=_order(staff_number="E1234"))
        assert r.status_code == 422
        assert "staff_number" in str(r.json()["detail"])

    def test_an_unknown_line_field(self, portal):
        body = _order()
        body["items"][0]["colour_way"] = "Navy"
        r = portal.post("/jobs", json=body)
        assert r.status_code == 422
        assert "colour_way" in str(r.json()["detail"])

    def test_a_save_from_the_job_form_still_goes_through(self, client, customer):
        """Every field the job form sends is one the server knows."""
        r = client.post(
            "/jobs",
            json={
                "customer_id": "CFG",
                "customer_name": "CFG Mining",
                "status": "QUOTE",
                "invoice": None,
                "payment_status": "unpaid",
                "invoice_status": "not_invoiced",
                "proof_status": "none",
                "fuel_levy": 0,
                "deposit": 0,
                "balance_due": 0,
                "items": [
                    {
                        "sort": 0,
                        "display_type": "product",
                        "stock_code": "POLO-M",
                        "order_qty": 1,
                        "supply_qty": 0,
                        "qty": 0,
                        "b_ord": 0,
                        "qty_pick": 0,
                        "qty_delivered": 0,
                        "qty_invoiced": 0,
                        "weight_kg": 0,
                        "purchase_price": 0,
                        "margin": 0,
                        "margin_percent": 0,
                        "discount": 0,
                        "price_ex": 10,
                        "price_inc": 11,
                        "total": 10,
                        "hide": False,
                        "tax_type": "",
                        "item_status": "",
                        "po_no": "",
                        "po_due": "",
                    }
                ],
            },
        )
        assert r.status_code == 200, r.text


# ── F28: intake writes the trail ─────────────────────────────────────────────


@pytest.mark.integration
class TestIntakeWritesTheTrail:
    def test_a_portal_order_says_it_was_booked_from_the_portal(self, portal, db):
        job_id = portal.post("/jobs", json=_order()).json()["id"]
        assert _comments(db, job_id) == ["Booked from the online store — order 7700101"]

    def test_a_job_keyed_by_hand_says_who_made_it_and_how(self, client, customer, db):
        job_id = client.post(
            "/jobs", json={"customer_id": "CFG", "status": "QUOTE"}
        ).json()["id"]
        assert _comments(db, job_id) == ["Created as QUOTE"]

    def test_confirming_an_order_on_account_records_the_credit_check(
        self, portal, staff, db
    ):
        job_id = portal.post("/jobs", json=_order()).json()["id"]
        assert (
            staff.post(f"/jobs/{job_id}/status", json={"status": "ORDER"}).status_code
            == 200
        )
        trail = _comments(db, job_id)
        assert any(
            c.startswith("Ordered on account — proceed with order") for c in trail
        ), trail

    def test_a_comment_comes_back_as_written(self, client, customer):
        job_id = client.post("/jobs", json={"customer_id": "CFG"}).json()["id"]
        r = client.post(f"/jobs/{job_id}/comments", json={"comment": "Rang the site"})
        assert r.json()["comment"]["comment"] == "Rang the site"
        assert r.json()["comment"]["initials"]


@pytest.mark.integration
def test_the_store_is_never_shown_the_staffs_watchout(portal, db):
    db.get(Customer, "CFG").watchout = "Slow payer - COD only"
    db.commit()
    r = portal.post("/jobs", json=_order())
    assert r.status_code == 200, r.text
    assert "customer_watchout" not in r.json()

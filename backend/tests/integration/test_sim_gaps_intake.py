"""Intake and job lines: the gaps the 2026-10-26 re-check found still open.

The decided fix for each is in docs/superpowers/plans/2026-10-26-simulation-gap-fixes.md.

- F01: the duplicate-order check read, then wrote, so two overlapping retries
  both booked; and a PATCH could give a job an order number already booked;
- F02: a saved line edited into a logo's code stayed goods, and was bought;
- F09: a line could take another customer's logo, or an inactive one;
- F12: a portal decoration line with an unregistered code was bought as a
  garment;
- F19: `applies_to_item_id` was not checked — another job's line, the line
  itself, a line that is not there;
- F26: the portal read a logo's cost back through the intake response.
"""

import pytest

from app.models.customer import Customer
from app.models.job import JobItem
from app.models.logo import Logo
from app.routers import jobs as jobs_router

_COST_FIELDS = ("purchase_price", "margin", "margin_percent")


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


def _book(client, *lines, status="ORDER", **fields):
    r = client.post(
        "/jobs",
        json={"customer_id": "CFG", "status": status, "items": list(lines), **fields},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _line(job, sort):
    return next(i for i in job["items"] if i["sort"] == sort)


def _bought(client):
    return [r["sku"] for r in client.get("/jobs/order-requirements").json()]


# ── F01: one portal order, one job ───────────────────────────────────────────


class _Recorder:
    """A stand-in session on PostgreSQL that records what it is asked to run."""

    class _Bind:
        class dialect:  # noqa: N801 — mirrors the attribute SQLAlchemy exposes
            name = "postgresql"

    def __init__(self):
        self.ran = []

    def get_bind(self):
        return self._Bind()

    def execute(self, statement, params=None):
        self.ran.append((str(statement), params))


@pytest.mark.unit
class TestTheOrderNumberIsLocked:
    def test_postgresql_takes_a_transaction_lock_before_the_check(self):
        db = _Recorder()
        jobs_router._lock_order_number(db, "CFG", " web-1\t")
        [(sql, params)] = db.ran
        assert "pg_advisory_xact_lock" in sql
        assert params == {"key": jobs_router._order_lock_key("CFG", "WEB-1")}

    def test_the_key_is_stable_and_a_signed_64_bit_number(self):
        key = jobs_router._order_lock_key("CFG", "WEB-1")
        # hashlib, not hash(): the same in every process, whatever its seed.
        assert key == jobs_router._order_lock_key("CFG", "web-1")
        assert key == -5539154064513221204
        assert -(2**63) <= key < 2**63
        assert key != jobs_router._order_lock_key("OTH", "WEB-1")
        assert key != jobs_router._order_lock_key("CFG", "WEB-2")

    def test_sqlite_has_one_writer_and_takes_no_lock(self, db):
        jobs_router._lock_order_number(db, "CFG", "WEB-1")


@pytest.mark.integration
class TestAPatchCannotRepeatAnOrder:
    def _portal_job(self, client, serial, item_no="NOP.ONLINE"):
        return _book(
            client, _garment(), status="QUOTE", item_no=item_no, serial_no=serial
        )

    def test_a_new_order_number_already_booked_is_refused(self, client):
        first = self._portal_job(client, "WEB-1")
        second = self._portal_job(client, "WEB-2")
        r = client.patch(f"/jobs/{second['id']}", json={"serial_no": " web-1 "})
        assert r.status_code == 409, r.text
        assert r.json()["detail"]["job_id"] == first["id"]

    def test_becoming_a_portal_order_already_booked_is_refused(self, client):
        first = self._portal_job(client, "WEB-1")
        keyed = self._portal_job(client, "WEB-1", item_no="SALE")
        r = client.patch(f"/jobs/{keyed['id']}", json={"item_no": "NOP.ONLINE"})
        assert r.status_code == 409, r.text
        assert r.json()["detail"]["job_id"] == first["id"]

    def test_a_job_does_not_repeat_itself(self, client):
        first = self._portal_job(client, "WEB-1")
        r = client.patch(
            f"/jobs/{first['id']}", json={"serial_no": "WEB-1", "notes": "rang"}
        )
        assert r.status_code == 200, r.text


# ── F02: a saved line edited into a logo's code is a service ─────────────────


@pytest.mark.integration
class TestASavedLineCanBecomeADecoration:
    def test_it_takes_the_logo_and_is_not_bought(self, client, db):
        logo = _logo(db)
        job = _book(client, _garment(), {"sort": 1, "order_qty": 0})
        r = client.patch(
            f"/jobs/{job['id']}",
            json={
                "items": [
                    {"id": _line(job, 0)["id"]},
                    {
                        "id": _line(job, 1)["id"],
                        "stock_code": "EMB.CFG.LC",
                        "order_qty": 3,
                        "b_ord": 3,
                    },
                ]
            },
        )
        assert r.status_code == 200, r.text
        emb = _line(r.json(), 1)
        assert emb["logo_id"] == logo.id
        assert (emb["supply_qty"], emb["b_ord"]) == (3, 0)
        assert (emb["price_ex"], emb["decoration_type"]) == (7.0, "EMB")
        assert "EMB.CFG.LC" not in _bought(client)

    def test_it_gives_up_its_reservation(self, client, db, make_inventory):
        # Jim2 holds a logo as a stock item too, so its code can be a SKU.
        make_inventory(sku="EMB.CFG.LC", stock=10)
        _logo(db)
        job = _book(client, _garment(), {"sort": 1, "order_qty": 0})
        r = client.patch(
            f"/jobs/{job['id']}",
            json={
                "items": [
                    {"id": _line(job, 0)["id"]},
                    {
                        "id": _line(job, 1)["id"],
                        "stock_code": "EMB.CFG.LC",
                        "order_qty": 3,
                        "supply_qty": 3,
                        "b_ord": 0,
                    },
                ]
            },
        )
        assert r.status_code == 200, r.text
        listed = {i["sku"]: i["committed_qty"] for i in client.get("/inventory").json()}
        assert listed["EMB.CFG.LC"] == 0


# ── F09: a line applies its own customer's active logos only ─────────────────


@pytest.mark.integration
class TestALineAppliesItsCustomersLogo:
    def test_another_customers_code_is_not_their_logo(self, client, db):
        _logo(db, code="EMB.OTH.LC", customer_id="OTH")
        job = _book(client, _garment(), {"stock_code": "EMB.OTH.LC", "sort": 1})
        assert _line(job, 1)["logo_id"] is None

    def test_another_customers_logo_by_id_is_refused(self, client, db):
        other = _logo(db, code="EMB.OTH.LC", customer_id="OTH")
        r = client.post(
            "/jobs",
            json={
                "customer_id": "CFG",
                "items": [_garment(), {"logo_id": other.id, "order_qty": 3, "sort": 1}],
            },
        )
        assert r.status_code == 422, r.text

    def test_an_inactive_logo_is_not_applied(self, client, db):
        old = _logo(db, is_active=False)
        job = _book(client, _garment(), {"stock_code": "EMB.CFG.LC", "sort": 1})
        assert _line(job, 1)["logo_id"] is None
        r = client.post(
            "/jobs",
            json={
                "customer_id": "CFG",
                "items": [_garment(), {"logo_id": old.id, "order_qty": 3, "sort": 1}],
            },
        )
        assert r.status_code == 422, r.text

    def test_a_patch_cannot_name_another_customers_logo(self, client, db):
        other = _logo(db, code="EMB.OTH.LC", customer_id="OTH")
        job = _book(client, _garment(), {"sort": 1, "order_qty": 3})
        r = client.patch(
            f"/jobs/{job['id']}",
            json={
                "items": [
                    {"id": _line(job, 0)["id"]},
                    {"id": _line(job, 1)["id"], "logo_id": other.id},
                ]
            },
        )
        assert r.status_code == 422, r.text


# ── F12: the portal registers a logo before ordering it ──────────────────────


def _portal_order(*lines):
    return {
        "customer_id": "CFG",
        "status": "New",
        "serial_no": "WEB-77",
        "items": [_garment(), *lines],
    }


@pytest.mark.integration
class TestThePortalOrdersRegisteredDecoration:
    def test_an_unregistered_decoration_code_is_refused(self, client_as):
        portal = client_as("portal")
        r = portal.post(
            "/jobs",
            json=_portal_order(
                {
                    "stock_code": "EMB.CFG.NEW",
                    "decoration_type": "EMB",
                    "order_qty": 2,
                    "sort": 1,
                }
            ),
        )
        assert r.status_code == 422, r.text
        assert "EMB.CFG.NEW" in r.json()["detail"]
        assert "register the logo" in r.json()["detail"]

    def test_a_registered_logo_is_booked(self, client_as, db):
        _logo(db)
        portal = client_as("portal")
        r = portal.post(
            "/jobs",
            json=_portal_order(
                {
                    "stock_code": "EMB.CFG.LC",
                    "decoration_type": "EMB",
                    "order_qty": 3,
                    "sort": 1,
                }
            ),
        )
        assert r.status_code == 200, r.text

    def test_a_garment_decorated_in_place_is_booked(self, client_as, make_inventory):
        make_inventory(sku="POLO-EMB", stock=5)
        portal = client_as("portal")
        r = portal.post(
            "/jobs",
            json=_portal_order(
                {
                    "stock_code": "POLO-EMB",
                    "decoration_type": "EMB",
                    "order_qty": 2,
                    "sort": 1,
                }
            ),
        )
        assert r.status_code == 200, r.text

    def test_a_line_done_to_a_garment_is_booked(self, client_as):
        portal = client_as("portal")
        r = portal.post(
            "/jobs",
            json=_portal_order(
                {
                    "stock_code": "EMB.CFG.NEW",
                    "decoration_type": "EMB",
                    "order_qty": 3,
                    "sort": 1,
                    "applies_to_line": 0,
                }
            ),
        )
        assert r.status_code == 200, r.text

    def test_staff_lines_are_not_refused(self, client):
        job = _book(
            client,
            _garment(),
            {
                "stock_code": "EMB.CFG.NEW",
                "decoration_type": "EMB",
                "order_qty": 2,
                "sort": 1,
            },
        )
        assert _line(job, 1)["stock_code"] == "EMB.CFG.NEW"


# ── F19: a line applies to a goods line on its own job ───────────────────────


def _apply(client, job, target_id, sort=1):
    return client.patch(
        f"/jobs/{job['id']}",
        json={
            "items": [
                (
                    {"id": i["id"]}
                    if i["sort"] != sort
                    else {"id": i["id"], "applies_to_item_id": target_id}
                )
                for i in job["items"]
            ]
        },
    )


@pytest.mark.integration
class TestAppliesToNamesAGoodsLineOnTheJob:
    def _job(self, client):
        return _book(
            client,
            _garment(),
            {"stock_code": "ALT.HEM", "order_qty": 3, "sort": 1, "price_ex": 4.0},
        )

    def test_a_line_on_another_job_is_refused(self, client):
        other = self._job(client)
        job = self._job(client)
        r = _apply(client, job, _line(other, 0)["id"])
        assert r.status_code == 422, r.text

    def test_the_line_itself_is_refused(self, client):
        job = self._job(client)
        r = _apply(client, job, _line(job, 1)["id"])
        assert r.status_code == 422, r.text

    def test_a_line_that_is_not_there_is_refused(self, client):
        job = self._job(client)
        r = _apply(client, job, 999999)
        assert r.status_code == 422, r.text

    def test_a_service_line_is_refused(self, client, db):
        _logo(db)
        job = _book(
            client,
            _garment(),
            {"stock_code": "EMB.CFG.LC", "order_qty": 3, "sort": 1},
            {"stock_code": "ALT.HEM", "order_qty": 3, "sort": 2},
        )
        r = _apply(client, job, _line(job, 1)["id"], sort=2)
        assert r.status_code == 422, r.text

    def test_a_new_job_has_no_line_ids_to_name(self, client):
        other = self._job(client)
        r = client.post(
            "/jobs",
            json={
                "customer_id": "CFG",
                "items": [
                    _garment(),
                    {
                        "stock_code": "ALT.HEM",
                        "order_qty": 3,
                        "sort": 1,
                        "applies_to_item_id": _line(other, 0)["id"],
                    },
                ],
            },
        )
        assert r.status_code == 422, r.text

    def test_its_own_garment_is_accepted(self, client, db):
        job = self._job(client)
        garment = _line(job, 0)["id"]
        r = client.patch(
            f"/jobs/{job['id']}",
            json={
                "items": [
                    {"id": garment},
                    {"id": _line(job, 1)["id"]},
                    {
                        "stock_code": "ALT.POCKET",
                        "order_qty": 3,
                        "sort": 2,
                        "applies_to_item_id": garment,
                    },
                ]
            },
        )
        assert r.status_code == 200, r.text
        alt = _line(r.json(), 2)
        assert alt["applies_to_item_id"] == garment
        assert (alt["supply_qty"], alt["b_ord"]) == (3, 0)
        assert db.get(JobItem, alt["id"]).is_service


# ── F26: the portal is not told what anything costs ──────────────────────────


@pytest.mark.integration
class TestThePortalReadsNoCost:
    def test_the_intake_response_has_no_cost_or_margin(self, client_as, db):
        _logo(db)
        portal = client_as("portal")
        r = portal.post(
            "/jobs",
            json=_portal_order({"stock_code": "EMB.CFG.LC", "order_qty": 3, "sort": 1}),
        )
        assert r.status_code == 200, r.text
        for line in r.json()["items"]:
            assert not set(_COST_FIELDS) & set(line), line
        assert _line(r.json(), 1)["price_ex"] == 7.0

    def test_another_customers_logo_is_not_there(self, client_as, db):
        other = _logo(db, code="EMB.OTH.LC", customer_id="OTH")
        portal = client_as("portal")
        r = portal.post(
            "/jobs",
            json=_portal_order({"logo_id": other.id, "order_qty": 3, "sort": 1}),
        )
        assert r.status_code == 422, r.text
        assert "3.21" not in r.text

    def test_staff_still_read_the_cost(self, client, db):
        _logo(db)
        job = _book(client, _garment(), {"stock_code": "EMB.CFG.LC", "sort": 1})
        assert _line(job, 1)["purchase_price"] == 3.21

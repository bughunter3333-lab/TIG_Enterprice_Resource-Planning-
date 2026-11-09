"""Time at each status (docs/superpowers/specs/2026-11-09-status-times.md):
when a job came to its status, and how long it may sit there."""

from datetime import datetime, timezone

import pytest

from app.core import status_times
from app.models.customer import Customer
from app.models.job import Job

pytestmark = pytest.mark.integration


def _job(db, job_id="ST-1", status="New"):
    if not db.get(Customer, "ST-C"):
        db.add(Customer(id="ST-C", name="Times Co", credit_limit=99999.0))
    db.add(Job(id=job_id, customer_id="ST-C", customer_name="Times Co", status=status))
    db.commit()


class TestWhenAJobCameToItsStatus:
    def test_every_move_stamps_it(self, client, db):
        _job(db)
        before = datetime.now(timezone.utc)
        assert (
            client.post("/jobs/ST-1/status", json={"status": "ORDER"}).status_code
            == 200
        )
        db.expire_all()
        stamped = db.get(Job, "ST-1").status_changed_at
        assert stamped is not None
        if stamped.tzinfo is None:
            stamped = stamped.replace(tzinfo=timezone.utc)
        assert stamped >= before.replace(microsecond=0)

    def test_it_reaches_the_screen(self, client, db):
        _job(db, "ST-2")
        client.post("/jobs/ST-2/status", json={"status": "ORDER"})
        assert client.get("/jobs/ST-2").json()["status_changed_at"]

    def test_a_new_job_is_stamped_as_it_is_made(self, client, db):
        _job(db, "ST-0")  # the customer
        made = client.post(
            "/jobs", json={"customer_id": "ST-C", "status": "New"}
        ).json()
        assert made["status_changed_at"]


class TestTheAllowances:
    def test_everyone_reads_them_with_the_defaults(self, client_as):
        r = client_as("overseas_staff").get("/status-allowances")
        assert r.status_code == 200
        assert r.json() == status_times.DEFAULT_ALLOWANCES

    def test_an_admin_changes_one_and_the_rest_stay(self, client):
        r = client.put(
            "/status-allowances", json={"allowances": {"PROOF": 5, "ProdExt": 0}}
        )
        assert r.status_code == 200, r.text
        now = client.get("/status-allowances").json()
        assert (now["PROOF"], now["ProdExt"], now["New"]) == (5, 0, 1)

    def test_only_admins_change_them(self, client_as):
        r = client_as("manager").put(
            "/status-allowances", json={"allowances": {"PROOF": 5}}
        )
        assert r.status_code == 403

    @pytest.mark.parametrize(
        "allowances",
        [
            {"QUOTE": 3},
            {"INVOICE": 3},
            {"Nonsense": 1},
            {"PROOF": -1},
            {"PROOF": 61},
            {"PROOF": "3"},
        ],
    )
    def test_only_open_statuses_and_sensible_days(self, client, allowances):
        assert (
            client.put(
                "/status-allowances", json={"allowances": allowances}
            ).status_code
            == 422
        )

    def test_a_broken_setting_falls_back_to_the_defaults(self, client, db):
        from app.models.admin_setting import AdminSetting

        db.add(AdminSetting(key=status_times.SETTING_KEY, value="{not json"))
        db.commit()
        assert (
            client.get("/status-allowances").json() == status_times.DEFAULT_ALLOWANCES
        )

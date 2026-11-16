"""Two requests that met on the same rows: the one Postgres stopped is told to
try again, not shown a server error.

The lock order (app/core/row_locks.py) keeps the paths it covers from
deadlocking; tests/postgres proves those on real Postgres. Whatever still meets
— a lock wait too long, a version another request moved — is a conflict with
nothing saved, which is a 409 and a reason, not a 500 and a crash report.
"""

import pytest
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm.exc import StaleDataError

from app.models.job import Job
from app.routers import jobs as jobs_router

pytestmark = pytest.mark.integration


class _PgError(Exception):
    def __init__(self, pgcode):
        super().__init__(f"pg error {pgcode}")
        self.pgcode = pgcode


@pytest.fixture
def quote(db, make_customer):
    make_customer(id="TRY-C")
    db.add(Job(id="TRY-1", customer_id="TRY-C", customer_name="Try", status="QUOTE"))
    db.commit()
    return "TRY-1"


def _failing_with(monkeypatch, error):
    def fail(*args, **kwargs):
        raise error

    monkeypatch.setattr(jobs_router, "_apply_status_transition", fail)


@pytest.mark.parametrize(
    "pgcode",
    [
        "40P01",  # deadlock detected
        "40001",  # serialization failure
        "55P03",  # lock not available (lock_timeout)
    ],
)
def test_a_meeting_on_the_same_rows_is_a_conflict(client, quote, monkeypatch, pgcode):
    _failing_with(
        monkeypatch, OperationalError("UPDATE customers", {}, _PgError(pgcode))
    )
    r = client.post(f"/jobs/{quote}/status", json={"status": "ORDER"})
    assert r.status_code == 409
    assert "try again" in r.json()["detail"].lower()


def test_a_job_another_request_changed_first_is_a_conflict(client, quote, monkeypatch):
    _failing_with(monkeypatch, StaleDataError("UPDATE jobs matched 0 rows"))
    r = client.post(f"/jobs/{quote}/status", json={"status": "ORDER"})
    assert r.status_code == 409
    assert "try again" in r.json()["detail"].lower()


def test_any_other_database_failure_is_still_a_server_error(client, quote, monkeypatch):
    _failing_with(
        monkeypatch, OperationalError("SELECT 1", {}, _PgError("08006"))
    )  # connection failure
    r = client.post(f"/jobs/{quote}/status", json={"status": "ORDER"})
    assert r.status_code == 500

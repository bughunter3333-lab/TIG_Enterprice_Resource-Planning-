"""Editing a stock position: who is allowed to, and what it leaves behind.

Three things are asserted here that the endpoints did not previously do.

The first is the permission boundary. Stock is the ledger every price and every
pick reads from, so changing what a position *says* is now admin or manager;
staff still move stock through jobs and still read the trail.

The second is that a bin can be emptied. `PATCH` built its update with
`exclude_none=True`, which cannot tell "leave this alone" from "clear this" —
so a bin could be filled once and never removed, and the picking slip kept
sending people to a shelf the stock had left.

The third is the trail itself. It is written per field rather than per save,
because the question people actually ask is which change moved a SKU, not who
pressed Save.
"""

import pytest

from app.models.user import User
from app.models.stock_audit import StockAuditEntry
from app.core.security import hash_password
from app.core.dependencies import get_current_user
from app.database import get_db
from app.main import app
from starlette.testclient import TestClient


@pytest.fixture
def manager_client(test_db_session):
    user = User(
        username="testmanager",
        email="manager@test.com",
        full_name="Test Manager",
        hashed_password=hash_password("password123"),
        role="manager",
        is_active=True,
    )
    test_db_session.add(user)
    test_db_session.commit()

    def _override_db():
        yield test_db_session

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: user
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def item(make_inventory):
    return make_inventory(sku="MR.PS60.NAV", name="Navy Polo")


def _audit(db, sku="MR.PS60.NAV"):
    return (
        db.query(StockAuditEntry)
        .filter(StockAuditEntry.sku == sku)
        .order_by(StockAuditEntry.id)
        .all()
    )


class TestPermissions:
    def test_staff_cannot_change_what_a_position_says(self, staff_client, item):
        r = staff_client.post(
            f"/inventory/{item.sku}/locations",
            json={"branch": "HQ", "primary_bin_1": "B.3.H.1"},
        )
        assert r.status_code == 403

    def test_a_manager_can(self, manager_client, item):
        r = manager_client.post(
            f"/inventory/{item.sku}/locations",
            json={"branch": "HQ", "primary_bin_1": "B.3.H.1"},
        )
        assert r.status_code == 200
        assert r.json()["primary_bin_1"] == "B.3.H.1"

    def test_staff_can_still_read_the_trail(self, staff_client, client, item):
        client.post(
            f"/inventory/{item.sku}/locations",
            json={"branch": "HQ", "primary_bin_1": "B.3.H.1"},
        )
        r = staff_client.get(f"/inventory/{item.sku}/history")
        assert r.status_code == 200
        assert len(r.json()) >= 1


class TestClearingABin:
    def test_a_bin_sent_as_null_is_emptied(self, client, item, db):
        client.post(
            f"/inventory/{item.sku}/locations",
            json={
                "branch": "HQ",
                "primary_bin_1": "B.3.H.1",
                "primary_bin_2": "B.4.A.2",
            },
        )
        r = client.patch(
            f"/inventory/{item.sku}/locations/HQ",
            json={"primary_bin_2": None},
        )
        assert r.status_code == 200
        assert r.json()["primary_bin_2"] is None
        # ...and the bin that was not mentioned is untouched.
        assert r.json()["primary_bin_1"] == "B.3.H.1"

    def test_a_field_left_out_is_not_wiped(self, client, item):
        client.post(
            f"/inventory/{item.sku}/locations",
            json={"branch": "HQ", "zone": "C", "primary_bin_1": "B.3.H.1"},
        )
        r = client.patch(
            f"/inventory/{item.sku}/locations/HQ",
            json={"primary_bin_1": "B.3.H.2"},
        )
        assert r.json()["zone"] == "C"


class TestTheTrail:
    def test_creating_a_position_records_the_fields_that_were_set(
        self, client, item, db
    ):
        client.post(
            f"/inventory/{item.sku}/locations",
            json={"branch": "HQ", "primary_bin_1": "B.3.H.1"},
        )
        rows = _audit(db)
        created = [r for r in rows if r.field == "primary_bin_1"]
        assert len(created) == 1
        assert created[0].action == "created"
        assert created[0].old_value is None
        assert created[0].new_value == "B.3.H.1"
        assert created[0].changed_by == "testadmin"
        assert created[0].branch == "HQ"

    def test_only_the_field_that_moved_is_recorded(self, client, item, db):
        client.post(
            f"/inventory/{item.sku}/locations",
            json={"branch": "HQ", "zone": "C", "primary_bin_1": "B.3.H.1"},
        )
        before = len(_audit(db))
        client.patch(
            f"/inventory/{item.sku}/locations/HQ",
            json={"zone": "C", "primary_bin_1": "B.10.A.2"},
        )
        new_rows = _audit(db)[before:]
        # The zone was resent unchanged, so it is not an edit.
        assert [(r.field, r.old_value, r.new_value) for r in new_rows] == [
            ("primary_bin_1", "B.3.H.1", "B.10.A.2")
        ]

    def test_removing_a_position_is_one_event(self, client, item, db):
        client.post(
            f"/inventory/{item.sku}/locations",
            json={"branch": "HQ", "primary_bin_1": "B.3.H.1"},
        )
        client.delete(f"/inventory/{item.sku}/locations/HQ")
        deleted = [r for r in _audit(db) if r.action == "deleted"]
        assert len(deleted) == 1
        assert deleted[0].field == "location"
        assert deleted[0].old_value == "HQ"

    def test_history_reads_newest_first(self, client, item):
        client.post(
            f"/inventory/{item.sku}/locations",
            json={"branch": "HQ", "primary_bin_1": "B.1.A.1"},
        )
        client.patch(
            f"/inventory/{item.sku}/locations/HQ", json={"primary_bin_1": "B.2.A.1"}
        )
        rows = client.get(f"/inventory/{item.sku}/history").json()
        assert rows[0]["new_value"] == "B.2.A.1"
        assert rows[0]["action"] == "updated"
        assert rows[-1]["new_value"] == "B.1.A.1"

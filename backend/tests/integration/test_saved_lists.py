"""
Integration tests for /saved-lists — server-synced nav-tree lists.

Jim2 model: per-user lists, max 25 per node; filter_json NULL = created but
not yet run.
"""

import pytest
from app.models.saved_list import SavedList


@pytest.mark.integration
class TestSavedListsCRUD:
    def test_list_empty(self, client):
        r = client.get("/saved-lists")
        assert r.status_code == 200
        assert r.json() == []

    def test_create_and_list(self, client):
        r = client.post(
            "/saved-lists",
            json={"id": "JL-1", "name": "Job List 1", "node": "jobs", "filter": None},
        )
        assert r.status_code in (200, 201)
        rows = client.get("/saved-lists").json()
        assert len(rows) == 1
        assert rows[0]["id"] == "JL-1"
        assert rows[0]["name"] == "Job List 1"
        assert rows[0]["node"] == "jobs"
        assert rows[0]["filter"] is None

    def test_update_filter_marks_run(self, client):
        client.post(
            "/saved-lists",
            json={"id": "JL-2", "name": "Job List 1", "node": "jobs", "filter": None},
        )
        r = client.patch("/saved-lists/JL-2", json={"filter": {"status": "ORDER"}})
        assert r.status_code == 200
        rows = client.get("/saved-lists").json()
        assert rows[0]["filter"] == {"status": "ORDER"}

    def test_delete(self, client):
        client.post(
            "/saved-lists",
            json={"id": "JL-3", "name": "Job List 1", "node": "jobs", "filter": None},
        )
        r = client.delete("/saved-lists/JL-3")
        assert r.status_code == 200
        assert client.get("/saved-lists").json() == []

    def test_update_missing_returns_404(self, client):
        r = client.patch("/saved-lists/NOPE", json={"name": "x"})
        assert r.status_code == 404


@pytest.mark.integration
class TestSavedListsRules:
    def test_cap_25_per_node(self, client):
        for i in range(25):
            r = client.post(
                "/saved-lists",
                json={
                    "id": f"JL-{i}",
                    "name": f"Job List {i+1}",
                    "node": "jobs",
                    "filter": None,
                },
            )
            assert r.status_code in (200, 201)
        r = client.post(
            "/saved-lists",
            json={"id": "JL-26", "name": "Job List 26", "node": "jobs", "filter": None},
        )
        assert r.status_code == 409
        # other nodes have their own budget
        r = client.post(
            "/saved-lists",
            json={
                "id": "SL-1",
                "name": "Stock List 1",
                "node": "stock",
                "filter": None,
            },
        )
        assert r.status_code in (200, 201)

    def test_lists_are_per_user(self, client, db, admin_user):
        # A row belonging to a different user must not appear for the current user.
        db.add(
            SavedList(
                id="OTHER-1",
                user_id=admin_user.id + 999,
                node="jobs",
                name="Someone else's list",
                filter_json=None,
            )
        )
        db.commit()
        rows = client.get("/saved-lists").json()
        assert all(row["id"] != "OTHER-1" for row in rows)

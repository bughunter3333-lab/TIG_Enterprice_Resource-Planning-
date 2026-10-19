"""The role list, held in one place and mirrored once.

A role that the permission checks recognise but the create endpoint rejects is
worse than no role at all: it reads as available, and the first person who tries
to use it is told the value is invalid. That is exactly how `manager` shipped.
The frontend's copy is compared here for the same reason the branch list is —
two lists that key access to the system should not be able to disagree quietly.
"""

import pathlib
import re

import pytest

from app.core.dependencies import ROLES

FRONTEND_ROLES = (
    pathlib.Path(__file__).resolve().parents[3] / "frontend" / "src" / "roles.js"
)


@pytest.mark.unit
class TestRoleVocabulary:
    def test_the_frontend_offers_exactly_the_roles_the_backend_accepts(self):
        source = FRONTEND_ROLES.read_text(encoding="utf-8")
        declared = re.search(r"export const ROLES = \[([^\]]*)\]", source)
        assert declared, f"no ROLES array in {FRONTEND_ROLES.name}"
        names = tuple(re.findall(r"'([^']+)'", declared.group(1)))
        assert names == ROLES, (
            f"frontend offers {names}, backend accepts {ROLES}. A role missing "
            "from either side is one that can be checked for and never granted."
        )

    def test_every_role_has_a_label(self):
        source = FRONTEND_ROLES.read_text(encoding="utf-8")
        for role in ROLES:
            assert re.search(rf"\b{role}\s*:", source), f"{role} has no label"


@pytest.mark.integration
class TestAssigningARole:
    def _new_user(self, client, role):
        return client.post(
            "/users",
            json={
                "username": f"u_{role}",
                "email": f"{role}@rolecheck.com",
                "full_name": "Someone",
                "password": "Password123",
                "role": role,
            },
        )

    @pytest.mark.parametrize("role", ROLES)
    def test_every_role_can_be_given_to_a_new_account(self, client, role):
        r = self._new_user(client, role)
        assert r.status_code in (200, 201), r.text
        assert r.json()["role"] == role

    def test_an_unknown_role_is_refused_on_create(self, client):
        assert self._new_user(client, "superuser").status_code == 400

    def test_an_unknown_role_is_refused_on_update(self, client):
        uid = self._new_user(client, "staff").json()["id"]
        # A near-miss is the realistic case: it grants nothing, it just locks
        # the person out of everything they could do before.
        r = client.patch(f"/users/{uid}", json={"role": "Admin"})
        assert r.status_code == 400
        assert client.get("/users").json()[-1]["role"] == "staff"

    def test_a_taken_email_is_a_conflict_not_a_crash(self, client):
        self._new_user(client, "staff")
        r = client.post(
            "/users",
            json={
                "username": "someone_else",
                "email": "staff@rolecheck.com",
                "full_name": "Someone Else",
                "password": "Password123",
                "role": "staff",
            },
        )
        assert r.status_code == 409

    def test_an_existing_account_can_be_made_a_manager(self, client):
        uid = self._new_user(client, "staff").json()["id"]
        r = client.patch(f"/users/{uid}", json={"role": "manager"})
        assert r.status_code == 200
        assert r.json()["role"] == "manager"

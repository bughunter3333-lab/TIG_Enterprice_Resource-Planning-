"""Each signed-in person reads what their own role can do: GET /users/me/access.

The website decides what to offer from the answer — which modules the top bar
shows, what Home holds — so it has to be the caller's own role and no other,
counted from the same gates the server holds them to, and the routes it names
have to be routes the server actually serves.
"""

import re

import pytest
from starlette.routing import Match

from app.core.access import access_table
from app.core.dependencies import ROLES
from app.core.security import create_access_token
from app.main import app
from app.models.user import User


def _column(role):
    return [
        {"area": a["area"], "view": a["view"][role], "change": a["change"][role]}
        for a in access_table(app)["areas"]
    ]


def _mine(client_as, role):
    with client_as(role) as c:
        r = c.get("/users/me/access")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.integration
class TestMyOwnAccess:
    @pytest.mark.parametrize("role", ROLES)
    def test_it_is_my_role_and_no_other(self, client_as, role):
        mine = _mine(client_as, role)
        assert set(mine) == {"role", "areas", "allowed"}
        assert mine["role"] == role
        assert mine["areas"] == _column(role)
        assert mine["allowed"] == sorted(set(mine["allowed"]))
        assert "GET /users/me/access" in mine["allowed"]

    @pytest.mark.parametrize(
        "role, has, lacks",
        [
            (
                "admin",
                {"GET /users/access", "GET /accounting/health", "POST /jobs"},
                set(),
            ),
            (
                "manager",
                {"GET /accounting/health", "POST /jobs"},
                {"GET /users/access", "POST /users"},
            ),
            (
                "staff",
                {"POST /jobs", "GET /reports/aged-receivables"},
                {"GET /accounting/health", "GET /users/access"},
            ),
            (
                "overseas_staff",
                {"POST /jobs/{job_id}/status", "GET /reports/on-time-delivery"},
                {"POST /jobs", "GET /reports/aged-receivables", "GET /ap/bills"},
            ),
        ],
    )
    def test_it_names_the_routes_my_role_may_call(self, client_as, role, has, lacks):
        allowed = set(_mine(client_as, role)["allowed"])
        assert has <= allowed, has - allowed
        assert not lacks & allowed, lacks & allowed

    def test_a_route_it_names_answers_at_that_path(self, client_as, make_customer):
        make_customer(id="ACC01")
        template = "GET /reports/customers/{customer_id}/statement"
        with client_as("staff") as c:
            assert template in c.get("/users/me/access").json()["allowed"]
            method, path = template.split(" ", 1)
            r = c.request(method, path.format(customer_id="ACC01"))
        assert r.status_code not in (404, 405), r.text
        assert r.json()["customer"]["id"] == "ACC01"

    def test_every_route_it_names_is_one_the_server_routes(self, client_as):
        """Matched the way the server matches a request, without calling any:
        a path written without its router's prefix, or a method the route
        does not take, matches nothing."""
        unrouted = []
        for item in _mine(client_as, "admin")["allowed"]:
            method, path = item.split(" ", 1)
            scope = {
                "type": "http",
                "method": method,
                "path": re.sub(r"\{[^}]+\}", "1", path),
                "root_path": "",
            }
            if not any(r.matches(scope)[0] == Match.FULL for r in app.router.routes):
                unrouted.append(item)
        assert not unrouted, unrouted

    def test_not_before_choosing_my_own_password(self, unauth_client, db):
        """Someone on a password an admin chose learns only that they must
        choose one (GET /users/me). Through a real cookie, not the test
        override, which would skip the check."""
        user = User(
            username="given",
            email="given@test.com",
            full_name="Given",
            hashed_password="unused",
            role="staff",
            is_active=True,
            must_change_password=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        unauth_client.cookies.set(
            "access_token",
            create_access_token(
                user.id,
                user.role,
                mfa_verified=True,
                token_version=user.token_version or 0,
            ),
        )
        assert unauth_client.get("/users/me").status_code == 200
        r = unauth_client.get("/users/me/access")
        assert r.status_code == 403
        assert r.json()["detail"]["code"] == "password_change_required"

    def test_not_without_signing_in(self, unauth_client):
        assert unauth_client.get("/users/me/access").status_code == 401

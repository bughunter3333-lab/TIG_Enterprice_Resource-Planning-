"""Every route is behind a gate, and the gates respect seniority.

Access here is one thing: the role on the account, checked by the dependency
each route names. Two ways that goes wrong without any test noticing:

1. A route with no gate at all. Nothing fails; it simply answers anyone.
2. A gate spelled out by hand that leaves a role out. Goods receipts and the
   supplier price list were written as ("admin", "staff") before `manager`
   existed — so a manager, senior to staff, was refused where staff were let in.

Both are checked against the routes themselves, so a new router is covered the
day it is added.
"""

import pytest
from fastapi.routing import APIRoute

from app.core.access import access_table, route_roles
from app.core.dependencies import (
    ROLES,
    get_current_user,
    get_signed_in_user,
    require_admin,
    require_role,
)
from app.main import app

# Answer before anyone is signed in — that is their job.
PUBLIC = {
    ("GET", "/health"),
    ("GET", "/health/ready"),
    ("POST", "/auth/login"),
    ("POST", "/auth/verify-2fa"),
    ("POST", "/auth/refresh"),
    ("POST", "/auth/logout"),
}
# Check the sign-in cookie themselves, inside the handler (routers/auth.py,
# _require_authenticated): the change of password has to answer an account
# still on a password an admin chose, which every gate refuses, and the two
# second-factor routes share its check. tests/integration/test_users_admin.py
# holds them to it.
SELF_CHECKED = {
    ("POST", "/auth/setup-2fa"),
    ("POST", "/auth/confirm-2fa"),
    ("POST", "/auth/change-password"),
}


def _routes():
    for route in app.routes:
        if isinstance(route, APIRoute):
            for method in route.methods:
                yield method, route.path, route_roles(route)


@pytest.mark.unit
class TestEveryRouteHasAGate:
    def test_only_the_sign_in_routes_and_health_checks_have_none(self):
        ungated = {(method, path) for method, path, roles in _routes() if roles is None}
        assert ungated == PUBLIC | SELF_CHECKED, (
            "a route is missing its Depends(require_...) — or one was gated that "
            f"must answer before sign-in: {sorted(ungated ^ (PUBLIC | SELF_CHECKED))}"
        )

    def test_a_gate_says_which_roles_it_lets_through(self):
        assert require_role("admin", "manager").roles == ("admin", "manager")
        assert require_admin.roles == ("admin",)


@pytest.mark.unit
class TestOnlyWhoAmIAsksNoMore:
    def test_the_only_route_that_skips_the_own_password_check_is_who_am_i(self):
        """`get_signed_in_user` lets an account through whose password an admin
        chose. A route that used it in place of `get_current_user` would be open
        to it, and every other test here would still pass."""

        def reaches_signed_in_only(dependant):
            for dependency in dependant.dependencies:
                if dependency.call is get_current_user:
                    continue
                if dependency.call is get_signed_in_user:
                    return True
                if reaches_signed_in_only(dependency):
                    return True
            return False

        skipping = {
            (method, route.path)
            for route in app.routes
            if isinstance(route, APIRoute) and reaches_signed_in_only(route.dependant)
            for method in route.methods
        }
        assert skipping == {("GET", "/users/me")}


@pytest.mark.unit
class TestSeniority:
    def test_no_route_lets_a_role_in_while_refusing_one_senior_to_it(self):
        """ROLES runs from most to least senior. Whoever a route admits has to
        be an unbroken run from the top: admin; admin and manager; and so on."""
        broken = [
            f"{method} {path} admits {roles}"
            for method, path, roles in _routes()
            if roles is not None and tuple(roles) != ROLES[: len(roles)]
        ]
        assert not broken, broken

    def test_so_the_table_never_shows_a_senior_role_with_less(self):
        table = access_table(app)
        assert table["roles"] == list(ROLES)
        for area in table["areas"]:
            for kind in ("view", "change"):
                allowed = [area[kind][role][0] for role in ROLES]
                assert allowed == sorted(allowed, reverse=True), (area["area"], kind)
                assert len({area[kind][role][1] for role in ROLES}) == 1


@pytest.mark.unit
class TestTheAccessTable:
    def _area(self, name):
        return next(a for a in access_table(app)["areas"] if a["area"] == name)

    def test_only_an_admin_changes_accounts(self):
        users = self._area("Users and roles")
        total = users["change"]["admin"][1]
        assert total >= 4
        assert users["change"]["admin"] == [total, total]
        for role in ROLES[1:]:
            assert users["change"][role] == [0, total]

    def test_everyone_signed_in_can_look_at_stock_but_not_everyone_can_change_it(self):
        stock = self._area("Stock")
        for role in ROLES:
            assert stock["view"][role][0] == stock["view"][role][1] > 0
        assert stock["change"]["overseas_staff"][0] == 0
        assert stock["change"]["staff"][0] < stock["change"]["manager"][0]

    def test_a_manager_can_do_everything_in_purchasing_that_staff_can(self):
        purchasing = self._area("Purchasing")
        assert (
            purchasing["change"]["manager"][0] >= purchasing["change"]["staff"][0] > 0
        )
        assert purchasing["view"]["manager"] == purchasing["view"]["admin"]

    def test_the_sign_in_routes_are_not_listed_as_an_area(self):
        names = [a["area"] for a in access_table(app)["areas"]]
        assert "Auth" not in names and "Health" not in names
        assert len(names) == len(set(names))


@pytest.mark.unit
class TestWhatTheWalkCanSee:
    def test_a_route_with_two_gates_admits_only_who_passes_both(self):
        from fastapi import Depends, FastAPI

        from app.core.dependencies import require_staff

        toy = FastAPI()

        @toy.get("/one-way")
        def one_way(_a=Depends(require_admin), _b=Depends(require_staff)):
            return {}

        @toy.get("/other-way")
        def other_way(_b=Depends(require_staff), _a=Depends(require_admin)):
            return {}

        seen = {r.path: route_roles(r) for r in toy.routes if isinstance(r, APIRoute)}
        assert seen == {"/one-way": ("admin",), "/other-way": ("admin",)}

    def test_the_app_has_no_kind_of_route_these_checks_cannot_read(self):
        """A mounted sub-app or a websocket route carries no gate these tests
        can see. If one is added, a person has to look at how it is closed."""
        docs = {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}
        unread = [
            f"{type(route).__name__} {getattr(route, 'path', route)}"
            for route in app.routes
            if not isinstance(route, APIRoute)
            and getattr(route, "path", None) not in docs
        ]
        assert not unread, unread

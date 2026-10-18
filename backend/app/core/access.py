"""Who can do what, read from the routes themselves.

Every endpoint names its gate as a dependency: `require_admin`,
`require_manager`, `require_staff`, `require_any`, or plain `get_current_user`
for "anyone signed in". The admin screen shows what each role can do. Described
by hand, that goes stale — the old user screen's legend did not mention
managers at all — so the table is built from the gates the routes carry, and
what it says is what the server enforces.
"""

from typing import Optional

from fastapi import FastAPI
from fastapi.routing import APIRoute

from app.core.dependencies import ROLES, get_current_user, get_signed_in_user

# The business area each router's tag belongs to, in the order the table
# shows them. A tag that is not listed is shown under its own name, so a new
# router appears in the table without being added here.
AREAS = {
    "jobs": "Jobs and quotes",
    "dispatch": "Jobs and quotes",
    "pdf": "Jobs and quotes",
    "customers": "Customers",
    "ship-to": "Customers",
    "card-files": "Card files",
    "inventory": "Stock",
    "rack-sections": "Stock",
    "styles": "Stock",
    "purchase_orders": "Purchasing",
    "goods-receipts": "Purchasing",
    "suppliers": "Purchasing",
    "supplier-price-list": "Purchasing",
    "open-freight": "Freight",
    "accounts_payable": "Accounts",
    "accounting": "Accounts",
    "reports": "Reports",
    "analytics": "Reports",
    "email": "Email",
    "ai": "AI assistant",
    "saved-lists": "Saved lists",
    "users": "Users and roles",
    "admin": "System settings",
    "settings": "System settings",
    "document-templates": "System settings",
    "import": "System settings",
}

READS = {"GET", "HEAD", "OPTIONS"}


def route_roles(route: APIRoute) -> Optional[tuple[str, ...]]:
    """The roles a route lets through.

    Every role when it only asks for a sign-in; None when no gate is declared
    on it at all (the sign-in routes themselves, and the health checks).
    """
    allowed = None
    pending = list(route.dependant.dependencies)
    while pending:
        dependency = pending.pop()
        gate = getattr(dependency.call, "roles", None)
        if gate is None and dependency.call in (get_current_user, get_signed_in_user):
            gate = ROLES
        if gate is not None:
            # A route with two gates lets through only who passes both.
            within = ROLES if allowed is None else allowed
            allowed = tuple(role for role in within if role in gate)
        pending.extend(dependency.dependencies)
    return allowed


def access_table(app: FastAPI) -> dict:
    """For each area, how many of its actions each role can use.

    `view` counts the routes that only read, `change` the ones that write.
    Each is `{role: [allowed, of]}`, so a screen can say all, some or none
    without this deciding how to word it.
    """
    areas: dict[str, dict] = {}
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        allowed = route_roles(route)
        if allowed is None:
            continue
        tag = route.tags[0] if route.tags else "other"
        name = AREAS.get(tag, tag.replace("-", " ").replace("_", " ").capitalize())
        area = areas.setdefault(
            name,
            {
                "area": name,
                "view": {role: [0, 0] for role in ROLES},
                "change": {role: [0, 0] for role in ROLES},
            },
        )
        for method in route.methods:
            kind = "view" if method in READS else "change"
            for role in ROLES:
                area[kind][role][1] += 1
                if role in allowed:
                    area[kind][role][0] += 1
    listed = list(dict.fromkeys(AREAS.values()))
    ordered = sorted(
        areas.values(),
        key=lambda a: (
            listed.index(a["area"]) if a["area"] in listed else len(listed),
            a["area"],
        ),
    )
    return {"roles": list(ROLES), "areas": ordered}

"""Money is read by staff and above (owner decision, 2026-10-19).

The reports, accounts payable and analytics that show amounts, costs or values
refuse overseas staff and answer staff. The ones that only count jobs and days
answer every role.
"""

import pytest

from app.core.access import api_routes, route_roles
from app.core.dependencies import ROLES
from app.main import app
from app.models.supplier_bill import SupplierBill

MONEY = [
    "/reports/sales-summary",
    "/reports/gst",
    "/reports/aged-receivables",
    "/reports/aged-payables",
    "/reports/customers/{customer_id}/statement",
    "/reports/inventory-valuation",
    "/reports/job-profitability",
    "/reports/bas-summary",
    "/reports/back-orders",
    "/reports/decoration-performance",
    "/ap/bills",
    "/ap/bills/{bill_id}",
    "/ap/summary",
    "/customers/{customer_id}/statement.pdf",
    "/customers/{customer_id}/statement",
    "/analytics/overview",
    "/analytics/forecast",
    "/analytics/dso",
    "/analytics/abc",
    "/analytics/churn",
    "/analytics/margins",
    "/analytics/seasonality",
    "/analytics/anomalies",
]
COUNTS_AND_DAYS = ["/reports/on-time-delivery", "/analytics/turnaround"]


@pytest.fixture
def filled(db, make_customer):
    """The path with its placeholders filled by records that exist."""
    make_customer(id="MONEY01")
    bill = SupplierBill(supplier_name="Fly Apparel", amount_inc=110)
    db.add(bill)
    db.commit()

    def _fill(path):
        return path.format(customer_id="MONEY01", bill_id=bill.id)

    return _fill


@pytest.mark.integration
class TestMoneyIsStaffAndAbove:
    @pytest.mark.parametrize("path", MONEY)
    def test_overseas_staff_are_refused_and_staff_answered(
        self, client_as, filled, path
    ):
        with client_as("overseas_staff") as c:
            assert c.get(filled(path)).status_code == 403
        with client_as("staff") as c:
            r = c.get(filled(path))
        assert r.status_code == 200, r.text

    @pytest.mark.parametrize("path", COUNTS_AND_DAYS)
    def test_counts_and_days_are_read_by_every_role(self, client_as, path):
        with client_as("overseas_staff") as c:
            assert c.get(path).status_code == 200

    def test_a_new_report_has_to_be_placed_on_one_side_or_the_other(self):
        """Every read in reports, analytics and accounts payable is in one of
        the two lists above, so one added later is decided, not defaulted."""
        reads = {
            route.path: route_roles(route)
            for route in api_routes(app)
            if "GET" in route.methods
            and route.tags
            and route.tags[0] in ("reports", "analytics", "accounts_payable")
        }
        # The customer statements live with customers, not under these tags.
        listed = {p for p in MONEY + COUNTS_AND_DAYS if not p.startswith("/customers/")}
        assert set(reads) == listed
        for path, roles in reads.items():
            expected = ROLES if path in COUNTS_AND_DAYS else ROLES[:-1]
            assert roles == expected, path

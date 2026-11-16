"""Prices, card payments and margins: the 2026-11-01 simulation.

docs/backlog.md, SIM2:

- S2-08: the online store's inc-GST prices were stored as $0 lines, drifted a
  cent when worked back to ex GST, and its card payment was dropped;
- S2-16 (in part): a line keyed with no price was booked at $0, the stock's
  price breaks never applied;
- S2-18: job profitability costed lines taken from stock at $0.
"""

import pytest

from app.models.customer import Customer
from app.models.job import Job
from app.models.job_payment import JobPayment
from app.models.logo import Logo
from app.models.stock_pricing import StockPriceBreakpoint, StockPriceLevel

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def setup(db, make_inventory):
    db.add(Customer(id="GS", name="Goodstart", credit_limit=99999.0))
    db.commit()
    make_inventory(sku="GS-POLO-M", stock=20, unit_cost=18, sell_price=30)
    make_inventory(sku="GS-SOFT-M", stock=20, unit_cost=40, sell_price=70)


def _portal_order(client_as, *lines, serial="GS-1", **fields):
    portal = client_as("portal")
    return portal.post(
        "/jobs",
        json={
            "customer_id": "GS",
            "status": "New",
            "serial_no": serial,
            "items": list(lines),
            **fields,
        },
    )


_CART = (
    {"stock_code": "GS-POLO-M", "order_qty": 2, "price_inc": 34.95},
    {"stock_code": "GS-SOFT-M", "order_qty": 1, "price_inc": 69.95, "sort": 1},
)


# ── S2-08: inc-GST prices and card payments ──────────────────────────────────


class TestPricesSentIncGst:
    def test_the_order_totals_what_the_store_charged_to_the_cent(self, client_as):
        r = _portal_order(client_as, *_CART)
        assert r.status_code == 200, r.text
        job = r.json()
        assert (job["total_ex"], job["tax"], job["total_inc"]) == (
            127.14,
            12.71,
            139.85,
        )
        assert [i["price_ex"] for i in job["items"]] == [31.77, 63.59]

    def test_the_card_payment_is_recorded_with_the_order(self, client_as, db):
        r = _portal_order(client_as, *_CART, deposit=139.85, payment_method="card")
        assert r.status_code == 200, r.text
        job = r.json()
        assert (job["deposit"], job["balance_due"], job["payment_status"]) == (
            139.85,
            0.0,
            "paid",
        )
        [payment] = db.query(JobPayment).filter_by(job_id=job["id"]).all()
        assert (float(payment.amount), payment.method) == (139.85, "card")
        assert payment.reference == "Online order GS-1"

    def test_part_paid_at_the_store_leaves_the_rest_owed(self, client_as):
        job = _portal_order(client_as, *_CART, deposit=34.95).json()
        assert (job["balance_due"], job["payment_status"]) == (104.9, "partial")

    def test_more_than_the_order_is_refused_and_nothing_is_booked(self, client_as, db):
        r = _portal_order(client_as, *_CART, deposit=150)
        assert r.status_code == 422
        assert db.query(Job).count() == 0

    def test_the_form_sending_both_prices_is_priced_ex_as_before(self, client):
        r = client.post(
            "/jobs",
            json={
                "customer_id": "GS",
                "status": "QUOTE",
                "items": [
                    {
                        "stock_code": "GS-POLO-M",
                        "order_qty": 2,
                        "price_ex": 31.77,
                        "price_inc": 34.95,
                    }
                ],
            },
        )
        assert r.json()["total_inc"] == 69.89

    def test_a_save_resending_the_price_keeps_it_inc_and_a_new_one_reprices(
        self, client_as
    ):
        job = _portal_order(client_as, *_CART).json()
        client = client_as("staff")  # the latest sign-in answers for every client
        resent = [
            {
                k: i[k]
                for k in ("id", "stock_code", "order_qty", "price_ex", "price_inc")
            }
            for i in job["items"]
        ]
        r = client.patch(f"/jobs/{job['id']}", json={"items": resent})
        assert r.json()["total_inc"] == 139.85
        resent[1]["price_ex"] = 60.0
        r = client.patch(f"/jobs/{job['id']}", json={"items": resent})
        # The polos stay $69.90 inc ($63.55 ex); the softshell is $60 ex now.
        assert (r.json()["total_ex"], r.json()["total_inc"]) == (123.55, 135.9)

    def test_a_copy_is_priced_as_the_source(self, client_as):
        job = _portal_order(client_as, *_CART).json()
        staff = client_as("staff")
        r = staff.post(f"/jobs/{job['id']}/duplicate", json={"status": "QUOTE"})
        assert r.status_code == 200, r.text
        assert r.json()["total_inc"] == 139.85

    def test_an_inc_price_on_a_logo_line_is_the_stores_not_the_logos(
        self, client_as, db
    ):
        db.add(
            Logo(
                code="EMB.GS",
                customer_id="GS",
                name="Crest",
                decoration_type="EMB",
                price_ex=7.0,
            )
        )
        db.commit()
        job = _portal_order(
            client_as, {"stock_code": "EMB.GS", "order_qty": 1, "price_inc": 5.5}
        ).json()
        assert job["total_inc"] == 5.5


# ── S2-16: a line with no price takes the stock's ────────────────────────────


class TestALineWithNoPrice:
    @pytest.fixture
    def breaks(self, db):
        db.add(
            StockPriceLevel(
                sku="GS-POLO-M",
                price_level="Retail",
                breakpoints=[
                    StockPriceBreakpoint(min_qty=1, price_ex=28, price_inc=30.8),
                    StockPriceBreakpoint(min_qty=50, price_ex=27, price_inc=29.7),
                ],
            )
        )
        db.commit()

    def _quote(self, client, qty, sku="GS-POLO-M", **fields):
        r = client.post(
            "/jobs",
            json={
                "customer_id": "GS",
                "status": "QUOTE",
                "items": [{"stock_code": sku, "order_qty": qty}],
                **fields,
            },
        )
        assert r.status_code == 200, r.text
        return r.json()["items"][0]["price_ex"]

    def test_the_break_for_its_own_quantity(self, client, breaks):
        assert self._quote(client, 50) == 27.0
        assert self._quote(client, 10) == 28.0

    def test_the_level_the_job_names(self, client, db, breaks):
        db.add(
            StockPriceLevel(
                sku="GS-POLO-M",
                price_level="Trade",
                breakpoints=[
                    StockPriceBreakpoint(min_qty=1, price_ex=24, price_inc=26.4)
                ],
            )
        )
        db.commit()
        assert self._quote(client, 10, price_level="Trade") == 24.0
        # Two levels and the job names neither: the stock's sell price.
        assert self._quote(client, 10) == 30.0

    def test_no_level_takes_the_sell_price(self, client):
        assert self._quote(client, 10, sku="GS-SOFT-M") == 70.0

    def test_a_price_keyed_as_zero_is_kept(self, client, breaks):
        r = client.post(
            "/jobs",
            json={
                "customer_id": "GS",
                "status": "QUOTE",
                "items": [{"stock_code": "GS-POLO-M", "order_qty": 2, "price_ex": 0}],
            },
        )
        assert r.json()["items"][0]["price_ex"] == 0.0


# ── S2-18: a stocked line costs what the stock does ──────────────────────────


class TestProfitabilityCostsStock:
    def test_a_line_with_no_purchase_price_costs_the_stocks_unit_cost(self, client):
        r = client.post(
            "/jobs",
            json={
                "customer_id": "GS",
                "status": "INVOICE",
                "items": [
                    {"stock_code": "GS-POLO-M", "order_qty": 10, "price_ex": 30},
                    {
                        "stock_code": "GS-SOFT-M",
                        "order_qty": 1,
                        "price_ex": 70,
                        "purchase_price": 35,
                        "sort": 1,
                    },
                ],
            },
        )
        assert r.status_code == 200, r.text
        row = client.get("/reports/job-profitability").json()["rows"][0]
        assert (row["revenue_ex"], row["cost"]) == (370.0, 215.0)

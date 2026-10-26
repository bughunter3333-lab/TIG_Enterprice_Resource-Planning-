"""What stock a job reserves, buys and weighs — one answer on every screen.

Simulation findings F08, F11, F13 and F14:

- a stock item's weight could not be written, and a job weighed its lines by the
  SKU's weight even when that was 0 and the line knew better (F08);
- a portal order in 'New' showed as reserved stock with no movement behind it,
  because 'New' was in neither the committed nor the uncommitted list (F11);
- the buying list counted back-orders on quotes nobody had accepted (F13);
- the Committed movement reserved the order quantity — back-order included —
  while every other figure reserved supply, so three screens gave three
  answers (F14).
"""

import pytest

from app.models.customer import Customer
from app.models.inventory import StockMovement
from app.models.job import Job


def _customer(db):
    if not db.get(Customer, "SR-C"):
        db.add(Customer(id="SR-C", name="Stock Rules Co", credit_limit=99999.0))
        db.commit()


def _create(client, db, status, *lines):
    _customer(db)
    r = client.post(
        "/jobs", json={"customer_id": "SR-C", "status": status, "items": list(lines)}
    )
    assert r.status_code == 200, r.text
    return r.json()


def _line(sku, qty, **fields):
    return {"display_type": "product", "stock_code": sku, "order_qty": qty, **fields}


def _committed_everywhere(client, sku):
    """The reserved figure on each screen that shows one."""
    listed = next(i for i in client.get("/inventory").json() if i["sku"] == sku)
    summary = client.get(f"/inventory/{sku}/location-summary").json()
    detail = client.get(f"/inventory/{sku}/committed").json()
    return {
        "stock list": listed["committed_qty"],
        "location summary": sum(b["committed_qty"] for b in summary["branches"]),
        "committed tab": sum(r["qty"] for r in detail),
    }


# ── F08: weight ──────────────────────────────────────────────────────────────


@pytest.mark.integration
class TestWeight:
    def test_a_stock_item_weight_can_be_set(self, client, make_inventory):
        make_inventory(sku="POLO-M", stock=10)
        r = client.patch("/inventory/POLO-M", json={"weight_kg": 0.25})
        assert r.status_code == 200, r.text
        assert r.json()["weight_kg"] == 0.25

    def test_a_new_stock_item_can_carry_one(self, client):
        r = client.post(
            "/inventory", json={"sku": "PANT-32", "name": "Pant", "weight_kg": 0.6}
        )
        assert r.status_code in (200, 201), r.text
        assert r.json()["weight_kg"] == 0.6

    def test_a_weight_cannot_be_negative(self, client, make_inventory):
        make_inventory(sku="POLO-M", stock=10)
        assert (
            client.patch("/inventory/POLO-M", json={"weight_kg": -1}).status_code == 422
        )

    def test_a_job_is_weighed_by_its_stock(self, client, db, make_inventory):
        make_inventory(sku="POLO-M", stock=10, weight_kg=0.25)
        job = _create(client, db, "QUOTE", _line("POLO-M", 4))
        assert job["weight_total"] == 1.0

    def test_a_line_weight_counts_when_the_stock_item_has_none(
        self, client, db, make_inventory
    ):
        make_inventory(sku="POLO-M", stock=10)
        job = _create(client, db, "QUOTE", _line("POLO-M", 4, weight_kg=0.3))
        assert job["weight_total"] == 1.2

    def test_the_weight_sent_by_the_browser_is_not_believed(
        self, client, db, make_inventory
    ):
        make_inventory(sku="POLO-M", stock=10, weight_kg=0.25)
        _customer(db)
        r = client.post(
            "/jobs",
            json={
                "customer_id": "SR-C",
                "weight_total": 99,
                "items": [_line("POLO-M", 4)],
            },
        )
        assert r.json()["weight_total"] == 1.0

    def test_the_picking_slip_names_the_garments_with_no_weight(
        self, client, db, make_inventory
    ):
        from app.core.job_weight import unweighed_lines

        make_inventory(sku="POLO-M", stock=10, weight_kg=0.25)
        make_inventory(sku="JKT-L", stock=10)
        job = _create(
            client,
            db,
            "QUOTE",
            _line("POLO-M", 2),
            _line("JKT-L", 1),
            # A decoration line is not a garment; it weighs nothing and that
            # is not missing information.
            _line("EMB.CFG.LHC", 3, decoration_type="EMB"),
        )
        assert unweighed_lines(db.get(Job, job["id"]), db) == ["JKT-L"]


# ── F11: 'New' is not an order yet ───────────────────────────────────────────


@pytest.mark.integration
class TestANewPortalOrderReservesNothing:
    def test_new_reserves_nothing_and_posts_nothing(self, client, db, make_inventory):
        make_inventory(sku="POLO-M", stock=10)
        job = _create(client, db, "New", _line("POLO-M", 2, supply_qty=2, b_ord=0))
        assert set(_committed_everywhere(client, "POLO-M").values()) == {0}
        assert db.query(StockMovement).filter_by(job_id=job["id"]).count() == 0

    def test_confirming_it_reserves_its_stock(self, client, db, make_inventory):
        make_inventory(sku="POLO-M", stock=10)
        job = _create(client, db, "New", _line("POLO-M", 2, supply_qty=2, b_ord=0))
        r = client.post(f"/jobs/{job['id']}/status", json={"status": "ORDER"})
        assert r.status_code == 200, r.text
        assert set(_committed_everywhere(client, "POLO-M").values()) == {2}


# ── F13: only orders are bought for ──────────────────────────────────────────


@pytest.mark.integration
class TestOnlyOrdersAreBoughtFor:
    def test_a_quotes_shortfall_is_not_on_the_buying_list(
        self, client, db, make_inventory
    ):
        make_inventory(sku="PANT-32", stock=0)
        quote = _create(client, db, "QUOTE", _line("PANT-32", 3))
        order = _create(client, db, "ORDER", _line("PANT-32", 2))
        rows = client.get("/jobs/order-requirements").json()
        (row,) = [r for r in rows if r["sku"] == "PANT-32"]
        assert [j["job_id"] for j in row["jobs"]] == [order["id"]]
        assert quote["id"] not in str(rows)


# ── F14: reserved means supplied from stock, on every screen ─────────────────


@pytest.mark.integration
class TestReservedIsTheSameEverywhere:
    def test_a_part_back_ordered_line_reserves_only_what_is_on_hand(
        self, client, db, make_inventory
    ):
        make_inventory(sku="POLO-L", stock=2)
        job = _create(client, db, "ORDER", _line("POLO-L", 3))
        assert _committed_everywhere(client, "POLO-L") == {
            "stock list": 2,
            "location summary": 2,
            "committed tab": 2,
        }
        (move,) = (
            db.query(StockMovement).filter_by(job_id=job["id"], type="Committed").all()
        )
        assert move.quantity == 2

    def test_the_back_order_arriving_is_reserved_too(self, client, db, make_inventory):
        make_inventory(sku="POLO-L", stock=2)
        _create(client, db, "ORDER", _line("POLO-L", 3))
        gr = client.post(
            "/goods-receipts",
            json={
                "received_date": "2026-10-20",
                "lines": [{"sku": "POLO-L", "qty_received": 1}],
            },
        ).json()
        client.post(f"/goods-receipts/{gr['id']}/accept")
        assert set(_committed_everywhere(client, "POLO-L").values()) == {3}

    def test_a_fully_back_ordered_line_reserves_nothing(
        self, client, db, make_inventory
    ):
        make_inventory(sku="JKT-L", stock=0)
        job = _create(client, db, "ORDER", _line("JKT-L", 1))
        assert set(_committed_everywhere(client, "JKT-L").values()) == {0}
        assert (
            db.query(StockMovement)
            .filter_by(job_id=job["id"], type="Committed")
            .count()
            == 0
        )

    def test_editing_an_order_moves_its_reservation(self, client, db, make_inventory):
        make_inventory(sku="POLO-L", stock=10)
        job = _create(client, db, "ORDER", _line("POLO-L", 3))
        line = job["items"][0]
        r = client.patch(
            f"/jobs/{job['id']}",
            json={
                "items": [
                    {"id": line["id"], "order_qty": 5, "supply_qty": 5, "b_ord": 0}
                ]
            },
        )
        assert r.status_code == 200, r.text
        assert set(_committed_everywhere(client, "POLO-L").values()) == {5}
        client.post(f"/jobs/{job['id']}/status", json={"status": "CANCEL"})
        assert set(_committed_everywhere(client, "POLO-L").values()) == {0}

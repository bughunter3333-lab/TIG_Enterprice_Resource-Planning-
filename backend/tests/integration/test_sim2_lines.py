"""Job lines: what is goods, and what a quantity edit does — the 2026-11-01 simulation.

docs/backlog.md, SIM2:

- S2-03: editing a saved line's quantity kept its old supply and back-order,
  so the job billed the new quantity and reserved and shipped the old one;
- S2-05: freight, set-up and fee lines kept as stock codes were goods —
  back-ordered, on the buying list, weighed, and printed as back-ordered;
- S2-07 (in part): a line's quantity could be negative, which reserved -1.
"""

import pytest

from app.core.job_weight import unweighed_lines
from app.core.reservations import committed_total
from app.models.customer import Customer
from app.models.inventory import InventoryItem
from app.models.job import Job, JobItem


@pytest.fixture(autouse=True)
def stock(db, make_inventory):
    db.add(Customer(id="OFF", name="Office Co", credit_limit=99999.0))
    db.commit()
    make_inventory(sku="POLO-S", stock=10, weight_kg=0.25)
    make_inventory(sku="POLO-L", stock=10, weight_kg=0.25)
    # As the seed data has them, and as Jim2 types them.
    make_inventory(sku="FREIGHT", category="Service", stock=0, sell_price=15)
    make_inventory(sku="SETUP.LOGO", item_type="Service", stock=0)
    make_inventory(sku="LABOUR", item_type="Non-Depleting", stock=0)


def _book(client, *lines, status="ORDER"):
    r = client.post(
        "/jobs", json={"customer_id": "OFF", "status": status, "items": list(lines)}
    )
    assert r.status_code == 200, r.text
    return r.json()


def _line(sku, qty, sort=0, **fields):
    return {"stock_code": sku, "order_qty": qty, "sort": sort, "price_ex": 20, **fields}


def _split(job, sku):
    item = next(i for i in job["items"] if i["stock_code"] == sku)
    return item["order_qty"], item["supply_qty"], item["b_ord"]


def _save(client, job, **changes_by_sku):
    items = []
    for item in job["items"]:
        line = {
            k: item[k]
            for k in ("id", "sort", "stock_code", "order_qty", "supply_qty", "b_ord")
        }
        line.update(changes_by_sku.get(item["stock_code"], {}))
        items.append(line)
    r = client.patch(f"/jobs/{job['id']}", json={"items": items})
    assert r.status_code == 200, r.text
    return r.json()


# ── S2-05: a charge is not goods ─────────────────────────────────────────────


@pytest.mark.integration
class TestAChargeIsNotGoods:
    @pytest.mark.parametrize("sku", ["FREIGHT", "SETUP.LOGO", "LABOUR"])
    def test_supplied_in_full_and_never_back_ordered(self, client, sku):
        job = _book(client, _line("POLO-S", 2), _line(sku, 1, sort=1))
        assert _split(job, sku) == (1, 1, 0)

    def test_a_split_sent_by_the_form_is_not_cut_on_confirming(self, client):
        # The job form sends its freight line as Supply 1 / B.Ord 0.
        quote = _book(
            client,
            _line("FREIGHT", 1, supply_qty=1, b_ord=0),
            status="QUOTE",
        )
        r = client.post(f"/jobs/{quote['id']}/status", json={"status": "ORDER"})
        assert r.status_code == 200, r.text
        assert _split(client.get(f"/jobs/{quote['id']}").json(), "FREIGHT") == (
            1,
            1,
            0,
        )

    def test_not_on_the_buying_list_or_the_back_order_report(self, client, db):
        job = _book(client, _line("FREIGHT", 1))
        # One saved back-ordered before this, as every freight line was.
        item = db.query(JobItem).filter_by(job_id=job["id"]).one()
        item.supply_qty, item.b_ord = 0, 1
        db.commit()
        bought = [r["sku"] for r in client.get("/jobs/order-requirements").json()]
        assert "FREIGHT" not in bought
        report = client.get("/reports/back-orders").json()
        assert "FREIGHT" not in str(report)

    def test_not_reserved_or_weighed(self, client, db):
        job = _book(client, _line("POLO-S", 2), _line("FREIGHT", 1, sort=1))
        assert committed_total(db, "FREIGHT") == 0
        db.expire_all()
        assert unweighed_lines(db.get(Job, job["id"]), db) == []

    def test_a_new_charge_is_not_weighed_or_altered(self, client, db):
        freight = db.get(InventoryItem, "FREIGHT")
        freight.weight_kg = 2
        db.commit()
        job = _book(client, _line("POLO-S", 2), _line("FREIGHT", 1, sort=1))
        assert job["weight_total"] == 0.5
        r = client.post(
            "/jobs",
            json={
                "customer_id": "OFF",
                "status": "QUOTE",
                "items": [
                    _line("FREIGHT", 1),
                    {
                        "description": "Hem",
                        "order_qty": 1,
                        "sort": 1,
                        "applies_to_line": 0,
                    },
                ],
            },
        )
        assert r.status_code == 422

    def test_a_line_recoded_to_a_charge_is_supplied_in_full(self, client):
        job = _book(client, _line("POLO-S", 12))
        assert _split(job, "POLO-S") == (12, 10, 2)
        saved = _save(client, job, **{"POLO-S": {"stock_code": "FREIGHT"}})
        assert _split(saved, "FREIGHT") == (12, 12, 0)


# ── S2-03: a quantity edit re-works the split ────────────────────────────────


@pytest.mark.integration
class TestAQuantityEditReworksTheSplit:
    def test_the_old_split_sent_with_a_new_quantity_is_reworked(self, client, db):
        job = _book(client, _line("POLO-S", 4), _line("POLO-L", 6, sort=1))
        assert committed_total(db, "POLO-S") == 4
        # The form resends supply 4 / b_ord 0 with the new quantity of 12.
        saved = _save(client, job, **{"POLO-S": {"order_qty": 12}})
        assert _split(saved, "POLO-S") == (12, 10, 2)
        assert committed_total(db, "POLO-S") == 10

    def test_a_cut_returns_what_it_no_longer_needs(self, client, db):
        job = _book(client, _line("POLO-L", 12))
        assert _split(job, "POLO-L") == (12, 10, 2)
        saved = _save(client, job, **{"POLO-L": {"order_qty": 9}})
        assert _split(saved, "POLO-L") == (9, 9, 0)
        assert committed_total(db, "POLO-L") == 9

    def test_a_quantity_edit_with_no_split_is_reworked(self, client):
        job = _book(client, _line("POLO-S", 4))
        item = job["items"][0]
        r = client.patch(
            f"/jobs/{job['id']}",
            json={"items": [{"id": item["id"], "order_qty": 6}]},
        )
        assert r.status_code == 200, r.text
        assert _split(r.json(), "POLO-S") == (6, 6, 0)

    def test_a_split_that_adds_up_is_a_decision_and_kept(self, client):
        job = _book(client, _line("POLO-S", 4))
        saved = _save(
            client, job, **{"POLO-S": {"order_qty": 6, "supply_qty": 0, "b_ord": 6}}
        )
        assert _split(saved, "POLO-S") == (6, 0, 6)

    def test_the_jobs_other_lines_still_count_against_it(self, client):
        job = _book(client, _line("POLO-S", 6), _line("POLO-S", 2, sort=1))
        first = next(i for i in job["items"] if i["sort"] == 0)
        r = client.patch(
            f"/jobs/{job['id']}",
            json={
                "items": [
                    {"id": i["id"], "order_qty": 9 if i is first else i["order_qty"]}
                    for i in job["items"]
                ]
            },
        )
        assert r.status_code == 200, r.text
        # 10 on hand; the other line holds 2, so 8 of the 9.
        line = next(i for i in r.json()["items"] if i["id"] == first["id"])
        assert (line["supply_qty"], line["b_ord"]) == (8, 1)

    def test_one_save_never_holds_more_than_is_on_hand(self, client, db):
        # Raising a line and adding another of the same code in one save: each
        # was worked out on its own, and both took the same free units.
        job = _book(client, _line("POLO-S", 4))
        item = job["items"][0]
        r = client.patch(
            f"/jobs/{job['id']}",
            json={
                "items": [
                    {"id": item["id"], "stock_code": "POLO-S", "order_qty": 8},
                    {"stock_code": "POLO-S", "order_qty": 5, "sort": 1},
                ]
            },
        )
        assert r.status_code == 200, r.text
        lines = r.json()["items"]
        assert sum(i["supply_qty"] for i in lines) == 10
        assert sum(i["b_ord"] for i in lines) == 3
        assert committed_total(db, "POLO-S") == 10

    def test_an_unchanged_line_keeps_its_split(self, client):
        job = _book(client, _line("POLO-S", 4, supply_qty=0, b_ord=4))
        saved = _save(client, job, **{"POLO-S": {"description": "Polo"}})
        assert _split(saved, "POLO-S") == (4, 0, 4)


# ── S2-07: no negative quantities ────────────────────────────────────────────


@pytest.mark.integration
class TestNoNegativeQuantities:
    @pytest.mark.parametrize("field", ["order_qty", "supply_qty", "b_ord", "qty"])
    def test_refused(self, client, db, field):
        line = {**_line("POLO-S", 1), field: -1}
        r = client.post(
            "/jobs", json={"customer_id": "OFF", "status": "ORDER", "items": [line]}
        )
        assert r.status_code == 422
        assert committed_total(db, "POLO-S") == 0

"""Logos, decoration lines and the lines they apply to.

The owner's decision of 2026-10-25 for F02/F09/F12/F16/F19/F31: a logo is a
record of its own — code, method, stitch count, price, cost, in-house or
subcontracted, proof — and decoration and alteration lines point at the logo
and at the garment line they apply to. They are services, never bought or
held as stock. One garment line per item, as the job form already works.

- F09: a logo existed only as text on each job line;
- F12: a decoration or alteration line from the portal became a back-order
  to buy;
- F16: the decoration worklist could not tell in-house from subcontracted;
- F19: an alteration could not point at its garment, and picking overwrote
  its status as if it were goods;
- F31: proof approval was a field on each job, not on the logo.
"""

import pytest

from app.models.customer import Customer
from app.models.supplier import Supplier


def _seed(db):
    if not db.get(Customer, "CFG"):
        db.add(Customer(id="CFG", name="CFG Mining", credit_limit=99999.0))
        db.add(Supplier(id="STITCH", name="Stitchline"))
        db.commit()


def _logo(client, db, **fields):
    _seed(db)
    body = {
        "code": "EMB.CFG.LHC",
        "customer_id": "CFG",
        "name": "CFG left chest",
        "decoration_type": "EMB",
        "position": "L.Chest",
        "stitch_count": 8500,
        "made_by": "subcontract",
        "supplier_id": "STITCH",
        "price_ex": 6.50,
        "cost_ex": 3.20,
        **fields,
    }
    r = client.post("/logos", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _order(client, db, *lines, status="ORDER"):
    _seed(db)
    r = client.post(
        "/jobs", json={"customer_id": "CFG", "status": status, "items": list(lines)}
    )
    assert r.status_code == 200, r.text
    return r.json()


def _garment(sku="POLO-M", qty=2, sort=0):
    return {
        "display_type": "product",
        "stock_code": sku,
        "order_qty": qty,
        "sort": sort,
        "price_ex": 30.0,
    }


# ── F09: a logo is a record ──────────────────────────────────────────────────


@pytest.mark.integration
class TestALogoIsARecord:
    def test_it_is_found_by_its_code(self, client, db):
        logo = _logo(client, db)
        r = client.get("/logos/by-code/emb.cfg.lhc")
        assert r.status_code == 200
        assert r.json()["id"] == logo["id"]
        assert r.json()["stitch_count"] == 8500

    def test_a_customer_lists_its_logos(self, client, db):
        _logo(client, db)
        _logo(client, db, code="EMB.CFG.BACK", position="Back")
        codes = [
            g["code"]
            for g in client.get("/logos", params={"customer_id": "CFG"}).json()
        ]
        assert codes == ["EMB.CFG.BACK", "EMB.CFG.LHC"]

    def test_a_code_is_used_once(self, client, db):
        _logo(client, db)
        r = client.post(
            "/logos",
            json={
                "code": "emb.cfg.lhc ",
                "customer_id": "CFG",
                "decoration_type": "EMB",
            },
        )
        assert r.status_code == 409

    def test_who_decorates_it_is_one_of_two_things(self, client, db):
        _seed(db)
        r = client.post(
            "/logos",
            json={
                "code": "EMB.X",
                "customer_id": "CFG",
                "decoration_type": "EMB",
                "made_by": "Lina",
            },
        )
        assert r.status_code == 422

    def test_a_subcontracted_logo_names_its_decorator(self, client, db):
        _seed(db)
        r = client.post(
            "/logos",
            json={
                "code": "EMB.Y",
                "customer_id": "CFG",
                "decoration_type": "EMB",
                "made_by": "subcontract",
            },
        )
        assert r.status_code == 422
        assert "decorator" in r.json()["detail"]


# ── F12: a decoration line is a service, not stock ───────────────────────────


@pytest.mark.integration
class TestADecorationLineIsAService:
    def test_it_is_supplied_not_bought(self, client, db, make_inventory):
        make_inventory(sku="POLO-M", stock=0)
        logo = _logo(client, db)
        job = _order(
            client,
            db,
            _garment(),
            {"stock_code": "EMB.CFG.LHC", "order_qty": 2, "sort": 1},
        )
        emb = next(i for i in job["items"] if i["stock_code"] == "EMB.CFG.LHC")
        assert emb["logo_id"] == logo["id"]
        assert (emb["supply_qty"], emb["b_ord"]) == (2, 0)
        buying = [r["sku"] for r in client.get("/jobs/order-requirements").json()]
        assert buying == ["POLO-M"]

    def test_it_takes_the_logos_price_and_cost_when_none_is_sent(self, client, db):
        _logo(client, db)
        job = _order(
            client,
            db,
            _garment(),
            {"stock_code": "EMB.CFG.LHC", "order_qty": 2, "sort": 1},
        )
        emb = next(i for i in job["items"] if i["stock_code"] == "EMB.CFG.LHC")
        assert (emb["price_ex"], emb["purchase_price"], emb["decoration_type"]) == (
            6.5,
            3.2,
            "EMB",
        )
        assert job["total_ex"] == 73.0  # 2 x 30 + 2 x 6.50

    def test_it_reserves_and_ships_no_stock(self, client, db, make_inventory):
        make_inventory(sku="POLO-M", stock=10)
        # Even if someone has made a stock item with the logo's code.
        make_inventory(sku="EMB.CFG.LHC", stock=0)
        _logo(client, db)
        job = _order(
            client,
            db,
            _garment(),
            {"stock_code": "EMB.CFG.LHC", "order_qty": 2, "sort": 1},
        )
        listed = {i["sku"]: i["committed_qty"] for i in client.get("/inventory").json()}
        assert listed["EMB.CFG.LHC"] == 0
        assert (
            client.post(
                f"/jobs/{job['id']}/status", json={"status": "Desp/Ready"}
            ).status_code
            == 200
        )


# ── F16: in-house work is not a purchase ─────────────────────────────────────


@pytest.mark.integration
class TestTheDecorationWorklist:
    def test_subcontracted_work_is_listed_with_its_decorator(self, client, db):
        _logo(client, db)
        _order(
            client,
            db,
            _garment(),
            {"stock_code": "EMB.CFG.LHC", "order_qty": 2, "sort": 1},
        )
        (row,) = client.get(
            "/jobs/order-requirements", params={"type": "decoration"}
        ).json()
        assert (row["sku"], row["made_by"], row["supplier_id"], row["total_qty"]) == (
            "EMB.CFG.LHC",
            "subcontract",
            "STITCH",
            2,
        )

    def test_in_house_work_is_not_asked_for_a_purchase_order(self, client, db):
        _logo(client, db, code="EMB.CFG.PAR", made_by="in_house", supplier_id=None)
        _order(
            client,
            db,
            _garment(),
            {"stock_code": "EMB.CFG.PAR", "order_qty": 2, "sort": 1},
        )
        assert (
            client.get("/jobs/order-requirements", params={"type": "decoration"}).json()
            == []
        )


# ── F19: an alteration points at its garment ─────────────────────────────────


@pytest.mark.integration
class TestAnAlterationAppliesToItsGarment:
    def test_it_is_linked_to_the_line_it_applies_to(self, client, db):
        job = _order(
            client,
            db,
            _garment(sort=0),
            {
                "stock_code": "ALT.POCKET",
                "order_qty": 2,
                "sort": 1,
                "applies_to_line": 0,
                "price_ex": 4.0,
            },
        )
        garment = next(i for i in job["items"] if i["stock_code"] == "POLO-M")
        alt = next(i for i in job["items"] if i["stock_code"] == "ALT.POCKET")
        assert alt["applies_to_item_id"] == garment["id"]
        assert (alt["supply_qty"], alt["b_ord"]) == (2, 0)

    def test_a_line_that_is_not_there_is_refused(self, client, db):
        _seed(db)
        r = client.post(
            "/jobs",
            json={
                "customer_id": "CFG",
                "items": [
                    _garment(sort=0),
                    {
                        "stock_code": "ALT.POCKET",
                        "order_qty": 1,
                        "sort": 1,
                        "applies_to_line": 7,
                    },
                ],
            },
        )
        assert r.status_code == 422
        assert "7" in r.json()["detail"]

    def test_picking_picks_the_goods_and_leaves_the_services_alone(
        self, client, db, make_inventory
    ):
        make_inventory(sku="POLO-M", stock=10)
        _logo(client, db)
        job = _order(
            client,
            db,
            _garment(sort=0),
            {
                "stock_code": "EMB.CFG.LHC",
                "order_qty": 2,
                "sort": 1,
                "applies_to_line": 0,
            },
            {
                "stock_code": "ALT.POCKET",
                "order_qty": 2,
                "sort": 2,
                "applies_to_line": 0,
            },
        )
        garment = next(i for i in job["items"] if i["stock_code"] == "POLO-M")
        r = client.post(
            f"/jobs/{job['id']}/pick",
            json={"picks": [{"item_id": garment["id"], "qty_pick": 2}]},
        )
        assert r.status_code == 200, r.text
        assert r.json()["all_picked"] is True
        statuses = {i["stock_code"]: i["item_status"] for i in r.json()["job"]["items"]}
        assert statuses["POLO-M"] == "Picked"
        assert not statuses["EMB.CFG.LHC"] and not statuses["ALT.POCKET"]

    def test_a_service_line_cannot_be_picked(self, client, db):
        _logo(client, db)
        job = _order(
            client,
            db,
            _garment(),
            {"stock_code": "EMB.CFG.LHC", "order_qty": 2, "sort": 1},
        )
        emb = next(i for i in job["items"] if i["stock_code"] == "EMB.CFG.LHC")
        r = client.post(
            f"/jobs/{job['id']}/pick",
            json={"picks": [{"item_id": emb["id"], "qty_pick": 2}]},
        )
        assert r.status_code == 422


# ── F31: a logo is proofed once ──────────────────────────────────────────────


@pytest.mark.integration
class TestProofIsPerLogo:
    def test_approving_a_logo_approves_it_for_every_job(self, client, db):
        logo = _logo(client, db)
        a = _order(
            client,
            db,
            _garment(),
            {"stock_code": "EMB.CFG.LHC", "order_qty": 2, "sort": 1},
        )
        b = _order(
            client,
            db,
            _garment(),
            {"stock_code": "EMB.CFG.LHC", "order_qty": 4, "sort": 1},
        )
        r = client.post(
            f"/logos/{logo['id']}/proof",
            json={"status": "approved", "notes": "Sew-out OK"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["proof_status"] == "approved" and body["approved_by"]
        assert sorted(body["jobs"]) == sorted([a["id"], b["id"]])

    def test_a_proof_is_sent_approved_or_rejected(self, client, db):
        logo = _logo(client, db)
        r = client.post(f"/logos/{logo['id']}/proof", json={"status": "maybe"})
        assert r.status_code == 422

    def test_overseas_staff_read_logos_but_do_not_approve_them(
        self, client, db, client_as
    ):
        logo = _logo(client, db)
        overseas = client_as("overseas_staff")
        assert overseas.get("/logos").status_code == 200
        assert (
            overseas.post(
                f"/logos/{logo['id']}/proof", json={"status": "approved"}
            ).status_code
            == 403
        )

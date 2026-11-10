"""Customer credit notes and returns
(docs/superpowers/specs/2026-11-09-returns-credit-notes.md).

A credit note credits lines of an invoice at the invoice's prices. It is
applied to that invoice up to what it owes; the rest is credit on the
customer's account, applied to a later invoice. The ledger, the customer's
balance, the receivables reports and the GST reports all agree with it. Plain
goods back wait at RET to be restocked or written off; decorated goods never
come back into stock.
"""

from decimal import Decimal

import pytest

from app.core.ledger_reports import bas, health
from app.core.stock_location import position_qty
from app.models.credit_note import CustomerCreditNote
from app.models.customer import Customer
from app.models.inventory import InventoryItem, StockMovement
from app.models.job import Job

pytestmark = pytest.mark.integration

CUSTOMER = "CN-C"


def _setup(db):
    if db.get(Customer, CUSTOMER):
        return
    db.add(Customer(id=CUSTOMER, name="Credit Co", credit_limit=99999.0))
    db.add(Customer(id="CN-D", name="Other Co", credit_limit=99999.0))
    for sku, price in (("CN-TEE", 10), ("CN-CAP", 8)):
        db.add(
            InventoryItem(sku=sku, name=sku, stock=50, unit_cost=4, sell_price=price)
        )
    db.commit()


def _invoice(client, db, customer=CUSTOMER, lines=None):
    """An invoice made as the shop makes one: an order, invoiced."""
    _setup(db)
    lines = lines or [
        {"sort": 0, "stock_code": "CN-TEE", "order_qty": 4, "price_ex": 10},
        {"sort": 1, "stock_code": "CN-CAP", "order_qty": 2, "price_ex": 8},
    ]
    r = client.post(
        "/jobs", json={"customer_id": customer, "status": "ORDER", "items": lines}
    )
    assert r.status_code == 200, r.text
    job = r.json()
    for status in ("FINISH", "INVOICE"):
        r = client.post(f"/jobs/{job['id']}/status", json={"status": status})
        assert r.status_code == 200, r.text
    return client.get(f"/jobs/{job['id']}").json()


def _line(job, code):
    return next(i for i in job["items"] if i["stock_code"] == code)["id"]


def _credit(client, job, *lines, reason="Wrong size", **body):
    return client.post(
        f"/jobs/{job['id']}/credit-notes",
        json={
            "lines": [
                {"item_id": item_id, "qty": qty, "goods_back": back}
                for item_id, qty, back in lines
            ],
            "reason": reason,
            **body,
        },
    )


def _pay(client, job_id, amount):
    r = client.post(f"/jobs/{job_id}/payment", json={"amount": amount, "method": "EFT"})
    assert r.status_code == 200, r.text


def _job(db, job_id):
    db.expire_all()
    return db.get(Job, job_id)


def _balance(db, customer=CUSTOMER):
    db.expire_all()
    return float(db.get(Customer, customer).balance or 0)


def _agrees(db):
    db.expire_all()
    found = health(db)
    assert found["in_agreement"], found
    assert not found["balances_disagree_with_invoices"], found


class TestRaisingACreditNote:
    def test_on_an_unpaid_invoice_it_comes_off_what_it_owes(self, client, db):
        job = _invoice(client, db)  # 4 × $10 + 2 × $8 = $56 ex, $61.60 inc
        r = _credit(client, job, (_line(job, "CN-CAP"), 1, False))
        assert r.status_code == 200, r.text
        note = r.json()
        assert note["id"] == "CN-0001"
        assert (note["total_ex"], note["tax"], note["total_inc"]) == (8.0, 0.8, 8.8)
        assert note["unapplied"] == 0 and note["applied"] == 8.8
        after = _job(db, job["id"])
        assert float(after.credited) == 8.8
        assert float(after.balance_due) == 52.8
        assert _balance(db) == 52.8
        _agrees(db)

    def test_numbers_run_in_their_own_series(self, client, db):
        job = _invoice(client, db)
        _credit(client, job, (_line(job, "CN-CAP"), 1, False))
        r = _credit(client, job, (_line(job, "CN-TEE"), 1, False))
        assert r.json()["id"] == "CN-0002"

    def test_on_a_paid_invoice_it_is_credit_on_the_account(self, client, db):
        job = _invoice(client, db)
        _pay(client, job["id"], 61.60)
        r = _credit(client, job, (_line(job, "CN-TEE"), 2, False))
        assert r.status_code == 200, r.text
        assert r.json()["unapplied"] == 22.0
        assert float(_job(db, job["id"]).credited) == 0
        assert _balance(db) == -22.0
        _agrees(db)

    def test_credit_on_account_pays_down_a_later_invoice(self, client, db):
        first = _invoice(client, db)
        _pay(client, first["id"], 61.60)
        note = _credit(client, first, (_line(first, "CN-TEE"), 2, False)).json()
        later = _invoice(client, db)
        r = client.post(
            f"/credit-notes/{note['id']}/apply",
            json={"job_id": later["id"], "amount": 22.0},
        )
        assert r.status_code == 200, r.text
        assert r.json()["unapplied"] == 0
        assert float(_job(db, later["id"]).balance_due) == 39.6
        assert _balance(db) == 39.6
        _agrees(db)

    def test_crediting_everything_left_nets_the_invoice_to_the_cent(self, client, db):
        job = _invoice(
            client,
            db,
            lines=[
                {"sort": 0, "stock_code": "CN-TEE", "order_qty": 3, "price_ex": 3.33}
            ],
        )
        tee = _line(job, "CN-TEE")
        _credit(client, job, (tee, 1, False))
        _credit(client, job, (tee, 1, False))
        last = _credit(client, job, (tee, 1, False)).json()
        notes = db.query(CustomerCreditNote).filter_by(job_id=job["id"]).all()
        assert sum(n.total_inc for n in notes) == Decimal(str(job["total_inc"]))
        assert sum(n.tax for n in notes) == Decimal(str(job["tax"]))
        assert last["total_inc"] > 0
        assert float(_job(db, job["id"]).balance_due) == 0
        _agrees(db)

    def test_never_more_than_is_left_to_credit(self, client, db):
        job = _invoice(client, db)
        cap = _line(job, "CN-CAP")
        _credit(client, job, (cap, 2, False))
        r = _credit(client, job, (cap, 1, False))
        assert r.status_code == 422
        assert "only 0" in r.json()["detail"]

    def test_only_an_invoice_is_credited(self, client, db):
        _setup(db)
        r = client.post(
            "/jobs",
            json={
                "customer_id": CUSTOMER,
                "status": "ORDER",
                "items": [{"stock_code": "CN-TEE", "order_qty": 1, "price_ex": 10}],
            },
        )
        job = r.json()
        assert _credit(client, job, (_line(job, "CN-TEE"), 1, False)).status_code == 409

    def test_a_line_from_another_job_is_refused(self, client, db):
        a, b = _invoice(client, db), _invoice(client, db)
        assert _credit(client, a, (_line(b, "CN-TEE"), 1, False)).status_code == 422

    def test_a_reason_is_needed(self, client, db):
        job = _invoice(client, db)
        assert (
            _credit(
                client, job, (_line(job, "CN-TEE"), 1, False), reason=""
            ).status_code
            == 422
        )

    def test_not_dated_before_its_invoice_nor_in_the_future(self, client, db):
        job = _invoice(client, db)
        tee = _line(job, "CN-TEE")
        assert (
            _credit(client, job, (tee, 1, False), credit_date="2001-01-01").status_code
            == 422
        )
        assert (
            _credit(client, job, (tee, 1, False), credit_date="2999-01-01").status_code
            == 422
        )

    def test_staff_cannot_raise_one(self, client, db, client_as):
        job = _invoice(client, db)
        staff = client_as("staff")
        assert _credit(staff, job, (_line(job, "CN-TEE"), 1, False)).status_code == 403
        manager = client_as("manager")
        assert (
            _credit(manager, job, (_line(job, "CN-TEE"), 1, False)).status_code == 200
        )


class TestApplyingCredit:
    def _on_account(self, client, db):
        first = _invoice(client, db)
        _pay(client, first["id"], 61.60)
        return _credit(client, first, (_line(first, "CN-TEE"), 2, False)).json()

    def test_not_more_than_is_left_of_the_credit(self, client, db):
        note = self._on_account(client, db)
        later = _invoice(client, db)
        r = client.post(
            f"/credit-notes/{note['id']}/apply",
            json={"job_id": later["id"], "amount": 30},
        )
        assert r.status_code == 422

    def test_not_more_than_the_invoice_owes(self, client, db):
        note = self._on_account(client, db)
        later = _invoice(
            client,
            db,
            lines=[{"sort": 0, "stock_code": "CN-CAP", "order_qty": 1, "price_ex": 8}],
        )
        r = client.post(
            f"/credit-notes/{note['id']}/apply",
            json={"job_id": later["id"], "amount": 22},
        )
        assert r.status_code == 422
        assert "8.80" in r.json()["detail"]

    def test_never_on_another_customers_invoice(self, client, db):
        note = self._on_account(client, db)
        theirs = _invoice(client, db, customer="CN-D")
        r = client.post(
            f"/credit-notes/{note['id']}/apply",
            json={"job_id": theirs["id"], "amount": 5},
        )
        assert r.status_code == 409


class TestACreditedInvoiceStaysInvoiced:
    def test_it_cannot_be_taken_back_out(self, client, db):
        job = _invoice(client, db)
        _credit(client, job, (_line(job, "CN-CAP"), 1, False))
        r = client.post(f"/jobs/{job['id']}/status", json={"status": "CANCEL"})
        assert r.status_code == 409
        assert "CN-0001" in r.json()["detail"]
        assert _job(db, job["id"]).status == "INVOICE"


class TestGoodsBack:
    def _stock(self, db, sku):
        db.expire_all()
        return db.query(InventoryItem).filter_by(sku=sku).one().stock

    def _inspect(self, client, note, outcome):
        url = f"/credit-notes/{note['id']}/lines/{note['lines'][0]['id']}/inspect"
        return client.post(url, json={"outcome": outcome})

    def test_plain_goods_wait_for_inspection_and_are_not_stock(self, client, db):
        job = _invoice(client, db)
        before = self._stock(db, "CN-TEE")
        r = _credit(client, job, (_line(job, "CN-TEE"), 2, True))
        line = r.json()["lines"][0]
        assert (line["restockable"], line["inspection"]) == (True, "waiting")
        # Not stock until inspected: nothing can be promised against it.
        assert self._stock(db, "CN-TEE") == before
        assert db.query(StockMovement).filter_by(type="Return").count() == 0
        waiting = client.get("/returns").json()
        assert [(w["stock_code"], w["qty"]) for w in waiting] == [("CN-TEE", 2)]

    def test_restocked_they_come_into_stock_at_the_jobs_branch(self, client, db):
        job = _invoice(client, db)
        note = _credit(client, job, (_line(job, "CN-TEE"), 2, True)).json()
        before = self._stock(db, "CN-TEE")
        at_hq = position_qty(db, "CN-TEE", "HQ")
        r = self._inspect(client, note, "restock")
        assert r.status_code == 200, r.text
        assert r.json()["lines"][0]["inspection"] == "restocked"
        assert self._stock(db, "CN-TEE") == before + 2
        assert position_qty(db, "CN-TEE", "HQ") == at_hq + 2
        moved = db.query(StockMovement).filter_by(type="Return").one()
        assert (moved.location_branch, moved.quantity) == ("HQ", 2)
        assert self._inspect(client, note, "scrap").status_code == 409
        assert client.get("/returns").json() == []
        done = client.get("/returns?status=restocked").json()
        assert [d["stock_code"] for d in done] == ["CN-TEE"]

    def test_written_off_they_never_were_stock(self, client, db):
        job = _invoice(client, db)
        note = _credit(client, job, (_line(job, "CN-TEE"), 2, True)).json()
        before = self._stock(db, "CN-TEE")
        assert self._inspect(client, note, "scrap").status_code == 200
        assert self._stock(db, "CN-TEE") == before
        assert db.query(StockMovement).filter_by(type="Return").count() == 0

    def test_a_code_no_longer_stock_cannot_be_restocked(self, client, db):
        job = _invoice(client, db)
        note = _credit(client, job, (_line(job, "CN-TEE"), 2, True)).json()
        db.query(InventoryItem).filter_by(sku="CN-TEE").one().sku = "CN-TEE-OLD"
        db.commit()
        assert self._inspect(client, note, "restock").status_code == 409
        assert self._inspect(client, note, "scrap").status_code == 200

    def test_decorated_goods_never_come_back_into_stock(self, client, db):
        job = _invoice(
            client,
            db,
            lines=[
                {
                    "sort": 0,
                    "stock_code": "CN-TEE",
                    "order_qty": 2,
                    "price_ex": 10,
                    "decoration_type": "EMB",
                }
            ],
        )
        line = _credit(client, job, (_line(job, "CN-TEE"), 2, True)).json()["lines"][0]
        assert (line["goods_back"], line["restockable"], line["inspection"]) == (
            True,
            False,
            None,
        )
        assert client.get("/returns").json() == []

    def test_a_logo_that_names_no_garment_decorates_them_all(self, client, db):
        from app.core.credit_notes import decorated
        from app.models.job import JobItem

        garment = JobItem(id=1, decoration_type="None", applies_to_item_id=None)
        cap = JobItem(id=2, decoration_type="None", applies_to_item_id=None)
        logo = JobItem(id=3, logo_id=9, applies_to_item_id=None)
        alteration = JobItem(id=4, applies_to_item_id=2)
        assert decorated(garment, [garment, logo])
        assert decorated(cap, [garment, cap, alteration])
        assert not decorated(garment, [garment, cap, alteration])
        named = JobItem(id=5, logo_id=9, applies_to_item_id=2)
        assert not decorated(garment, [garment, cap, named])

    def test_not_more_back_than_went_out(self, client, db):
        job = _invoice(client, db)
        tee = _line(job, "CN-TEE")
        _credit(client, job, (tee, 3, True))
        r = _credit(client, job, (tee, 1, False))
        assert r.status_code == 200  # money only is fine
        assert _credit(client, job, (tee, 1, True)).status_code == 422  # only 4 went


class TestTheReportsAgree:
    def test_gst_and_bas_take_the_credit_off(self, client, db):
        job = _invoice(client, db)
        _credit(client, job, (_line(job, "CN-CAP"), 2, False))  # $16 ex, $1.60 GST
        day = job["invoice_date"][:10]
        gst = client.get(f"/reports/gst?date_from={day}&date_to={day}").json()[
            "summary"
        ]
        assert gst["1A_gst_collected"] == 4.0  # 5.60 less 1.60
        assert gst["G1_total_sales_inc_gst"] == 44.0
        summary = client.get(
            f"/reports/bas-summary?date_from={day}&date_to={day}"
        ).json()
        assert (summary["G1"], summary["1A"]) == (44.0, 4.0)
        from datetime import date

        ledger = bas(db, date.fromisoformat(day), date.fromisoformat(day))
        assert (ledger["G1"], ledger["1A"]) == (44.0, 4.0)

    def test_credit_on_account_shows_in_receivables_and_the_statement(self, client, db):
        job = _invoice(client, db)
        _pay(client, job["id"], 61.60)
        _credit(client, job, (_line(job, "CN-TEE"), 1, False))
        aged = client.get("/reports/aged-receivables").json()
        row = next(r for r in aged["rows"] if r["customer_id"] == CUSTOMER)
        assert (row["current"], row["total"]) == (-11.0, -11.0)
        statement = client.get(f"/reports/customers/{CUSTOMER}/statement").json()
        credit = next(l for l in statement["lines"] if l["status"] == "CREDIT")
        assert (credit["invoice_no"], credit["balance"]) == ("CN-0001", -11.0)
        assert statement["totals"]["outstanding"] == -11.0
        assert statement["totals"]["credited"] == 11.0

    def test_the_sales_register_nets_it(self, client, db):
        job = _invoice(client, db)
        _credit(client, job, (_line(job, "CN-CAP"), 1, False))
        summary = client.get("/jobs/sales-register").json()["summary"]
        assert summary["credited_inc"] == 8.8
        assert summary["net_inc"] == round(summary["total_inc"] - 8.8, 2)

    def test_the_adjustment_note_prints(self, client, db):
        job = _invoice(client, db)
        note = _credit(client, job, (_line(job, "CN-CAP"), 1, False)).json()
        r = client.get(f"/credit-notes/{note['id']}/pdf")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF")


class TestWhatTheReviewFound:
    """Review of 2026-11-10 (docs/superpowers/specs/2026-11-09-returns-credit-notes.md)."""

    def test_credit_used_a_month_later_moves_no_gst_between_months(self, client, db):
        from datetime import date

        from app.core.ledger_postings import sync_invoice

        _setup(db)
        db.add(
            Job(
                id="CN-S1",
                customer_id=CUSTOMER,
                customer_name="Credit Co",
                status="INVOICE",
                invoice="J2-90",
                invoice_date="2026-09-01",
                total_ex=56,
                tax=5.6,
                total_inc=61.6,
                deposit=0,
                balance_due=61.6,
            )
        )
        db.commit()
        sync_invoice(db, _job(db, "CN-S1"))  # posted in September
        db.commit()
        _pay(client, "CN-S1", 61.60)
        note = client.post(
            "/jobs/CN-S1/credit-notes",
            json={"amount": 22, "reason": "Wrong size", "credit_date": "2026-09-15"},
        ).json()
        september = (date(2026, 9, 1), date(2026, 9, 30))
        before = bas(db, *september)
        later = _invoice(client, db)
        r = client.post(
            f"/credit-notes/{note['id']}/apply",
            json={"job_id": later["id"], "amount": 22.0},
        )
        assert r.status_code == 200, r.text
        db.expire_all()
        after = bas(db, *september)
        assert (after["G1"], after["1A"]) == (before["G1"], before["1A"])
        paper = client.get(
            "/reports/bas-summary?date_from=2026-09-01&date_to=2026-09-30"
        ).json()
        assert (paper["G1"], paper["1A"]) == (after["G1"], after["1A"])
        _agrees(db)

    def test_not_dated_in_a_locked_period(self, client, db):
        from datetime import date

        from app.core.ledger import set_lock_date

        job = _invoice(client, db)
        _job(db, job["id"]).invoice_date = "2026-09-01"
        set_lock_date(db, date(2026, 9, 30))
        db.commit()
        r = _credit(
            client, job, (_line(job, "CN-CAP"), 1, False), credit_date="2026-09-15"
        )
        assert r.status_code == 422
        assert "locked up to 2026-09-30" in r.json()["detail"]

    def test_dated_by_the_shops_day_not_the_servers(self, client, db):
        from datetime import timedelta

        from app.core import shop_day

        job = _invoice(client, db)
        today = shop_day.today()
        tee = _line(job, "CN-TEE")
        later = (today + timedelta(days=1)).isoformat()
        assert (
            _credit(client, job, (tee, 1, False), credit_date=later).status_code == 422
        )
        r = _credit(client, job, (tee, 1, False), credit_date=today.isoformat())
        assert r.status_code == 200, r.text
        assert r.json()["credit_date"] == today.isoformat()

    def test_credit_is_never_applied_before_its_note(self, client, db):
        job = _invoice(client, db)
        _pay(client, job["id"], 61.60)
        note = _credit(client, job, (_line(job, "CN-TEE"), 1, False)).json()
        ahead = "2999-01-01"  # a note dated after the server's today
        db.get(CustomerCreditNote, note["id"]).credit_date = ahead
        db.commit()
        later = _invoice(client, db)
        r = client.post(
            f"/credit-notes/{note['id']}/apply",
            json={"job_id": later["id"], "amount": 11.0},
        )
        assert r.status_code == 200, r.text
        assert r.json()["applications"][-1]["applied_on"] == ahead

    def test_an_amount_credits_an_invoice_with_no_lines(self, client, db):
        _setup(db)
        db.add(
            Job(
                id="CN-H1",
                customer_id=CUSTOMER,
                customer_name="Credit Co",
                status="INVOICE",
                invoice="J2-78",
                invoice_date="2026-10-01",
                total_ex=100,
                tax=10,
                total_inc=110,
                deposit=0,
                balance_due=110,
            )
        )
        db.commit()
        from app.core.ledger_postings import sync_invoice

        sync_invoice(db, _job(db, "CN-H1"))  # as the import posts it
        db.commit()
        r = client.post(
            "/jobs/CN-H1/credit-notes", json={"amount": 33, "reason": "Late delivery"}
        )
        assert r.status_code == 200, r.text
        assert (r.json()["total_ex"], r.json()["tax"], r.json()["total_inc"]) == (
            30.0,
            3.0,
            33.0,
        )
        assert r.json()["lines"] == []
        assert float(_job(db, "CN-H1").balance_due) == 77.0
        too_much = client.post(
            "/jobs/CN-H1/credit-notes", json={"amount": 78, "reason": "x"}
        )
        assert too_much.status_code == 422
        rest = client.post(
            "/jobs/CN-H1/credit-notes", json={"amount": 77, "reason": "x"}
        )
        assert (rest.json()["total_ex"], rest.json()["tax"]) == (70.0, 7.0)
        assert client.get("/credit-notes/CN-0001/pdf").status_code == 200
        _agrees(db)

    def test_lines_or_an_amount_not_both(self, client, db):
        job = _invoice(client, db)
        r = client.post(
            f"/jobs/{job['id']}/credit-notes",
            json={
                "lines": [{"item_id": _line(job, "CN-TEE"), "qty": 1}],
                "amount": 5,
                "reason": "x",
            },
        )
        assert r.status_code == 422
        bare = client.post(f"/jobs/{job['id']}/credit-notes", json={"reason": "x"})
        assert bare.status_code == 422

    def test_a_payment_after_a_credit_settles_what_is_left(self, client, db):
        job = _invoice(client, db)
        _credit(client, job, (_line(job, "CN-CAP"), 1, False))  # $8.80 off
        _pay(client, job["id"], 52.80)
        after = _job(db, job["id"])
        assert (float(after.balance_due), after.payment_status) == (0.0, "paid")
        r = client.post(
            f"/jobs/{job['id']}/payment", json={"amount": 0.01, "method": "EFT"}
        )
        assert r.status_code == 400
        _agrees(db)

    def test_a_jim2_reimport_counts_the_credit_as_settled(self, client, db):
        import io

        def _import(row):
            body = io.BytesIO(
                (
                    "Job#,Cust#,Customer,Status,Inv#,Inv Date,Total Ex,Tax,"
                    "Total Inc,Invoice Paid $\n" + row + "\n"
                ).encode()
            )
            r = client.post(
                "/import/jobs", files={"file": ("jobs.csv", body, "text/csv")}
            )
            assert r.status_code == 200, r.text
            return r.json()

        _setup(db)
        _import(f"CN-J1,{CUSTOMER},Credit Co,Invoiced,J2-99,01/10/2026,100,10,110,0")
        r = client.post("/jobs/CN-J1/credit-notes", json={"amount": 22, "reason": "x"})
        assert r.status_code == 200, r.text
        # Jim2 says paid in full; with the $22 credited here that is $22 over.
        refused = _import(
            f"CN-J1,{CUSTOMER},Credit Co,Paid,J2-99,01/10/2026,100,10,110,110"
        )
        assert refused["errors"], refused
        assert "credited" in str(refused["errors"])
        ok = _import(f"CN-J1,{CUSTOMER},Credit Co,Paid,J2-99,01/10/2026,100,10,110,88")
        assert not ok["errors"], ok
        after = _job(db, "CN-J1")
        assert (float(after.deposit), float(after.balance_due)) == (88.0, 0.0)
        _agrees(db)

    def test_health_lists_an_invoice_paid_and_credited_past_its_total(self, client, db):
        job = _invoice(client, db)
        _credit(client, job, (_line(job, "CN-CAP"), 1, False))
        _job(db, job["id"]).deposit = 61.60  # written past every check
        db.commit()
        found = health(db)
        assert [o["job_id"] for o in found["paid_and_credited_past_total"]] == [
            job["id"]
        ]
        assert not found["in_agreement"]


def test_an_older_invoice_with_no_inclusive_total_is_not_called_overpaid(client, db):
    from app.core.ledger_postings import sync_invoice

    _setup(db)
    db.add(
        Job(
            id="CN-OLD",
            customer_id=CUSTOMER,
            customer_name="Credit Co",
            status="INVOICE",
            invoice="J2-1",
            invoice_date="2026-10-01",
            total_ex=100,
            tax=10,
            total_inc=0,  # never computed: it owes ex + GST
            deposit=0,
            balance_due=110,
        )
    )
    db.commit()
    sync_invoice(db, _job(db, "CN-OLD"))
    db.commit()
    _pay(client, "CN-OLD", 110)
    assert health(db)["paid_and_credited_past_total"] == []

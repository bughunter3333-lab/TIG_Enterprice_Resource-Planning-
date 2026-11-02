"""Supplier credit notes: the 2026-11-01 simulation, S2-09.

A printer credited $110 for shirts it ruined. The credit note went in as a
negative bill and then could be neither paid nor set against the bill, and
aged payables passed it over — so after TIG paid the net $444.40, the printer
read as owed $110 for ever, while the ledger said nothing was owed.
"""

import pytest

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def suppliers(make_supplier):
    make_supplier(id="PRINTCO", name="Print Co")
    make_supplier(id="OTHER", name="Other Co")


def _bill(client, number, ex, supplier_id="PRINTCO"):
    r = client.post(
        "/ap/bills",
        json={
            "supplier_id": supplier_id,
            "supplier_name": supplier_id,
            "bill_number": number,
            "bill_date": "2026-10-01",
            "due_date": "2026-10-31",
            "amount_ex": ex,
            "tax": round(ex * 0.1, 2),
            "amount_inc": round(ex * 1.1, 2),
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _apply(client, credit, bill):
    return client.post(f"/ap/bills/{credit['id']}/apply", json={"bill_id": bill["id"]})


def _aged_total(client):
    return client.get("/reports/aged-payables").json()["totals"]["total"]


class TestACreditNote:
    @pytest.fixture
    def pair(self, client):
        return _bill(client, "PRT-INV-55", 504.0), _bill(client, "PRT-CN-55", -100.0)

    def test_aged_payables_nets_it_before_it_is_applied(self, client, pair):
        assert _aged_total(client) == 444.4
        assert client.get("/ap/summary").json()["total_open_amount"] == 444.4

    def test_applied_and_the_net_paid_nothing_is_owed(self, client, pair):
        bill, credit = pair
        r = _apply(client, credit, bill)
        assert r.status_code == 200, r.text
        assert r.json()["outstanding"] == 444.4
        r = client.post(f"/ap/bills/{bill['id']}/pay", json={"paid_amount": 444.4})
        assert r.status_code == 200, r.text
        assert (r.json()["status"], r.json()["outstanding"]) == ("paid", 0.0)
        assert client.get(f"/ap/bills/{credit['id']}").json()["status"] == "paid"
        assert _aged_total(client) == 0
        assert client.get("/ap/summary").json()["total_open_amount"] == 0
        assert client.get("/accounting/health").json()["payables"]["difference"] == 0

    def test_paid_first_the_credit_settles_the_rest(self, client, pair):
        bill, credit = pair
        client.post(f"/ap/bills/{bill['id']}/pay", json={"paid_amount": 444.4})
        r = _apply(client, credit, bill)
        assert (r.json()["status"], r.json()["outstanding"]) == ("paid", 0.0)

    def test_it_is_not_paid(self, client, pair):
        _, credit = pair
        r = client.post(f"/ap/bills/{credit['id']}/pay", json={"paid_amount": 110})
        assert r.status_code == 409
        assert "credit note" in r.json()["detail"]

    def test_not_for_more_than_the_bill_has_outstanding(self, client, pair):
        bill, credit = pair
        client.post(f"/ap/bills/{bill['id']}/pay", json={"paid_amount": 500})
        assert _apply(client, credit, bill).status_code == 409

    def test_not_to_another_suppliers_bill(self, client, pair):
        _, credit = pair
        other = _bill(client, "OTH-1", 200.0, supplier_id="OTHER")
        assert _apply(client, credit, other).status_code == 422

    def test_once_only(self, client, pair):
        bill, credit = pair
        _apply(client, credit, bill)
        assert _apply(client, credit, bill).status_code == 409

    def test_deleted_the_bill_is_owed_it_again(self, client, pair):
        bill, credit = pair
        _apply(client, credit, bill)
        assert client.delete(f"/ap/bills/{credit['id']}").status_code == 204
        assert client.get(f"/ap/bills/{bill['id']}").json()["outstanding"] == 554.4
        assert client.get("/accounting/health").json()["payables"]["difference"] == 0

    def test_the_bill_is_not_edited_below_its_credit(self, client, pair):
        bill, credit = pair
        _apply(client, credit, bill)
        r = client.patch(
            f"/ap/bills/{bill['id']}",
            json={"amount_ex": 80.0, "tax": 8.0, "amount_inc": 88.0},
        )
        assert r.status_code == 409
        assert client.get(f"/ap/bills/{bill['id']}").json()["outstanding"] == 444.4

    def test_an_applied_credit_is_not_edited_past_its_bill(self, client, pair):
        bill, credit = pair
        client.post(f"/ap/bills/{bill['id']}/pay", json={"paid_amount": 400})
        _apply(client, credit, bill)  # 554.40 - 400 - 110 = 44.40 left
        r = client.patch(
            f"/ap/bills/{credit['id']}",
            json={"amount_ex": -200.0, "tax": -20.0, "amount_inc": -220.0},
        )
        assert r.status_code == 409
        r = client.patch(
            f"/ap/bills/{credit['id']}",
            json={"amount_ex": 10.0, "tax": 1.0, "amount_inc": 11.0},
        )
        assert r.status_code == 409

    def test_neither_side_moves_to_another_supplier(self, client, pair):
        bill, credit = pair
        _apply(client, credit, bill)
        for which in (credit, bill):
            r = client.patch(
                f"/ap/bills/{which['id']}",
                json={"supplier_id": "OTHER", "supplier_name": "OTHER"},
            )
            assert r.status_code == 409

    def test_it_names_the_bill_it_came_off(self, client, pair):
        bill, credit = pair
        _apply(client, credit, bill)
        got = client.get(f"/ap/bills/{credit['id']}").json()
        assert (got["applied_to_bill_id"], got["applied_to_bill_number"]) == (
            bill["id"],
            "PRT-INV-55",
        )
        # Listed with paid bills only, its bill is not in the list beside it.
        [listed] = [
            b
            for b in client.get("/ap/bills", params={"status": "paid"}).json()
            if b["id"] == credit["id"]
        ]
        assert listed["applied_to_bill_number"] == "PRT-INV-55"

    def test_open_bills_are_what_it_can_come_off(self, client, pair):
        bill, credit = pair
        paid = _bill(client, "PRT-OLD", 10.0)
        client.post(f"/ap/bills/{paid['id']}/pay", json={"paid_amount": 11.0})
        listed = client.get(
            "/ap/bills", params={"supplier_id": "PRINTCO", "open_only": True}
        ).json()
        assert {b["bill_number"] for b in listed} == {"PRT-INV-55", "PRT-CN-55"}
        _apply(client, credit, bill)
        listed = client.get(
            "/ap/bills", params={"supplier_name": "PRINTCO", "open_only": True}
        ).json()
        assert {b["bill_number"] for b in listed} == {"PRT-INV-55"}

    def test_a_credit_note_is_never_overdue(self, client, pair):
        # Both dated past due: only the bill is overdue, at its own amount.
        summary = client.get("/ap/summary").json()
        assert (summary["overdue_count"], summary["overdue_amount"]) == (1, 554.4)
        assert summary["total_open_amount"] == 444.4

    def test_it_can_be_edited(self, client, pair):
        bill, credit = pair
        _apply(client, credit, bill)
        r = client.patch(
            f"/ap/bills/{credit['id']}",
            json={"amount_ex": -50.0, "tax": -5.0, "amount_inc": -55.0},
        )
        assert r.status_code == 200, r.text
        assert client.get(f"/ap/bills/{bill['id']}").json()["outstanding"] == 499.4

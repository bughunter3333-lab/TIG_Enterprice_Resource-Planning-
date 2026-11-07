"""A customer can be put on credit hold, and taken off it (Phase 0).

The credit check already refused an order for a customer on hold, but
`customers.credit_hold` had no writer: nobody could put one on hold.
"""

import pytest

from app.models.customer import Customer

pytestmark = pytest.mark.integration


def _customer(db):
    db.add(Customer(id="HOLD-C", name="Hold Co", credit_limit=0))
    db.commit()


def _order(client):
    return client.post("/jobs", json={"customer_id": "HOLD-C", "status": "ORDER"})


def test_a_customer_put_on_hold_cannot_place_an_order(client, db):
    _customer(db)
    r = client.patch("/customers/HOLD-C", json={"credit_hold": True})
    assert r.status_code == 200, r.text
    assert r.json()["credit_hold"] is True
    refused = _order(client)
    assert refused.status_code == 422
    assert "credit hold" in refused.json()["detail"]


def test_taken_off_hold_it_can_again(client, db):
    _customer(db)
    client.patch("/customers/HOLD-C", json={"credit_hold": True})
    r = client.patch("/customers/HOLD-C", json={"credit_hold": False})
    assert r.json()["credit_hold"] is False
    assert _order(client).status_code == 200


def test_an_edit_that_does_not_mention_the_hold_leaves_it(client, db):
    _customer(db)
    client.patch("/customers/HOLD-C", json={"credit_hold": True})
    client.patch("/customers/HOLD-C", json={"name": "Hold Co Pty"})
    db.expire_all()
    assert db.get(Customer, "HOLD-C").credit_hold is True

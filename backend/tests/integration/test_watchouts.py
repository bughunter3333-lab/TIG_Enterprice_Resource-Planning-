"""Watchouts (docs/superpowers/specs/2026-11-09-watchouts.md): a note on a
customer, shown with every job for them."""

import pytest

from app.models.customer import Customer
from app.models.job import Job

pytestmark = pytest.mark.integration


def _customer(db, note=None):
    db.add(Customer(id="WO-C", name="Watch Co", credit_limit=99999.0, watchout=note))
    db.commit()


def test_set_on_the_customer_and_cleared(client, db):
    _customer(db)
    r = client.patch(
        "/customers/WO-C", json={"watchout": "Ask if name badges are needed"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["watchout"] == "Ask if name badges are needed"
    assert (
        client.patch("/customers/WO-C", json={"watchout": ""}).json()["watchout"] == ""
    )


def test_at_most_500_characters(client, db):
    _customer(db)
    assert (
        client.patch("/customers/WO-C", json={"watchout": "x" * 501}).status_code == 422
    )


def test_every_job_for_them_carries_it_and_a_change_reaches_them_all(client, db):
    _customer(db, "Navy thread only")
    db.add(Job(id="WO-1", customer_id="WO-C", customer_name="Watch Co", status="New"))
    db.commit()
    assert client.get("/jobs/WO-1").json()["customer_watchout"] == "Navy thread only"
    client.patch("/customers/WO-C", json={"watchout": "White thread only"})
    assert client.get("/jobs/WO-1").json()["customer_watchout"] == "White thread only"
    listed = next(j for j in client.get("/jobs").json() if j["id"] == "WO-1")
    assert listed["customer_watchout"] == "White thread only"


def test_given_when_the_customer_is_made(client):
    r = client.post(
        "/customers",
        json={"id": "WO-NEW", "name": "New Watch Co", "watchout": "COD only"},
    )
    assert r.status_code in (200, 201), r.text
    assert r.json()["watchout"] == "COD only"

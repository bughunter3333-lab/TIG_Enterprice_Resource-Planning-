"""A site jobs deliver to is not deleted from under them (Phase 0).

The screen now edits a customer's sites. A job points at its site
(`jobs.ship_to_id`, a foreign key), so on Postgres deleting a site in use
failed with a server error; SQLite does not enforce the key, so no test saw it.
"""

import pytest

from app.models.customer import Customer
from app.models.customer_ship_to import CustomerShipTo
from app.models.job import Job

pytestmark = pytest.mark.integration


def _site(db, code="S-1"):
    if not db.get(Customer, "SITE-C"):
        db.add(Customer(id="SITE-C", name="Site Co", credit_limit=99999.0))
        db.commit()
    site = CustomerShipTo(customer_id="SITE-C", code=code, name="Depot")
    db.add(site)
    db.commit()
    return site.id


def test_an_unused_site_is_deleted(client, db):
    sid = _site(db)
    r = client.delete(f"/customers/SITE-C/ship-tos/{sid}")
    assert r.status_code == 200, r.text
    assert db.get(CustomerShipTo, sid) is None


def test_a_site_jobs_deliver_to_is_kept_and_says_why(client, db):
    sid = _site(db)
    db.add(Job(id="SITE-J1", customer_id="SITE-C", status="ORDER", ship_to_id=sid))
    db.add(Job(id="SITE-J2", customer_id="SITE-C", status="PAID", ship_to_id=sid))
    db.commit()
    r = client.delete(f"/customers/SITE-C/ship-tos/{sid}")
    assert r.status_code == 409
    assert "2 jobs" in r.json()["detail"]
    db.expire_all()
    assert db.get(CustomerShipTo, sid) is not None

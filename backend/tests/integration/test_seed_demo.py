"""seed_demo.py: TIG-style demo data, loaded through the API, keeps the books true.

Everything the demo does a person could do at the screen, so the same rules
hold: each job sits where the floor left it, the invoices carry numbers and
ledger entries, and the ledger agrees with the documents it summarises.
"""

import pytest

import seed_demo
from app.models.dispatch_session import DispatchSessionLine
from app.models.settings import CompanySettings

pytestmark = pytest.mark.integration


def _differences(report):
    """Every `difference` the ledger health report gives, wherever it nests."""
    if isinstance(report, dict):
        for key, value in report.items():
            if key == "difference":
                yield value
            else:
                yield from _differences(value)
    elif isinstance(report, list):
        for value in report:
            yield from _differences(value)


@pytest.fixture
def loaded(client, db):
    return seed_demo.load(client, db)


def test_every_customer_supplier_stock_item_and_logo_goes_in(loaded):
    assert loaded["customers"] == len(seed_demo.CUSTOMERS)
    assert loaded["suppliers"] == len(seed_demo.SUPPLIERS)
    assert loaded["stock"] == len(seed_demo.STOCK)
    assert loaded["logos"] == len(seed_demo.LOGOS)


def test_the_work_sits_across_the_ladder(client, loaded):
    jobs = loaded["jobs"]

    def status(job_id):
        return client.get(f"/jobs/{job_id}").json()["status"]

    assert status(jobs["council"]) == "PAID"
    assert status(jobs["arcare_knox"]) == "INVOICE"
    assert status(jobs["arcare_parkville"]) == "PRINT"
    assert status(jobs["goodstart"]) == "Pick/Pack"
    assert status(jobs["yha"]) == "FINISH"
    assert [status(j) for j in jobs["zone_bowling"]] == ["PAID", "PAID"]
    assert status(jobs["ricoh"]) == "In Progress"
    assert status(jobs["timezone"]) == "PROOF"
    assert status(jobs["merrylands"]) == "ORDER"
    assert status(jobs["bank_quote"]) == "QUOTE"


def test_the_quote_takes_the_polo_price_break(client, loaded):
    quote = client.get(f"/jobs/{loaded['jobs']['bank_quote']}").json()
    polo = next(i for i in quote["items"] if i["stock_code"] == "BZ-P400-NVY-M")
    assert polo["price_ex"] == 29.50


def test_the_ledger_agrees_with_the_documents(client, loaded):
    r = client.get("/accounting/health")
    assert r.status_code == 200, r.text
    differences = list(_differences(r.json()))
    assert differences, r.json()
    assert all(float(d) == 0 for d in differences), r.json()


def test_a_site_delivery_carries_the_sites_address(client, db, loaded):
    knox = loaded["jobs"]["arcare_knox"]
    job = client.get(f"/jobs/{knox}").json()
    assert job["ship_to"] == "AR.KNO" and job["ship_to_id"] is not None
    # The despatch records where it went, so the delivery note prints it.
    line = db.query(DispatchSessionLine).filter_by(job_id=knox).one()
    assert line.address == "Arcare Knox, Wantirna South VIC 3152"


@pytest.mark.parametrize(
    "stops_at",
    [
        "/customers/ARCARE/ship-tos",  # the customer made, its sites not
        "/inventory/BZ-P400-NVY-M/pricing/levels",  # the polo, not its breaks
    ],
)
def test_a_run_stopped_part_way_is_completed_by_the_next(
    client, db, monkeypatch, stops_at
):
    real = seed_demo.call
    hits = []

    def drops_once(client_, method, path, body=None, params=None):
        if path == stops_at and not hits:
            hits.append(path)
            raise seed_demo.SeedError("connection dropped")
        return real(client_, method, path, body, params)

    monkeypatch.setattr(seed_demo, "call", drops_once)
    with pytest.raises(seed_demo.SeedError):
        seed_demo.load(client, db)
    jobs = seed_demo.load(client, db)["jobs"]

    quote = client.get(f"/jobs/{jobs['bank_quote']}").json()
    polo = next(i for i in quote["items"] if i["stock_code"] == "BZ-P400-NVY-M")
    assert polo["price_ex"] == 29.50
    knox = client.get(f"/jobs/{jobs['arcare_knox']}").json()
    assert knox["ship_to_id"] is not None
    assert client.get("/accounting/health").json()["in_agreement"] is True


def test_a_new_database_with_no_company_settings_loads_too(client, db):
    # The tests' own fixture makes a settings row; a database fresh from
    # `alembic upgrade head` has none until someone opens Company Settings.
    db.query(CompanySettings).delete()
    db.commit()
    seed_demo.load(client, db)
    health = client.get("/accounting/health").json()
    assert health["in_agreement"] is True, health


def test_a_second_run_adds_nothing(client, db, loaded):
    again = seed_demo.load(client, db)
    assert again == {
        "customers": 0,
        "suppliers": 0,
        "stock": 0,
        "logos": 0,
        "jobs": "already loaded - skipped",
    }

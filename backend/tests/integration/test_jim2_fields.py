import pytest


@pytest.mark.integration
def test_job_create_with_jim2_fields(client, make_customer):
    cust = make_customer()
    payload = {
        "customer_id": cust.id,
        "customer_name": cust.name,
        "status": "QUOTE",
        "price_level": "Trade",
        "acc_mgr": "JD",
        "invoice_desc": "Custom embroidery order",
        "ex_job_ref": "PO-9999",
        "requested_by": "Alice Smith",
        "lock_rate": True,
        "items": [],
    }
    res = client.post("/jobs", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["price_level"] == "Trade"
    assert data["acc_mgr"] == "JD"
    assert data["invoice_desc"] == "Custom embroidery order"
    assert data["ex_job_ref"] == "PO-9999"
    assert data["requested_by"] == "Alice Smith"
    assert data["lock_rate"] is True


@pytest.mark.integration
def test_job_update_jim2_fields(client, make_customer):
    cust = make_customer()
    create_res = client.post("/jobs", json={
        "customer_id": cust.id, "customer_name": cust.name, "status": "QUOTE", "items": [],
    })
    job_id = create_res.json()["id"]

    patch_res = client.patch(f"/jobs/{job_id}", json={"price_level": "VIP", "requested_by": "Bob"})
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["price_level"] == "VIP"
    assert data["requested_by"] == "Bob"


@pytest.mark.integration
def test_job_ship_to_code_round_trips(client, make_customer):
    """ship_to is the Jim2 string code; it must persist through create, read, and update.

    Regression guard: the ORM relationship over ship_to_id previously shadowed this
    column, leaving the string code silently unmapped and unusable as job.ship_to.
    """
    cust = make_customer()
    create_res = client.post("/jobs", json={
        "customer_id": cust.id, "customer_name": cust.name, "status": "QUOTE",
        "ship_to": "DOCK-3", "items": [],
    })
    assert create_res.status_code == 200
    job_id = create_res.json()["id"]
    assert create_res.json()["ship_to"] == "DOCK-3"

    get_res = client.get(f"/jobs/{job_id}")
    assert get_res.json()["ship_to"] == "DOCK-3"

    patch_res = client.patch(f"/jobs/{job_id}", json={"ship_to": "WAREHOUSE-B"})
    assert patch_res.status_code == 200
    assert patch_res.json()["ship_to"] == "WAREHOUSE-B"

# backend/tests/integration/test_stock_module.py
import pytest
from app.models.job import Job, JobItem
from app.models.inventory import StockMovement


@pytest.mark.integration
def test_list_locations_empty(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.get("/inventory/SKU001/locations")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.integration
def test_create_location(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.post("/inventory/SKU001/locations", json={"branch": "HQ", "qty_on_hand": 10})
    assert resp.status_code == 200
    data = resp.json()
    assert data["branch"] == "HQ"
    assert data["qty_on_hand"] == 10
    assert data["available_qty"] == 10


@pytest.mark.integration
def test_create_duplicate_location_fails(client, make_inventory):
    make_inventory(sku="SKU001")
    client.post("/inventory/SKU001/locations", json={"branch": "HQ", "qty_on_hand": 5})
    resp = client.post("/inventory/SKU001/locations", json={"branch": "HQ", "qty_on_hand": 3})
    assert resp.status_code == 409


@pytest.mark.integration
def test_list_locations(client, make_inventory):
    make_inventory(sku="SKU001")
    client.post("/inventory/SKU001/locations", json={"branch": "HQ", "qty_on_hand": 5})
    client.post("/inventory/SKU001/locations", json={"branch": "MELB", "qty_on_hand": 3})
    resp = client.get("/inventory/SKU001/locations")
    assert resp.status_code == 200
    branches = [r["branch"] for r in resp.json()]
    assert "HQ" in branches
    assert "MELB" in branches


@pytest.mark.integration
def test_update_location_bin(client, make_inventory):
    make_inventory(sku="SKU001")
    client.post("/inventory/SKU001/locations", json={"branch": "HQ", "qty_on_hand": 5})
    resp = client.patch("/inventory/SKU001/locations/HQ", json={"primary_bin_1": "Shelf-A1"})
    assert resp.status_code == 200
    assert resp.json()["primary_bin_1"] == "Shelf-A1"


@pytest.mark.integration
def test_delete_location(client, make_inventory):
    make_inventory(sku="SKU001")
    client.post("/inventory/SKU001/locations", json={"branch": "HQ", "qty_on_hand": 5})
    resp = client.delete("/inventory/SKU001/locations/HQ")
    assert resp.status_code == 200
    assert client.get("/inventory/SKU001/locations").json() == []


@pytest.mark.integration
def test_get_pricing_empty(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.get("/inventory/SKU001/pricing")
    assert resp.status_code == 200
    data = resp.json()
    assert "price_levels" in data
    assert data["price_levels"] == []


@pytest.mark.integration
def test_create_price_level_with_breakpoints(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.post("/inventory/SKU001/pricing/levels", json={
        "price_level": "1-Price A",
        "currency": "AUD",
        "tax_code": "G",
        "breakpoints": [{"min_qty": 0, "price_ex": 55.00, "price_inc": 60.50}],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["price_level"] == "1-Price A"
    assert len(data["breakpoints"]) == 1
    assert float(data["breakpoints"][0]["price_ex"]) == pytest.approx(55.00)


@pytest.mark.integration
def test_create_duplicate_price_level_fails(client, make_inventory):
    make_inventory(sku="SKU001")
    client.post("/inventory/SKU001/pricing/levels", json={"price_level": "1-Price A", "breakpoints": []})
    resp = client.post("/inventory/SKU001/pricing/levels", json={"price_level": "1-Price A", "breakpoints": []})
    assert resp.status_code == 409


@pytest.mark.integration
def test_get_pricing_with_levels(client, make_inventory):
    make_inventory(sku="SKU001", unit_cost=30.12)
    client.post("/inventory/SKU001/pricing/levels", json={
        "price_level": "1-Price A",
        "breakpoints": [{"min_qty": 0, "price_ex": 55.00, "price_inc": 60.50}],
    })
    resp = client.get("/inventory/SKU001/pricing")
    assert resp.status_code == 200
    assert len(resp.json()["price_levels"]) == 1


@pytest.mark.integration
def test_delete_price_level(client, make_inventory):
    make_inventory(sku="SKU001")
    create_resp = client.post("/inventory/SKU001/pricing/levels", json={"price_level": "1-Price A", "breakpoints": []})
    level_id = create_resp.json()["id"]
    resp = client.delete(f"/inventory/SKU001/pricing/levels/{level_id}")
    assert resp.status_code == 200
    assert client.get("/inventory/SKU001/pricing").json()["price_levels"] == []


@pytest.mark.integration
def test_update_cost_tracking(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.put("/inventory/SKU001/pricing/cost", json={"last_cost": 30.12, "avg_cost": 30.12})
    assert resp.status_code == 200
    pricing = client.get("/inventory/SKU001/pricing").json()
    assert float(pricing["last_cost"]) == pytest.approx(30.12)


@pytest.mark.integration
def test_transactions_empty(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.get("/inventory/SKU001/transactions")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.integration
def test_transactions_with_job_fk(client, make_inventory, make_customer, db):
    make_inventory(sku="SKU001")
    make_customer(id="CUST001")
    job = Job(id="J001", customer_id="CUST001", customer_name="Test Customer", status="ORDER")
    db.add(job)
    db.commit()
    mv = StockMovement(sku="SKU001", date="10/06/2026", type="Sale", quantity=-2, job_id="J001")
    db.add(mv)
    db.commit()
    resp = client.get("/inventory/SKU001/transactions")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["job_id"] == "J001"
    assert rows[0]["quantity"] == -2


@pytest.mark.integration
def test_committed_empty(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.get("/inventory/SKU001/committed")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.integration
def test_committed_from_job_items(client, make_inventory, make_customer, db):
    make_inventory(sku="SKU001")
    make_customer(id="CUST001")
    job = Job(id="J002", customer_id="CUST001", customer_name="Test Customer", status="ORDER")
    db.add(job)
    db.commit()
    item = JobItem(job_id="J002", stock_code="SKU001", order_qty=5, price_ex=58.00, price_inc=63.80, total=319.00)
    db.add(item)
    db.commit()
    resp = client.get("/inventory/SKU001/committed")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["job_id"] == "J002"
    assert rows[0]["qty"] == 5
    assert float(rows[0]["total_aud"]) == pytest.approx(319.00)


@pytest.mark.integration
def test_committed_excludes_paid_jobs(client, make_inventory, make_customer, db):
    make_inventory(sku="SKU001")
    make_customer(id="CUST001")
    job = Job(id="J003", customer_id="CUST001", customer_name="Test Customer", status="PAID")
    db.add(job)
    db.commit()
    item = JobItem(job_id="J003", stock_code="SKU001", order_qty=3)
    db.add(item)
    db.commit()
    resp = client.get("/inventory/SKU001/committed")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.integration
def test_inventory_update_new_detail_fields(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.patch("/inventory/SKU001", json={
        "item_type": "Non-Depleting",
        "gl_group": "TIG - Apparel - Local",
        "barcode": "9325705135978",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["item_type"] == "Non-Depleting"
    assert data["gl_group"] == "TIG - Apparel - Local"
    assert data["barcode"] == "9325705135978"

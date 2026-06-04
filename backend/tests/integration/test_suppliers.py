"""
Integration tests for /suppliers endpoints.

Covers: CRUD, ABN field, ABN validation.
"""

import pytest


@pytest.mark.integration
class TestSupplierCRUD:
    def test_create_supplier(self, client):
        r = client.post("/suppliers/", json={
            "id": "SUP010",
            "name": "Acme Supplies Pty Ltd",
            "currency": "AUD",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "SUP010"
        assert data["currency"] == "AUD"

    def test_create_duplicate_supplier_id(self, client, make_supplier):
        make_supplier(id="SUP011")
        r = client.post("/suppliers/", json={"id": "SUP011", "name": "Dup"})
        assert r.status_code == 409

    def test_get_supplier(self, client, make_supplier):
        make_supplier(id="SUP012", name="Find Me")
        r = client.get("/suppliers/SUP012")
        assert r.status_code == 200
        assert r.json()["name"] == "Find Me"

    def test_get_supplier_not_found(self, client):
        r = client.get("/suppliers/NOTEXIST")
        assert r.status_code == 404

    def test_update_supplier(self, client, make_supplier):
        make_supplier(id="SUP020")
        r = client.patch("/suppliers/SUP020", json={"phone": "03 9000 0000"})
        assert r.status_code == 200
        assert r.json()["phone"] == "03 9000 0000"

    def test_delete_supplier(self, client, make_supplier):
        make_supplier(id="SUP030")
        r = client.delete("/suppliers/SUP030")
        assert r.status_code == 200


@pytest.mark.integration
class TestSupplierABN:
    def test_create_supplier_with_valid_abn(self, client):
        r = client.post("/suppliers/", json={
            "id": "SUP040",
            "name": "Valid ABN Supplier",
            "abn": "51824753556",
        })
        assert r.status_code == 200
        assert r.json().get("abn") == "51824753556"

    def test_create_supplier_invalid_abn_rejected(self, client):
        r = client.post("/suppliers/", json={
            "id": "SUP041",
            "name": "Bad ABN Supplier",
            "abn": "12345678901",
        })
        assert r.status_code == 422
        assert "ABN" in r.json().get("detail", "")

    def test_create_supplier_no_abn_ok(self, client):
        r = client.post("/suppliers/", json={"id": "SUP042", "name": "No ABN"})
        assert r.status_code == 200

    def test_update_supplier_abn(self, client, make_supplier):
        make_supplier(id="SUP050")
        r = client.patch("/suppliers/SUP050", json={"abn": "51824753556"})
        assert r.status_code == 200
        assert r.json().get("abn") == "51824753556"

    def test_update_supplier_invalid_abn_rejected(self, client, make_supplier):
        make_supplier(id="SUP051")
        r = client.patch("/suppliers/SUP051", json={"abn": "00000000001"})
        assert r.status_code == 422

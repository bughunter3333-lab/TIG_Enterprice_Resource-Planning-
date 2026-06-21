"""
Integration tests for /customers endpoints.

Covers: CRUD, ABN validation, credit limit, customer_group/territory.
"""

import pytest


@pytest.mark.integration
class TestCustomerCRUD:
    def test_create_customer_minimal(self, client):
        r = client.post("/customers/", json={"id": "CUST010", "name": "Acme Corp"})
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "CUST010"
        assert data["name"] == "Acme Corp"
        assert data["status"] == "Active"

    def test_create_customer_duplicate_id(self, client, make_customer):
        make_customer(id="CUST011")
        r = client.post("/customers/", json={"id": "CUST011", "name": "Duplicate"})
        assert r.status_code == 409

    def test_get_customer(self, client, make_customer):
        make_customer(id="CUST012", name="Fetch Me")
        r = client.get("/customers/CUST012")
        assert r.status_code == 200
        assert r.json()["name"] == "Fetch Me"

    def test_get_customer_not_found(self, client):
        r = client.get("/customers/DOESNOTEXIST")
        assert r.status_code == 404

    def test_list_customers(self, client, make_customer):
        make_customer(id="CUST020", name="Alpha Co")
        make_customer(id="CUST021", name="Beta Co")
        r = client.get("/customers/")
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert "CUST020" in ids
        assert "CUST021" in ids

    def test_list_customers_search(self, client, make_customer):
        make_customer(id="CUST022", name="XYZ Industries")
        make_customer(id="CUST023", name="ABC Traders")
        r = client.get("/customers/?search=XYZ")
        assert r.status_code == 200
        assert all("XYZ" in c["name"] for c in r.json())

    def test_update_customer(self, client, make_customer):
        make_customer(id="CUST030")
        r = client.patch("/customers/CUST030", json={"phone": "0400 123 456"})
        assert r.status_code == 200
        assert r.json()["phone"] == "0400 123 456"

    def test_delete_customer(self, client, make_customer):
        make_customer(id="CUST040")
        r = client.delete("/customers/CUST040")
        assert r.status_code == 200
        assert client.get("/customers/CUST040").status_code == 404


@pytest.mark.integration
class TestCustomerABN:
    def test_valid_abn_accepted(self, client):
        r = client.post(
            "/customers/",
            json={
                "id": "CUST050",
                "name": "Valid ABN Co",
                "abn": "51824753556",
            },
        )
        assert r.status_code == 200

    def test_valid_abn_with_spaces_accepted(self, client):
        r = client.post(
            "/customers/",
            json={
                "id": "CUST051",
                "name": "Spaced ABN Co",
                "abn": "51 824 753 556",
            },
        )
        assert r.status_code == 200

    def test_invalid_abn_rejected(self, client):
        r = client.post(
            "/customers/",
            json={
                "id": "CUST052",
                "name": "Bad ABN Co",
                "abn": "12345678901",
            },
        )
        assert r.status_code == 422
        assert "ABN" in r.json().get("detail", "")

    def test_no_abn_accepted(self, client):
        """ABN is optional — customers without one should still be created."""
        r = client.post("/customers/", json={"id": "CUST053", "name": "No ABN Co"})
        assert r.status_code == 200

    def test_update_with_invalid_abn_rejected(self, client, make_customer):
        make_customer(id="CUST054")
        r = client.patch("/customers/CUST054", json={"abn": "99999999999"})
        assert r.status_code == 422


@pytest.mark.integration
class TestCustomerGroupTerritoryFields:
    """customer_group and territory come in Phase 2a migration — test here."""

    def test_create_with_customer_group(self, client):
        r = client.post(
            "/customers/",
            json={
                "id": "CUST060",
                "name": "Grouped Customer",
                "customer_group": "Wholesale",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("customer_group") == "Wholesale"

    def test_create_with_territory(self, client):
        r = client.post(
            "/customers/",
            json={
                "id": "CUST061",
                "name": "Territory Customer",
                "territory": "VIC",
            },
        )
        assert r.status_code == 200
        assert r.json().get("territory") == "VIC"

    def test_default_customer_group(self, client):
        r = client.post("/customers/", json={"id": "CUST062", "name": "Default Group"})
        assert r.status_code == 200
        assert r.json().get("customer_group") == "General"

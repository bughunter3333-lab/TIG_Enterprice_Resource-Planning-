"""
Integration tests for the Jim2 Stock "Descriptions" tab — the extended / web /
care long-form text is editable via PATCH /inventory/{sku} and returned by the
inventory list.
"""

import pytest


@pytest.mark.integration
class TestStockDescriptions:
    def test_patch_persists_and_list_returns_descriptions(self, client, make_inventory):
        make_inventory(sku="DESC1", stock=10)
        r = client.patch(
            "/inventory/DESC1",
            json={
                "desc_extended": "Taped stretch cotton drill — regular fit.",
                "desc_web": "<b>Cargo Pants</b> — durable everyday workwear.",
                "desc_care": "Warm machine wash. Do not tumble dry.",
            },
        )
        assert r.status_code == 200
        assert r.json()["desc_extended"].startswith("Taped stretch")

        item = next(i for i in client.get("/inventory").json() if i["sku"] == "DESC1")
        assert item["desc_web"].startswith("<b>Cargo")
        assert item["desc_care"] == "Warm machine wash. Do not tumble dry."

    def test_blank_clears_a_description(self, client, make_inventory):
        make_inventory(sku="DESC2", stock=10)
        client.patch("/inventory/DESC2", json={"desc_care": "Hand wash only"})
        client.patch("/inventory/DESC2", json={"desc_care": ""})
        item = next(i for i in client.get("/inventory").json() if i["sku"] == "DESC2")
        assert item["desc_care"] == ""

    def test_other_fields_untouched_by_description_patch(self, client, make_inventory):
        make_inventory(sku="DESC3", stock=10, unit_cost=6.20)
        client.patch("/inventory/DESC3", json={"desc_extended": "note"})
        item = next(i for i in client.get("/inventory").json() if i["sku"] == "DESC3")
        assert float(item["unit_cost"]) == 6.20

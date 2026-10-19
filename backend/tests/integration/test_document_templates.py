"""The designed layout of each printed document.

These are company stationery, not a per-user preference: whoever prints a
delivery note prints the same one. That drives the two properties worth
asserting — reading is open to anyone who prints, writing is admin only, and an
absent row means the built-in default is still in use rather than meaning a
blank page.
"""

import json

import pytest

from app.models.document_template import DocumentTemplate

SPEC = {
    "docType": "deliveryNote",
    "name": "Delivery Note",
    "paper": "A4",
    "bands": {
        "header": [{"id": "a", "type": "docTitle", "text": "DELIVERY NOTE"}],
        "lines": [{"id": "b", "type": "lineTable", "columns": ["stockCode", "order"]}],
        "footer": [{"id": "c", "type": "signature", "lines": ["Received by"]}],
    },
}


@pytest.mark.integration
class TestReadingTemplates:
    def test_nothing_saved_yet_returns_an_empty_map(self, client):
        """Not an error and not a blank template: the client falls back to its
        built-in default, which is what an empty map means."""
        r = client.get("/document-templates")
        assert r.status_code == 200
        assert r.json() == {}

    def test_a_saved_template_comes_back_keyed_by_document_type(self, client, db):
        db.add(
            DocumentTemplate(
                doc_type="deliveryNote", name="Delivery Note", spec=json.dumps(SPEC)
            )
        )
        db.commit()

        body = client.get("/document-templates").json()
        assert set(body) == {"deliveryNote"}
        assert body["deliveryNote"]["bands"]["header"][0]["text"] == "DELIVERY NOTE"

    def test_staff_can_read_them(self, staff_client, db):
        """Reading is not an admin action. Everyone who prints a document needs
        the layout it prints with."""
        db.add(
            DocumentTemplate(
                doc_type="pickingList", name="Picking List", spec=json.dumps(SPEC)
            )
        )
        db.commit()
        assert staff_client.get("/document-templates").status_code == 200


@pytest.mark.integration
class TestWritingTemplates:
    def test_an_admin_can_save_a_layout(self, client, db):
        r = client.put(
            "/document-templates/deliveryNote",
            json={"name": "Delivery Note", "spec": SPEC},
        )
        assert r.status_code == 200

        row = db.query(DocumentTemplate).filter_by(doc_type="deliveryNote").one()
        assert json.loads(row.spec)["bands"]["header"][0]["type"] == "docTitle"

    def test_saving_twice_replaces_rather_than_duplicates(self, client, db):
        """One row per document type. A second row would make which layout
        prints a matter of query order."""
        client.put(
            "/document-templates/jobSheet", json={"name": "Job Sheet", "spec": SPEC}
        )
        second = {**SPEC, "paper": "A5"}
        client.put(
            "/document-templates/jobSheet", json={"name": "Job Sheet", "spec": second}
        )

        rows = db.query(DocumentTemplate).filter_by(doc_type="jobSheet").all()
        assert len(rows) == 1
        assert json.loads(rows[0].spec)["paper"] == "A5"

    def test_staff_cannot_change_the_stationery(self, staff_client):
        """The layout is what goes to a customer on company letterhead."""
        r = staff_client.put(
            "/document-templates/deliveryNote",
            json={"name": "Delivery Note", "spec": SPEC},
        )
        assert r.status_code == 403

    def test_an_unknown_document_type_is_refused(self, client, db):
        """Otherwise a typo silently creates a sixth document that nothing
        prints, and it looks saved."""
        r = client.put(
            "/document-templates/deliverynote",  # wrong case
            json={"name": "x", "spec": SPEC},
        )
        assert r.status_code == 400
        assert db.query(DocumentTemplate).count() == 0

    def test_a_template_with_no_bands_is_refused(self, client):
        """It renders a blank page. Cheaper to catch here than at the printer."""
        empty = {**SPEC, "bands": {"header": [], "lines": [], "footer": []}}
        r = client.put(
            "/document-templates/jobSheet", json={"name": "Job Sheet", "spec": empty}
        )
        assert r.status_code == 422

    def test_resetting_drops_the_row_so_the_default_returns(self, client, db):
        client.put(
            "/document-templates/shipLabel", json={"name": "Ship Label", "spec": SPEC}
        )
        assert db.query(DocumentTemplate).count() == 1

        assert client.delete("/document-templates/shipLabel").status_code == 200
        assert db.query(DocumentTemplate).count() == 0
        assert client.get("/document-templates").json() == {}

    def test_staff_cannot_reset_one_either(self, staff_client):
        assert staff_client.delete("/document-templates/shipLabel").status_code == 403

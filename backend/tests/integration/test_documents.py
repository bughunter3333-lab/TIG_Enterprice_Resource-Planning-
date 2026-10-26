"""Documents the server prints: the despatch paperwork, the proforma, and what
a priced document leaves off.

F21: the delivery note, ship label, job label and proforma existed only as
browser templates, so nothing but the browser could print them, and nothing
printed across a list of jobs. F34: the invoice printed hidden lines.
"""

import re

import pytest

from app.models.customer import Customer
from app.models.job import Job, JobItem
from app.routers.pdf import printable_lines


def _job(db, job_id, status="FINISH", **fields):
    if not db.get(Customer, "DOC-C"):
        db.add(Customer(id="DOC-C", name="Docs Co", credit_limit=99999.0))
    db.add(
        Job(
            id=job_id,
            customer_id="DOC-C",
            customer_name="Docs Co",
            status=status,
            total_ex=100,
            tax=10,
            total_inc=110,
            items=[
                JobItem(
                    sort=0,
                    stock_code="POLO-M",
                    description="Polo",
                    order_qty=2,
                    supply_qty=2,
                    price_ex=50,
                    total=100,
                ),
                JobItem(
                    sort=1,
                    stock_code="PI.POLO",
                    description="Bought garment",
                    order_qty=2,
                    hide=True,
                ),
            ],
            **fields,
        )
    )
    db.commit()


def _pages(pdf: bytes) -> int:
    return len(re.findall(rb"/Type /Page(?!s)", pdf))


@pytest.mark.integration
class TestDespatchPaperwork:
    @pytest.mark.parametrize(
        "kind", ["delivery-note", "ship-label", "job-label", "proforma"]
    )
    def test_each_is_printed_by_the_server(self, client, db, kind):
        _job(db, "DOC-1")
        r = client.get("/jobs/DOC-1/pdf", params={"type": kind})
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF")

    def test_delivery_notes_print_across_a_list(self, client, db):
        for job_id in ("DOC-2", "DOC-3", "DOC-4"):
            _job(db, job_id)
        r = client.get(
            "/job-documents",
            params={"type": "delivery-note", "job_id": ["DOC-2", "DOC-3", "DOC-4"]},
        )
        assert r.status_code == 200, r.text
        assert _pages(r.content) == 3

    def test_a_ship_label_per_carton(self, client, db):
        _job(db, "DOC-5", status="Desp/Ready")
        client.post(
            "/jobs/DOC-5/dispatch",
            json={"ship_via": "StarTrack", "ship_ref": "CN1", "cartons": 3},
        )
        r = client.get("/jobs/DOC-5/pdf", params={"type": "ship-label"})
        assert _pages(r.content) == 3

    def test_a_job_that_is_not_there_is_named(self, client, db):
        _job(db, "DOC-6")
        r = client.get(
            "/job-documents", params={"type": "job-label", "job_id": ["DOC-6", "NOPE"]}
        )
        assert r.status_code == 404
        assert "NOPE" in r.json()["detail"]

    def test_overseas_staff_print_the_paperwork_but_not_a_proforma(self, db, client_as):
        _job(db, "DOC-7")
        overseas = client_as("overseas_staff")
        assert (
            overseas.get(
                "/jobs/DOC-7/pdf", params={"type": "delivery-note"}
            ).status_code
            == 200
        )
        assert (
            overseas.get("/jobs/DOC-7/pdf", params={"type": "proforma"}).status_code
            == 403
        )


@pytest.mark.integration
class TestHiddenLinesAreNotPrinted:
    def test_the_invoice_leaves_hidden_lines_off(self, db):
        _job(db, "DOC-8")
        printed = [i.stock_code for i in printable_lines(db.get(Job, "DOC-8"))]
        assert printed == ["POLO-M"]

    def test_the_invoice_email_leaves_them_off_too(self, db):
        from app.models.settings import CompanySettings
        from app.routers.email_router import _build_email_body

        _job(db, "DOC-10")
        html = _build_email_body(
            db.get(Job, "DOC-10"), db.query(CompanySettings).one(), "invoice"
        )
        assert "Polo" in html and "Bought garment" not in html

    def test_a_line_description_cannot_write_into_the_email(self, db):
        from app.models.settings import CompanySettings
        from app.routers.email_router import _build_email_body

        _job(db, "DOC-11")
        db.get(Job, "DOC-11").items[0].description = "<a href='x'>Polo</a>"
        html = _build_email_body(
            db.get(Job, "DOC-11"), db.query(CompanySettings).one(), "invoice"
        )
        assert "<a href='x'>" not in html

    def test_the_delivery_note_leaves_them_off_too(self, db):
        from app.core.despatch_documents import goods_lines

        _job(db, "DOC-9")
        assert [i.stock_code for i in goods_lines(db.get(Job, "DOC-9"))] == ["POLO-M"]

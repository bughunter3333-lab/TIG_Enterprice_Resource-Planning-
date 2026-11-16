"""Text from the database is printed as text, never read as ReportLab markup.

ReportLab's Paragraph reads its text as mini-HTML. A customer called
"A & B <Pty>", a line described with "<b>", or an unclosed "<i>" in a note
either broke the PDF (a 500) or formatted it. Every document now escapes the
data it is given and keeps only its own markup.
"""

import pytest

from app.core.pdf_text import para
from app.models.customer import Customer
from app.models.job import Job, JobItem
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.supplier import Supplier

NASTY = "A & B <Pty> <b>bold</b> <i>open"


def _job(db, job_id, status="INVOICE"):
    if not db.get(Customer, "MK-C"):
        db.add(
            Customer(
                id="MK-C",
                name=NASTY,
                address=NASTY,
                abn="51824753556",
                credit_limit=99999.0,
            )
        )
    db.add(
        Job(
            id=job_id,
            customer_id="MK-C",
            customer_name=NASTY,
            status=status,
            invoice="INV-MK" if status == "INVOICE" else None,
            cust_ref=NASTY,
            description=NASTY,
            notes=NASTY,
            name_contact=NASTY,
            ship_to=NASTY,
            shipping_address=NASTY,
            assigned_to=NASTY,
            total_ex=100,
            tax=10,
            total_inc=110,
            balance_due=110,
            items=[
                JobItem(
                    sort=0,
                    stock_code="POLO<M>",
                    description=NASTY,
                    sizes=NASTY,
                    order_qty=2,
                    supply_qty=2,
                    price_ex=50,
                    total=100,
                )
            ],
        )
    )
    db.commit()


@pytest.mark.integration
class TestDatabaseTextIsNotMarkup:
    @pytest.mark.parametrize(
        "kind",
        [
            "invoice",
            "quote",
            "proforma",
            "picking-slip",
            "job-sheet",
            "delivery-note",
            "ship-label",
            "job-label",
        ],
    )
    def test_every_job_document_prints(self, client, db, kind):
        _job(db, f"MK-{kind}")
        r = client.get(f"/jobs/MK-{kind}/pdf", params={"type": kind})
        assert r.status_code == 200, r.text
        assert r.content.startswith(b"%PDF")

    @pytest.mark.parametrize("kind", ["delivery-note", "ship-label", "job-label"])
    def test_a_list_of_jobs_prints(self, client, db, kind):
        _job(db, f"MKL-{kind}")
        r = client.get(
            "/job-documents", params={"type": kind, "job_id": [f"MKL-{kind}"]}
        )
        assert r.status_code == 200, r.text

    def test_the_customer_statement_prints(self, client, db):
        _job(db, "MK-ST")
        r = client.get("/customers/MK-C/statement.pdf")
        assert r.status_code == 200, r.text

    def test_the_purchase_order_prints(self, client, db):
        db.add(Supplier(id="MK-S", name=NASTY, address=NASTY))
        db.add(
            PurchaseOrder(
                id="PO-MK",
                supplier_id="MK-S",
                supplier_name=NASTY,
                status="Draft",
                notes=NASTY,
                items=[
                    PurchaseOrderItem(
                        sku="POLO<M>", description=NASTY, qty_ordered=3, unit_cost=5
                    )
                ],
            )
        )
        db.commit()
        r = client.get("/purchase-orders/PO-MK/pdf")
        assert r.status_code == 200, r.text


@pytest.mark.unit
class TestParaEscapes:
    def test_markup_characters_become_entities(self):
        assert para("A & B <Pty>") == "A &amp; B &lt;Pty&gt;"

    def test_nothing_is_none(self):
        assert para(None) == ""

    def test_line_breaks_stay_line_breaks(self):
        assert para("1 Main St\nSydney <NSW>") == "1 Main St<br/>Sydney &lt;NSW&gt;"

    def test_numbers_are_text(self):
        assert para(12) == "12"

"""A purchase order the supplier can be sent (finding F17).

There was no PO document and no way to email one: "Sent" was a status
somebody set, and the order itself went out of the system, if it went at all.
"""

import pytest

from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.settings import CompanySettings, EmailLog
from app.models.supplier import Supplier
from app.routers import email_router


class _Server:
    """Stands in for smtplib.SMTP; keeps what was sent, or refuses."""

    sent = []
    refuse = None

    def __init__(self, host, port, timeout):
        pass

    def starttls(self):
        pass

    def login(self, user, password):
        if self.refuse:
            raise self.refuse

    def sendmail(self, sender, recipients, message):
        _Server.sent.append((recipients, message))

    def quit(self):
        pass


@pytest.fixture
def po(db):
    db.add(Supplier(id="WWS", name="Western Workwear", email="orders@wws.example"))
    db.add(
        PurchaseOrder(
            id="PO-0001",
            supplier_id="WWS",
            supplier_name="Western Workwear",
            status="Draft",
            order_date="2026-10-20",
            items=[
                PurchaseOrderItem(
                    sku="POLO-XL",
                    description="Polo XL",
                    job_id="110000",
                    qty_ordered=10,
                    unit_cost=15.55,
                    total=155.50,
                )
            ],
            total_ex=155.50,
            tax_total=15.55,
            total_inc=171.05,
        )
    )
    db.commit()


@pytest.fixture
def mail(db, monkeypatch):
    _Server.sent, _Server.refuse = [], None
    monkeypatch.setattr(email_router.smtplib, "SMTP", _Server)
    settings = db.query(CompanySettings).first()
    settings.smtp_host = "smtp.tig-mail.com"
    settings.smtp_port = 587
    settings.smtp_user = "orders@tig-mail.com"
    settings.smtp_use_tls = True
    db.commit()
    return _Server


@pytest.mark.integration
class TestThePurchaseOrderDocument:
    def test_it_is_printed(self, client, po):
        r = client.get("/purchase-orders/PO-0001/pdf")
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF")

    def test_a_purchase_order_that_is_not_there(self, client):
        assert client.get("/purchase-orders/NOPE/pdf").status_code == 404


@pytest.mark.integration
class TestEmailingIt:
    def test_it_goes_to_the_supplier_with_the_order_attached(
        self, client, db, po, mail
    ):
        r = client.post("/purchase-orders/PO-0001/email", json={})
        assert r.status_code == 200, r.text
        ((recipients, message),) = mail.sent
        assert recipients == ["orders@wws.example"]
        assert "application/pdf" in message and "PO-0001.pdf" in message
        logged = db.query(EmailLog).filter(EmailLog.po_id == "PO-0001").one()
        assert (logged.status, logged.email_type) == ("sent", "purchase_order")

    def test_sending_it_marks_a_draft_sent(self, client, db, po, mail):
        client.post("/purchase-orders/PO-0001/email", json={})
        db.expire_all()
        assert db.get(PurchaseOrder, "PO-0001").status == "Sent"

    def test_another_address_can_be_given(self, client, po, mail):
        client.post(
            "/purchase-orders/PO-0001/email",
            json={"to_email": "jo@wws.example", "cc": "accounts@tig.example"},
        )
        ((recipients, _),) = mail.sent
        assert recipients == ["jo@wws.example", "accounts@tig.example"]

    def test_a_supplier_with_no_email_needs_one_given(self, client, db, po, mail):
        db.get(Supplier, "WWS").email = None
        db.commit()
        r = client.post("/purchase-orders/PO-0001/email", json={})
        assert r.status_code == 422
        assert mail.sent == []

    def test_a_refused_send_leaves_it_a_draft(self, client, db, po, mail):
        import smtplib

        mail.refuse = smtplib.SMTPAuthenticationError(535, b"no")
        r = client.post("/purchase-orders/PO-0001/email", json={})
        assert r.status_code == 502
        db.expire_all()
        assert db.get(PurchaseOrder, "PO-0001").status == "Draft"

    def test_without_a_mail_server_it_says_so(self, client, po):
        r = client.post("/purchase-orders/PO-0001/email", json={})
        assert r.status_code == 400

    def test_overseas_staff_read_it_but_do_not_send_it(self, client_as, po):
        overseas = client_as("overseas_staff")
        assert overseas.get("/purchase-orders/PO-0001/pdf").status_code == 200
        assert (
            overseas.post("/purchase-orders/PO-0001/email", json={}).status_code == 403
        )

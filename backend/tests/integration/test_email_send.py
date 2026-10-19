"""Sending an invoice or quote email.

The send used to run after the answer had gone ("Email queued"), in a
background task. On Vercel a function can be frozen the moment it has
answered, so a send could be lost with nothing to show for it — not even its
row in the email log, which the same task wrote. The send now happens before
the answer, and the answer says how it went.
"""

import pytest

from app.models.job import Job
from app.models.settings import CompanySettings, EmailLog
from app.routers import email_router


class _Server:
    """Stands in for smtplib.SMTP; records what was sent, or refuses."""

    sent = []
    refuse = None

    def __init__(self, host, port, timeout):
        self.host, self.port = host, port

    def starttls(self):
        pass

    def login(self, user, password):
        if self.refuse:
            raise self.refuse

    def sendmail(self, sender, recipients, message):
        _Server.sent.append((sender, recipients))

    def quit(self):
        pass


@pytest.fixture
def mail(db, monkeypatch):
    _Server.sent, _Server.refuse = [], None
    monkeypatch.setattr(email_router.smtplib, "SMTP", _Server)
    settings = db.query(CompanySettings).first()
    settings.smtp_host = "smtp.tig-mail.com"
    settings.smtp_port = 587
    settings.smtp_user = "accounts@tig-mail.com"
    settings.smtp_use_tls = True
    db.add(Job(id="J-EM1", customer_id="C1", status="INVOICED", branch="HQ"))
    db.commit()
    return _Server


@pytest.mark.integration
class TestSendingAnEmail:
    def test_it_is_sent_before_the_answer_and_the_answer_says_so(
        self, client, db, mail
    ):
        r = client.post(
            "/email/send",
            json={
                "job_id": "J-EM1",
                "to_email": "jo@customer.com.au",
                "email_type": "invoice",
            },
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True, "message": "Email sent to jo@customer.com.au"}
        assert mail.sent == [("accounts@tig-mail.com", ["jo@customer.com.au"])]
        logged = db.query(EmailLog).filter(EmailLog.job_id == "J-EM1").one()
        assert logged.status == "sent" and logged.error is None

    def test_a_refused_send_is_said_at_once_and_logged(self, client, db, mail):
        import smtplib

        mail.refuse = smtplib.SMTPAuthenticationError(
            535, b"Username and Password not accepted"
        )
        r = client.post(
            "/email/send",
            json={
                "job_id": "J-EM1",
                "to_email": "jo@customer.com.au",
                "email_type": "invoice",
            },
        )
        assert r.status_code == 502
        assert r.json()["detail"].startswith("The email could not be sent:")
        assert mail.sent == []
        logged = db.query(EmailLog).filter(EmailLog.job_id == "J-EM1").one()
        assert logged.status == "failed" and "535" in logged.error

"""Security properties that were not holding.

Three findings from an audit of the public repository, each confirmed against
the code before being fixed:

1. An admin password reset did not revoke the account's existing tokens, so the
   one action an admin takes during an incident left the ex-holder logged in —
   and it silently removed their second factor as a side effect, leaving the
   account weaker than before the reset ran.
2. The rate-limit key came from the leftmost X-Forwarded-For entry, which is
   the one value in that header the client writes itself. Varying it gave a
   fresh bucket per request, so the login limit was decorative.
3. The bank details printed on every invoice were writable by any staff user.
"""

import pytest
from app.core.limiter import get_real_client_ip
from app.models.settings import CompanySettings
from app.models.user import User


class _Request:
    """Minimal stand-in — get_real_client_ip only reads headers and client."""

    def __init__(self, xff=None, peer="10.0.0.1"):
        self.headers = {"X-Forwarded-For": xff} if xff else {}
        self.client = type("C", (), {"host": peer})()


@pytest.mark.unit
class TestRateLimitKeyIsNotClientControlled:
    def test_a_spoofed_leading_entry_does_not_change_the_key(self):
        """The attack: vary the leftmost entry per request, get a fresh bucket
        each time, and the login limit stops existing."""
        first = get_real_client_ip(_Request("1.2.3.4, 203.0.113.9"))
        second = get_real_client_ip(_Request("9.9.9.9, 203.0.113.9"))
        assert first == second == "203.0.113.9"

    def test_a_single_entry_is_used_as_is(self):
        assert get_real_client_ip(_Request("203.0.113.9")) == "203.0.113.9"

    def test_without_the_header_it_falls_back_to_the_peer(self):
        assert get_real_client_ip(_Request(None, peer="198.51.100.7")) == "198.51.100.7"

    def test_a_malformed_header_does_not_crash_the_limiter(self):
        """A rate limiter that raises on a hostile header is a denial of service
        in the thing meant to prevent one."""
        assert get_real_client_ip(_Request(" , , ")) == "10.0.0.1"
        assert get_real_client_ip(_Request("")) == "10.0.0.1"


@pytest.mark.integration
class TestAdminResetRevokesAccess:
    def _staff(self, db, username="victim"):
        from app.core.security import hash_password

        user = User(
            username=username,
            email=f"{username}@example.com",
            full_name="Victim",
            hashed_password=hash_password("original-pw"),
            role="staff",
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    def test_a_reset_invalidates_tokens_already_issued(self, client, db):
        """token_version is the mechanism that already existed; the admin path
        simply never used it, while the self-service path always did."""
        user = self._staff(db)
        before = user.token_version or 0

        r = client.post(
            f"/users/{user.id}/reset-password", json={"new_password": "N3w-passw0rd!"}
        )
        assert r.status_code == 200

        db.expire_all()
        after = db.query(User).filter_by(id=user.id).one().token_version
        assert after == before + 1, (
            "every token issued before the reset must stop working — otherwise "
            "resetting a departing employee's password leaves them logged in"
        )

    def test_a_reset_leaves_the_second_factor_alone_by_default(self, client, db):
        """Resetting a password should not be a way to strip 2FA."""
        user = self._staff(db, username="has2fa")
        user.totp_enabled, user.totp_secret = True, "SEEDSEEDSEEDSEED"
        db.commit()

        client.post(
            f"/users/{user.id}/reset-password", json={"new_password": "N3w-passw0rd!"}
        )

        db.expire_all()
        fresh = db.query(User).filter_by(id=user.id).one()
        assert fresh.totp_enabled is True
        assert fresh.totp_secret is not None

    def test_clearing_the_second_factor_has_to_be_asked_for(self, client, db):
        """A lost authenticator is a real case — it just has to be explicit."""
        user = self._staff(db, username="lostphone")
        user.totp_enabled, user.totp_secret = True, "SEEDSEEDSEEDSEED"
        db.commit()

        client.post(
            f"/users/{user.id}/reset-password",
            json={"new_password": "N3w-passw0rd!", "clear_2fa": True},
        )

        db.expire_all()
        fresh = db.query(User).filter_by(id=user.id).one()
        assert fresh.totp_enabled is False and fresh.totp_secret is None


@pytest.mark.integration
class TestBankDetailsAreAdminOnly:
    """The BSB and account number here are printed on every invoice PDF and
    payment email, so writing them decides where customers send money."""

    def _settings(self, db, account="111111"):
        """Upsert — the settings row is a singleton the app creates on demand."""
        row = db.query(CompanySettings).first()
        if row is None:
            row = CompanySettings(id=1, company_name="TIG")
            db.add(row)
        row.bank_account = account
        db.commit()
        return row

    def test_staff_cannot_change_the_company_settings(self, db, staff_client):
        self._settings(db)

        r = staff_client.put(
            "/settings/company", json={"company_name": "TIG", "bank_account": "999999"}
        )
        assert r.status_code == 403

        db.expire_all()
        assert db.query(CompanySettings).one().bank_account == "111111"

    def test_an_admin_still_can(self, client, db):
        self._settings(db)

        r = client.put(
            "/settings/company", json={"company_name": "TIG", "bank_account": "222222"}
        )
        assert r.status_code == 200

        db.expire_all()
        assert db.query(CompanySettings).one().bank_account == "222222"

    def test_staff_can_still_read_them(self, staff_client):
        """Read is fine — the invoice template needs them."""
        assert staff_client.get("/settings/company").status_code == 200

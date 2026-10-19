"""The per-account lockout.

The IP rate limit on /auth/login is keyed on the address a request arrives
from, so guesses spread across addresses each get a fresh allowance. The account
has to count its own failures. What matters, and is asserted here:

- five wrong passwords lock the account, and while it is locked even the right
  password is refused — otherwise the lock only slows an attacker who has
  already guessed correctly;
- a right password before the limit clears the count, so a person who fumbles
  twice is not one mistake from being locked out all day;
- an admin password reset lets a locked-out person straight back in;
- an unknown username is never "locked", because there is nothing to lock.

The limiter is reset around each test: it keeps its buckets in memory for the
life of the process, and its own 429 must not be mistaken for the lockout's.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.core.limiter import limiter
from app.models.user import User
from app.routers.auth import MAX_FAILED_LOGINS

LOCKED = "Too many failed sign-in attempts"


@pytest.fixture(autouse=True)
def _fresh_rate_limit():
    limiter.reset()
    yield
    limiter.reset()


def _login(client, password, username="testadmin"):
    return client.post("/auth/login", json={"username": username, "password": password})


def _fail(client, times, username="testadmin"):
    for _ in range(times):
        assert _login(client, "wrong-password", username).status_code == 401


@pytest.mark.integration
class TestLockout:
    def test_the_account_locks_after_the_limit(self, client, admin_user):
        _fail(client, MAX_FAILED_LOGINS)
        r = _login(client, "wrong-password")
        assert r.status_code == 429
        assert LOCKED in r.json()["detail"]

    def test_the_right_password_is_refused_while_locked(self, client, admin_user):
        _fail(client, MAX_FAILED_LOGINS)
        r = _login(client, "password123")
        assert r.status_code == 429
        assert LOCKED in r.json()["detail"]

    def test_a_correct_password_before_the_limit_clears_the_count(
        self, client, admin_user, db
    ):
        _fail(client, MAX_FAILED_LOGINS - 1)
        assert _login(client, "password123").status_code == 200
        db.refresh(admin_user)
        assert admin_user.failed_login_count == 0
        # ...so the next mistake starts from one, not from the limit.
        _fail(client, MAX_FAILED_LOGINS - 1)
        assert _login(client, "password123").status_code == 200

    def test_the_lock_expires(self, client, admin_user, db):
        _fail(client, MAX_FAILED_LOGINS)
        admin_user.locked_until = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
        assert _login(client, "password123").status_code == 200

    def test_an_admin_reset_lets_a_locked_account_back_in(self, client, admin_user, db):
        victim = User(
            username="locked_out",
            email="locked@lockcheck.com",
            full_name="Locked Out",
            hashed_password=admin_user.hashed_password,
            role="staff",
            is_active=True,
        )
        db.add(victim)
        db.commit()
        _fail(client, MAX_FAILED_LOGINS, username="locked_out")
        assert _login(client, "password123", "locked_out").status_code == 429

        r = client.post(
            f"/users/{victim.id}/reset-password",
            json={"new_password": "Fresh1234"},
        )
        assert r.status_code == 200
        assert _login(client, "Fresh1234", "locked_out").status_code == 200

    def test_an_unknown_username_is_never_locked(self, client):
        _fail(client, MAX_FAILED_LOGINS + 2, username="nobody_here")
        assert _login(client, "anything", "nobody_here").status_code == 401

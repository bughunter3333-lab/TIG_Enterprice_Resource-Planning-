"""User accounts and roles, as an admin manages them.

The role on an account is the whole of what it may do, so the few rules here
carry everything: only an admin changes accounts; a role is one of the four
that exist; an account is what it says it is (no look-alike usernames, no blank
names, no password whose end does not count); and an admin cannot take away
their own access.
"""

import pytest
from starlette.testclient import TestClient

from app.core.dependencies import ROLES, get_current_user, get_signed_in_user
from app.core.security import hash_password, verify_password
from app.database import get_db
from app.main import app
from app.models.dispatch_session import DispatchSession
from app.models.saved_list import SavedList
from app.models.user import User

NEW = {
    "username": "j.smith",
    "email": "j.smith@tig-mail.com",
    "full_name": "Jo Smith",
    "password": "Welcome2TIG",
    "role": "staff",
}


def _secret_looking(key):
    """A field that could carry a password or a second-factor secret. Whether
    the password is still one an admin chose says nothing about what it is."""
    if key == "must_change_password":
        return False
    return "password" in key or "secret" in key


def _account(db, username="other", role="staff", **fields):
    user = User(
        username=username,
        email=fields.pop("email", f"{username}@tig-mail.com"),
        full_name=fields.pop("full_name", username.title()),
        hashed_password=hash_password("Original1pw"),
        role=role,
        is_active=True,
        **fields,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _signed_in_as(db, role):
    """A client whose account holds `role`."""
    user = _account(db, username=f"the_{role}", role=role)

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_signed_in_user] = lambda: user
    return TestClient(app, raise_server_exceptions=True)


@pytest.mark.integration
class TestWhoMayManageAccounts:
    @pytest.mark.parametrize("role", [r for r in ROLES if r != "admin"])
    def test_nobody_but_an_admin(self, db, role):
        target = _account(db)
        try:
            with _signed_in_as(db, role) as c:
                assert c.get("/users").status_code == 403
                assert c.get("/users/access").status_code == 403
                assert c.post("/users", json=NEW).status_code == 403
                assert (
                    c.patch(f"/users/{target.id}", json={"role": "admin"}).status_code
                    == 403
                )
                assert (
                    c.post(
                        f"/users/{target.id}/reset-password",
                        json={"new_password": "Another1pw"},
                    ).status_code
                    == 403
                )
                assert c.delete(f"/users/{target.id}").status_code == 403
                # Their own details are theirs to read.
                assert c.get("/users/me").json()["role"] == role
        finally:
            app.dependency_overrides.clear()
        db.refresh(target)
        assert target.role == "staff"
        assert verify_password("Original1pw", target.hashed_password)

    def test_not_without_signing_in(self, unauth_client):
        assert unauth_client.get("/users").status_code == 401
        assert unauth_client.get("/users/me").status_code == 401
        assert unauth_client.get("/users/access").status_code == 401
        assert unauth_client.post("/users", json=NEW).status_code == 401
        assert (
            unauth_client.patch("/users/1", json={"role": "admin"}).status_code == 401
        )
        assert unauth_client.delete("/users/1").status_code == 401

    @pytest.mark.parametrize(
        "path", ["/auth/setup-2fa", "/auth/confirm-2fa", "/auth/change-password"]
    )
    def test_the_routes_that_check_the_cookie_themselves_do_check_it(
        self, unauth_client, path
    ):
        body = {"code": "000000", "current_password": "x", "new_password": "Another1pw"}
        assert unauth_client.post(path, json=body).status_code == 401


@pytest.mark.integration
class TestAddingAnAccount:
    def test_the_account_comes_back_without_anything_secret(self, client, db):
        r = client.post("/users", json=NEW)
        assert r.status_code == 200, r.text
        made = r.json()
        assert {k: made[k] for k in ("username", "email", "full_name", "role")} == {
            k: NEW[k] for k in ("username", "email", "full_name", "role")
        }
        assert made["is_active"] is True and made["totp_enabled"] is False
        assert not [key for key in made if _secret_looking(key)]
        on_file = db.query(User).filter(User.username == "j.smith").one()
        assert verify_password("Welcome2TIG", on_file.hashed_password)

    @pytest.mark.parametrize("role", ROLES)
    def test_any_of_the_roles_can_be_given(self, client, role):
        assert client.post("/users", json={**NEW, "role": role}).json()["role"] == role

    def test_a_role_that_does_not_exist_is_refused_naming_the_ones_that_do(
        self, client, db
    ):
        r = client.post("/users", json={**NEW, "role": "Admin"})
        assert r.status_code == 400
        assert r.json()["detail"] == (
            "Unknown role 'Admin'. The roles are: admin, manager, staff, overseas_staff"
        )
        assert db.query(User).filter(User.username == "j.smith").first() is None

    @pytest.mark.parametrize(
        "username", ["ab", "has space", ".dot", "-dash", "jo@smith", "x" * 51, "  ", ""]
    )
    def test_a_username_is_something_that_can_be_typed_to_sign_in(
        self, client, db, username
    ):
        assert (
            client.post("/users", json={**NEW, "username": username}).status_code == 422
        )
        assert db.query(User).filter(User.email == NEW["email"]).first() is None

    def test_a_username_is_stored_without_the_spaces_round_it(self, client):
        r = client.post("/users", json={**NEW, "username": "  j.smith "})
        assert r.json()["username"] == "j.smith"

    def test_two_usernames_that_differ_only_in_case_are_one_username(self, client):
        assert client.post("/users", json=NEW).status_code == 200
        r = client.post(
            "/users", json={**NEW, "username": "J.Smith", "email": "other@tig-mail.com"}
        )
        assert r.status_code == 409
        assert r.json()["detail"] == "Username already exists"

    def test_an_email_already_on_an_account_is_refused_whatever_its_case(self, client):
        assert client.post("/users", json=NEW).status_code == 200
        r = client.post(
            "/users",
            json={**NEW, "username": "jo2", "email": "J.Smith@TIG-Mail.com"},
        )
        assert r.status_code == 409
        assert r.json()["detail"] == "Email already in use"

    @pytest.mark.parametrize(
        "password, why",
        [
            ("Short1A", "at least 8 characters"),
            ("alllowercase1", "uppercase letter"),
            ("NoDigitsHere", "one digit"),
            ("A1" + "x" * 71, "at most 72 bytes"),
            ("A1" + "é" * 36, "at most 72 bytes"),
        ],
    )
    def test_a_password_has_to_be_one_that_counts(self, client, password, why):
        r = client.post("/users", json={**NEW, "password": password})
        assert r.status_code == 422
        assert why in r.text

    def test_the_longest_password_that_wholly_counts_is_accepted(self, client):
        assert (
            client.post("/users", json={**NEW, "password": "A1" + "x" * 70}).status_code
            == 200
        )

    def test_a_name_cannot_be_blank_and_is_stored_tidied(self, client):
        assert (
            client.post("/users", json={**NEW, "full_name": "   "}).status_code == 422
        )
        assert (
            client.post("/users", json={**NEW, "full_name": "N" * 101}).status_code
            == 422
        )
        r = client.post("/users", json={**NEW, "full_name": "  Jo   Smith "})
        assert r.json()["full_name"] == "Jo Smith"

    def test_an_address_that_is_not_an_email_is_refused(self, client):
        assert (
            client.post("/users", json={**NEW, "email": "jo at work"}).status_code
            == 422
        )


@pytest.mark.integration
class TestChangingAnAccount:
    def test_a_role_is_changed_and_an_account_switched_off_and_on(self, client, db):
        user = _account(db)
        assert client.patch(f"/users/{user.id}", json={"role": "manager"}).json()[
            "role"
        ] == ("manager")
        assert (
            client.patch(f"/users/{user.id}", json={"is_active": False}).json()[
                "is_active"
            ]
            is False
        )
        db.refresh(user)
        assert (user.role, user.is_active) == ("manager", False)
        assert client.patch(f"/users/{user.id}", json={"is_active": True}).json()[
            "is_active"
        ]

    def test_a_role_that_does_not_exist_is_refused(self, client, db):
        user = _account(db)
        assert (
            client.patch(f"/users/{user.id}", json={"role": "boss"}).status_code == 400
        )
        db.refresh(user)
        assert user.role == "staff"

    def test_an_admin_cannot_change_their_own_role(self, client, db, admin_user):
        r = client.patch(f"/users/{admin_user.id}", json={"role": "staff"})
        assert r.status_code == 400
        assert r.json()["detail"] == (
            "You cannot change your own role. Another admin has to."
        )
        db.refresh(admin_user)
        assert admin_user.role == "admin"

    def test_nor_switch_their_own_account_off(self, client, db, admin_user):
        r = client.patch(f"/users/{admin_user.id}", json={"is_active": False})
        assert r.status_code == 400
        assert "deactivate your own account" in r.json()["detail"]
        db.refresh(admin_user)
        assert admin_user.is_active is True

    def test_but_their_own_name_and_email_are_theirs_to_correct(
        self, client, db, admin_user
    ):
        r = client.patch(
            f"/users/{admin_user.id}",
            json={"full_name": "The Admin", "role": "admin", "is_active": True},
        )
        assert r.status_code == 200
        assert r.json()["full_name"] == "The Admin"

    def test_another_admin_can_be_made_staff(self, client, db):
        other = _account(db, username="second_admin", role="admin")
        assert (
            client.patch(f"/users/{other.id}", json={"role": "staff"}).status_code
            == 200
        )

    def test_an_email_on_another_account_is_refused(self, client, db):
        _account(db, username="first", email="taken@tig-mail.com")
        second = _account(db, username="second")
        r = client.patch(f"/users/{second.id}", json={"email": "Taken@TIG-Mail.com"})
        assert r.status_code == 409
        # Their own address, written differently, is not a clash with themselves.
        own = client.patch(f"/users/{second.id}", json={"email": "Second@tig-mail.com"})
        assert own.status_code == 200

    def test_a_blank_name_is_refused(self, client, db):
        user = _account(db)
        assert (
            client.patch(f"/users/{user.id}", json={"full_name": "  "}).status_code
            == 422
        )

    def test_an_account_that_is_not_there(self, client):
        assert client.patch("/users/99999", json={"role": "staff"}).status_code == 404


@pytest.mark.integration
class TestDeletingAnAccount:
    def test_an_account_with_nothing_recorded_against_it_is_deleted(self, client, db):
        user = _account(db)
        assert client.delete(f"/users/{user.id}").status_code == 200
        assert db.query(User).filter(User.id == user.id).first() is None

    def test_not_your_own(self, client, db, admin_user):
        assert client.delete(f"/users/{admin_user.id}").status_code == 400
        assert db.query(User).filter(User.id == admin_user.id).first() is not None

    def test_their_saved_lists_go_with_them(self, client, db):
        user = _account(db)
        db.add(SavedList(id="JL-1", user_id=user.id, node="jobs", name="Mine"))
        db.commit()
        assert client.delete(f"/users/{user.id}").status_code == 200
        assert db.query(SavedList).count() == 0

    def test_one_with_despatches_on_record_is_kept_and_the_admin_told_why(
        self, client, db
    ):
        user = _account(db, username="packer")
        session = DispatchSession(user_id=user.id)
        for field, value in (("created_by", "packer"), ("status", "open")):
            if hasattr(DispatchSession, field):
                setattr(session, field, value)
        db.add(session)
        db.commit()
        r = client.delete(f"/users/{user.id}")
        assert r.status_code == 409
        assert r.json()["detail"] == (
            "packer has recorded despatches, which stay on file under their name. "
            "Deactivate the account instead."
        )
        assert db.query(User).filter(User.id == user.id).first() is not None


@pytest.mark.integration
class TestListingAccounts:
    def test_everyone_is_listed_by_username_with_nothing_secret(self, client, db):
        _account(db, username="zed")
        _account(db, username="Amy", totp_secret="JBSWY3DPEHPK3PXP", totp_enabled=True)
        rows = client.get("/users").json()
        names = [r["username"] for r in rows]
        assert names == sorted(names, key=str.lower)
        assert {"zed", "Amy"} <= set(names)
        for row in rows:
            assert not [key for key in row if _secret_looking(key)]
        assert next(r for r in rows if r["username"] == "Amy")["totp_enabled"] is True

    def test_the_access_table_is_the_roles_against_the_areas(self, client):
        table = client.get("/users/access").json()
        assert table["roles"] == list(ROLES)
        areas = {a["area"]: a for a in table["areas"]}
        assert {"Stock", "Jobs and quotes", "Users and roles"} <= set(areas)
        users = areas["Users and roles"]
        assert users["change"]["manager"][0] == 0
        assert users["change"]["admin"][0] == users["change"]["admin"][1] > 0


def _cookies(user):
    """The access and refresh cookies a real sign-in would have given `user`."""
    from app.core.security import create_access_token, create_refresh_token

    version = user.token_version or 0
    return {
        "access_token": create_access_token(
            user.id, user.role, mfa_verified=True, token_version=version
        ),
        "refresh_token": create_refresh_token(user.id, token_version=version),
    }


def _as(client, cookies):
    client.cookies.clear()
    for name, value in cookies.items():
        client.cookies.set(name, value)
    return client


@pytest.mark.integration
class TestSessionsEndWithAccess:
    """Through real cookies, not the test override: what an already signed-in
    browser can still do after an admin has acted."""

    def test_switching_an_account_off_ends_its_sessions_for_good(
        self, unauth_client, db
    ):
        admin = _account(db, username="boss", role="admin")
        person = _account(db, username="person")
        theirs, admins = _cookies(person), _cookies(admin)
        assert _as(unauth_client, theirs).get("/users/me").status_code == 200

        off = _as(unauth_client, admins).patch(
            f"/users/{person.id}", json={"is_active": False}
        )
        assert off.status_code == 200
        assert _as(unauth_client, theirs).get("/users/me").status_code == 401
        assert _as(unauth_client, theirs).post("/auth/refresh").status_code == 401

        # Switched on again, the cookies from before do not come back to life:
        # the person signs in again, with their password and second factor.
        on = _as(unauth_client, admins).patch(
            f"/users/{person.id}", json={"is_active": True}
        )
        assert on.status_code == 200
        assert _as(unauth_client, theirs).get("/users/me").status_code == 401
        assert _as(unauth_client, theirs).post("/auth/refresh").status_code == 401
        db.refresh(person)
        assert _as(unauth_client, _cookies(person)).get("/users/me").status_code == 200

    def test_a_change_of_role_applies_at_once_without_ending_the_session(
        self, unauth_client, db
    ):
        admin = _account(db, username="boss", role="admin")
        person = _account(db, username="person", role="admin")
        theirs = _cookies(person)
        assert _as(unauth_client, theirs).get("/users").status_code == 200
        _as(unauth_client, _cookies(admin)).patch(
            f"/users/{person.id}", json={"role": "staff"}
        )
        assert _as(unauth_client, theirs).get("/users").status_code == 403
        assert _as(unauth_client, theirs).get("/users/me").json()["role"] == "staff"


@pytest.mark.integration
class TestAPasswordSomeoneElseChose:
    """A password an admin typed in is known to two people. Until the person
    has chosen their own, signing in takes them only as far as choosing one."""

    @pytest.fixture(autouse=True)
    def _fresh_limiter(self):
        from app.core.limiter import limiter

        limiter.reset()
        yield
        limiter.reset()

    def test_an_account_an_admin_makes_starts_with_one(self, client, db):
        made = client.post("/users", json=NEW).json()
        assert made["must_change_password"] is True
        listed = {u["username"]: u for u in client.get("/users").json()}
        assert listed[NEW["username"]]["must_change_password"] is True

    def test_and_so_does_one_an_admin_has_reset(self, client, db):
        person = _account(db, username="person")
        assert person.must_change_password is False
        r = client.post(
            f"/users/{person.id}/reset-password", json={"new_password": "Given2them"}
        )
        assert r.status_code == 200
        db.refresh(person)
        assert person.must_change_password is True

    def test_signing_in_says_so(self, unauth_client, db):
        _account(db, username="given", must_change_password=True)
        _account(db, username="chosen")
        for username, expected in (("given", True), ("chosen", False)):
            unauth_client.cookies.clear()
            r = unauth_client.post(
                "/auth/login", json={"username": username, "password": "Original1pw"}
            )
            assert r.status_code == 200, r.text
            assert r.json()["user"]["must_change_password"] is expected

    def test_until_then_the_account_reaches_only_itself(self, unauth_client, db):
        person = _account(db, username="person", must_change_password=True)
        theirs = _as(unauth_client, _cookies(person))
        me = theirs.get("/users/me")
        assert me.status_code == 200
        assert me.json()["must_change_password"] is True
        # A route for one role and a route for anyone signed in alike.
        for path in ("/customers", "/saved-lists"):
            refused = theirs.get(path)
            assert refused.status_code == 403, path
            assert refused.json()["detail"]["code"] == "password_change_required"

    def test_nor_can_it_take_on_a_second_factor(self, unauth_client, db):
        # Whoever else knows the given password must not be able to bind the
        # account to their own authenticator before its owner has replaced it.
        person = _account(db, username="person", must_change_password=True)
        for path, body in (
            ("/auth/setup-2fa", None),
            ("/auth/confirm-2fa", {"code": "000000"}),
        ):
            r = _as(unauth_client, _cookies(person)).post(path, json=body)
            assert r.status_code == 403, path
            assert r.json()["detail"]["code"] == "password_change_required"
        db.refresh(person)
        assert person.totp_secret is None and not person.totp_enabled

    def test_an_admin_resetting_their_own_is_not_asked_again(
        self, client, db, admin_user
    ):
        # A password they set themselves is not known to anybody else.
        r = client.post(
            f"/users/{admin_user.id}/reset-password",
            json={"new_password": "MyOwn2pass"},
        )
        assert r.status_code == 200
        db.refresh(admin_user)
        assert admin_user.must_change_password is False

    def test_choosing_their_own_lets_them_in(self, unauth_client, db):
        person = _account(db, username="person", must_change_password=True)
        theirs = _as(unauth_client, _cookies(person))
        same = theirs.post(
            "/auth/change-password",
            json={"current_password": "Original1pw", "new_password": "Original1pw"},
        )
        assert same.status_code == 400
        assert "different" in same.json()["detail"]
        db.refresh(person)
        assert person.must_change_password is True

        r = _as(unauth_client, _cookies(person)).post(
            "/auth/change-password",
            json={"current_password": "Original1pw", "new_password": "MyOwn2pass"},
        )
        assert r.status_code == 200
        db.refresh(person)
        assert person.must_change_password is False
        again = _as(unauth_client, _cookies(person))
        assert again.get("/customers").status_code == 200
        assert again.get("/users/me").json()["must_change_password"] is False


@pytest.mark.integration
class TestASignInHalfDone:
    """The five-minute cookie between the password and the second factor."""

    @pytest.fixture(autouse=True)
    def _fresh_limiter(self):
        from app.core.limiter import limiter

        limiter.reset()
        yield
        limiter.reset()

    def _two_factor_account(self, db):
        import pyotp

        secret = pyotp.random_base32()
        user = _account(db, username="twofa", totp_secret=secret, totp_enabled=True)
        return user, pyotp.TOTP(secret)

    def _finish(self, client, user, code, version):
        from app.core.security import create_pre_mfa_token

        _as(client, {"pre_mfa_token": create_pre_mfa_token(user.id, version)})
        return client.post("/auth/verify-2fa", json={"code": code})

    def test_it_can_be_finished_while_nothing_has_changed(self, unauth_client, db):
        user, totp = self._two_factor_account(db)
        r = self._finish(unauth_client, user, totp.now(), user.token_version or 0)
        assert r.status_code == 200
        assert r.json()["user"]["username"] == "twofa"
        assert r.json()["user"]["must_change_password"] is False

    def test_not_after_the_password_was_reset(self, unauth_client, db):
        user, totp = self._two_factor_account(db)
        before = user.token_version or 0
        user.token_version = before + 1  # what an admin's reset does
        db.commit()
        assert self._finish(unauth_client, user, totp.now(), before).status_code == 401

    def test_not_on_an_account_that_has_been_switched_off(self, unauth_client, db):
        user, totp = self._two_factor_account(db)
        user.is_active = False
        db.commit()
        r = self._finish(unauth_client, user, totp.now(), user.token_version or 0)
        assert r.status_code == 401
        db.refresh(user)
        assert user.last_login is None


@pytest.mark.integration
class TestThereIsAlwaysAnAdmin:
    def test_two_admins_acting_on_each_other_cannot_both_succeed(self, db):
        """Both requests have passed the admin gate before either is saved, so
        each still holds an admin's account in hand when its handler runs."""
        from fastapi import HTTPException

        from app.routers.users import UserUpdate, delete_user, update_user

        a = _account(db, username="admin_a", role="admin")
        b = _account(db, username="admin_b", role="admin")
        update_user(user_id=b.id, body=UserUpdate(role="staff"), db=db, current_user=a)
        for crossing in (
            lambda: update_user(
                user_id=a.id, body=UserUpdate(is_active=False), db=db, current_user=b
            ),
            lambda: update_user(
                user_id=a.id, body=UserUpdate(role="manager"), db=db, current_user=b
            ),
            lambda: delete_user(user_id=a.id, db=db, current_user=b),
        ):
            with pytest.raises(HTTPException) as refused:
                crossing()
            assert refused.value.status_code == 400
            assert refused.value.detail == (
                "admin_a is the only active admin. Make someone else an admin first."
            )
        db.refresh(a)
        assert (a.role, a.is_active) == ("admin", True)

    def test_an_admin_who_is_not_the_last_can_be_demoted_switched_off_or_deleted(
        self, client, db
    ):
        for change in ({"role": "manager"}, {"is_active": False}):
            other = _account(
                db, username=f"admin_{len(change)}_{list(change)[0]}", role="admin"
            )
            assert client.patch(f"/users/{other.id}", json=change).status_code == 200
        gone = _account(db, username="admin_gone", role="admin")
        assert client.delete(f"/users/{gone.id}").status_code == 200

    def test_an_admin_already_switched_off_does_not_count_as_one(self, db):
        from fastapi import HTTPException

        from app.routers.users import UserUpdate, update_user

        only = _account(db, username="only_admin", role="admin")
        asleep = _account(db, username="asleep_admin", role="admin")
        asleep.is_active = False
        db.commit()
        stale = _account(db, username="was_admin", role="admin")
        stale.role = (
            "staff"  # demoted a moment ago; their request is already past the gate
        )
        db.commit()
        with pytest.raises(HTTPException) as refused:
            update_user(
                user_id=only.id,
                body=UserUpdate(role="staff"),
                db=db,
                current_user=stale,
            )
        assert refused.value.status_code == 400


@pytest.mark.integration
class TestAddressesAndUsernamesWithAccents:
    def test_the_same_address_again_is_a_refusal_not_an_error(self, client):
        first = {**NEW, "email": "Émile@tig-mail.com"}
        assert client.post("/users", json=first).status_code == 200
        again = client.post("/users", json={**first, "username": "second"})
        assert again.status_code == 409
        assert again.json()["detail"] == "Email already in use"

    def test_a_clash_the_checks_missed_is_still_a_refusal(self, client, monkeypatch):
        """Two requests at the same moment both pass the checks; the database
        refuses the second, and that is a 409 like any other clash."""
        from sqlalchemy import false

        from app.routers import users

        assert client.post("/users", json=NEW).status_code == 200
        monkeypatch.setattr(users, "_same_email", lambda address: false())
        r = client.post("/users", json={**NEW, "username": "second"})
        assert r.status_code == 409
        assert r.json()["detail"] == "That username or email was just taken"


@pytest.mark.integration
class TestWhatWasSentIsNotSentBack:
    def test_a_refused_password_is_not_in_the_refusal(self, client):
        r = client.post("/users", json={**NEW, "password": "nodigitshereSECRET"})
        assert r.status_code == 422
        assert "nodigitshereSECRET" not in r.text
        assert r.json()["detail"] == [
            {
                "type": "value_error",
                "loc": ["body", "password"],
                "msg": "Value error, Password must contain at least one digit",
            }
        ]

    def test_nor_is_the_rest_of_the_form_when_one_field_is_missing(
        self, client, unauth_client
    ):
        body = {k: v for k, v in NEW.items() if k != "full_name"}
        r = client.post("/users", json=body)
        assert r.status_code == 422
        assert "Welcome2TIG" not in r.text
        assert r.json()["detail"][0]["loc"] == ["body", "full_name"]
        changed = unauth_client.post(
            "/auth/change-password", json={"current_password": "MyRealCurrent1"}
        )
        assert "MyRealCurrent1" not in changed.text

    def test_a_password_too_long_to_be_one_is_refused_unread_and_unrepeated(
        self, client, db
    ):
        huge = "A1" + "x" * 5000
        r = client.post("/users", json={**NEW, "password": huge})
        assert r.status_code == 422
        assert len(r.text) < 500
        user = _account(db)
        reset = client.post(
            f"/users/{user.id}/reset-password", json={"new_password": huge}
        )
        assert reset.status_code == 422
        assert len(reset.text) < 500

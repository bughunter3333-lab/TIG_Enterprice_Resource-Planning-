import pytest
from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.models.user import User
from app.core.security import hash_password


@pytest.mark.integration
async def test_login_success(
    async_client: AsyncClient, test_admin_user: User, test_db_session: Session
):
    """Test successful login."""
    # Note: This test assumes the user exists in the test database
    response = await async_client.post(
        "/auth/login",
        json={
            "username": "testadmin",
            "password": "password123",
        },
    )

    assert response.status_code == 200
    data = response.json()
    # Since we don't know if 2FA is enabled in test, just check response structure
    assert "requires_2fa" in data


@pytest.mark.integration
async def test_login_invalid_credentials(async_client: AsyncClient):
    """Test login with invalid credentials."""
    response = await async_client.post(
        "/auth/login",
        json={
            "username": "nonexistent",
            "password": "wrongpassword",
        },
    )

    assert response.status_code == 401
    data = response.json()
    assert "Invalid username or password" in data.get("detail", "")


@pytest.mark.integration
async def test_login_inactive_user(async_client: AsyncClient, test_db_session: Session):
    """Test login with inactive user."""
    # Create an inactive user
    inactive_user = User(
        username="inactive",
        email="inactive@test.com",
        full_name="Inactive Test",
        hashed_password=hash_password("password123"),
        is_active=False,
    )
    test_db_session.add(inactive_user)
    test_db_session.commit()

    response = await async_client.post(
        "/auth/login",
        json={
            "username": "inactive",
            "password": "password123",
        },
    )

    assert response.status_code == 403
    data = response.json()
    assert "Account disabled" in data.get("detail", "")


@pytest.mark.integration
async def test_password_change_invalidates_old_tokens(
    async_client: AsyncClient, test_admin_user: User, test_db_session: Session
):
    """Changing the password bumps token_version, invalidating previously-issued JWTs
    while keeping the current session signed in via freshly re-issued tokens."""
    # Log in (test admin has no 2FA) → sets access_token + refresh_token cookies.
    r = await async_client.post(
        "/auth/login", json={"username": "testadmin", "password": "password123"}
    )
    assert r.status_code == 200
    old_refresh = async_client.cookies.get("refresh_token")
    assert old_refresh

    # The freshly-issued refresh token works.
    assert (await async_client.post("/auth/refresh")).status_code == 200

    # Change the password — invalidates old tokens, re-issues the current session.
    r = await async_client.post(
        "/auth/change-password",
        json={"current_password": "password123", "new_password": "NewPass123"},
    )
    assert r.status_code == 200

    # The current session (re-issued cookies) still works.
    assert (await async_client.post("/auth/refresh")).status_code == 200

    # The OLD refresh token is now rejected.
    async_client.cookies.clear()
    async_client.cookies.set("refresh_token", old_refresh)
    assert (await async_client.post("/auth/refresh")).status_code == 401


@pytest.mark.integration
async def test_rate_limiting_login(async_client: AsyncClient):
    """Test rate limiting on login endpoint."""
    rate_limited = False
    # Make multiple rapid requests until rate limit is hit
    for i in range(20):
        response = await async_client.post(
            "/auth/login",
            json={
                "username": f"user{i}",
                "password": "password",
            },
        )
        if response.status_code == 429:
            rate_limited = True
            break

    # Rate limiting should kick in at some point
    assert rate_limited

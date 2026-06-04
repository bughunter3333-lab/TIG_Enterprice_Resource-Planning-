import pytest
from app.models.user import User
from app.core.security import hash_password, verify_password


@pytest.mark.unit
def test_user_creation(test_db_session):
    """Test basic user creation."""
    user = User(
        username="john_doe",
        email="john@example.com",
        full_name="John Doe",
        hashed_password=hash_password("password123"),
        is_active=True,
    )
    test_db_session.add(user)
    test_db_session.commit()
    test_db_session.refresh(user)

    assert user.id is not None
    assert user.username == "john_doe"
    assert user.email == "john@example.com"
    assert user.full_name == "John Doe"
    assert user.is_active is True
    assert user.role == "staff"  # Default role


@pytest.mark.unit
def test_password_hashing():
    """Test password hashing and verification."""
    password = "secure_password_123"
    hashed = hash_password(password)

    # Hashed password should not equal plaintext
    assert hashed != password

    # Verification should work
    assert verify_password(password, hashed) is True

    # Wrong password should fail verification
    assert verify_password("wrong_password", hashed) is False


@pytest.mark.unit
def test_user_superuser_default(test_db_session):
    """Test that role defaults to staff."""
    user = User(
        username="regular_user",
        email="user@example.com",
        full_name="Regular User",
        hashed_password=hash_password("password123"),
    )
    test_db_session.add(user)
    test_db_session.commit()
    test_db_session.refresh(user)

    assert user.role == "staff"


@pytest.mark.unit
def test_user_inactive(test_db_session):
    """Test creating an inactive user."""
    user = User(
        username="inactive_user",
        email="inactive@example.com",
        full_name="Inactive User",
        hashed_password=hash_password("password123"),
        is_active=False,
    )
    test_db_session.add(user)
    test_db_session.commit()
    test_db_session.refresh(user)

    assert user.is_active is False

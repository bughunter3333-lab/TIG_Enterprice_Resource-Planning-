import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
import bcrypt
import pyotp
import qrcode
import io
import base64

from app.core.config import settings


# bcrypt reads at most this many bytes of a password and ignores the rest.
MAX_PASSWORD_BYTES = 72
# The most a password field accepts at all, so an oversized value is refused
# before anything reads it. The 72-byte rule above is the real one.
MAX_PASSWORD_CHARS = 256


def validate_password_strength(password: str) -> str:
    """The one rule for a password someone sets. Raises ValueError with why."""
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[0-9]", password):
        raise ValueError("Password must contain at least one digit")
    # Longer than this and the end of it would not count: two passwords that
    # differ only after the 72nd byte would both open the account.
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes")
    return password


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with 12 work-factor rounds."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode(
        "utf-8"
    )


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        # bcrypt.checkpw can raise ValueError for malformed hashes or TypeError
        # if inputs are not the expected types; treat as verification failure
        return False


def create_token(data: dict, expires_delta: timedelta) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expires_delta
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def create_access_token(
    user_id: int, role: str, mfa_verified: bool = False, token_version: int = 0
) -> str:
    return create_token(
        {
            "sub": str(user_id),
            "role": role,
            "mfa": mfa_verified,
            "type": "access",
            "tv": token_version,
        },
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(user_id: int, token_version: int = 0) -> str:
    return create_token(
        {"sub": str(user_id), "type": "refresh", "tv": token_version},
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def create_pre_mfa_token(user_id: int, token_version: int = 0) -> str:
    """Short-lived token issued after password check, before 2FA is verified.

    It carries the account's token version like every other token, so a reset
    or a deactivation part-way through signing in ends the attempt too.
    """
    return create_token(
        {"sub": str(user_id), "type": "pre_mfa", "tv": token_version},
        timedelta(minutes=5),
    )


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        return None


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def get_totp_uri(secret: str, username: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=username, issuer_name=settings.TOTP_ISSUER
    )


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code, valid_window=0)


def totp_qr_base64(secret: str, username: str) -> str:
    uri = get_totp_uri(secret, username)
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()

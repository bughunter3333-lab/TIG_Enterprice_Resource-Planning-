"""
Symmetric encryption for sensitive settings (e.g. SMTP password).

Uses Fernet (AES-128-CBC + HMAC-SHA256) derived from the app SECRET_KEY.
The key is base64url-encoded so it meets Fernet's 32-byte requirement.
"""

import base64
import hashlib
from cryptography.fernet import Fernet, InvalidToken


def _fernet(secret_key: str) -> Fernet:
    """Derive a stable 32-byte Fernet key from SECRET_KEY via SHA-256."""
    raw = hashlib.sha256(secret_key.encode()).digest()
    key = base64.urlsafe_b64encode(raw)
    return Fernet(key)


def encrypt_value(plaintext: str, secret_key: str) -> str:
    """Return a base64url Fernet token for *plaintext*."""
    return _fernet(secret_key).encrypt(plaintext.encode()).decode()


def decrypt_value(token: str, secret_key: str) -> str:
    """Decrypt a Fernet *token* and return the plaintext string.

    Raises ValueError if the token is invalid or was encrypted with a different key.
    """
    try:
        return _fernet(secret_key).decrypt(token.encode()).decode()
    except (InvalidToken, Exception) as exc:
        raise ValueError(
            "Could not decrypt value — token invalid or key mismatch"
        ) from exc

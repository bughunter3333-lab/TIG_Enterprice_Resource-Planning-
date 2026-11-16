"""Unit tests for the session tokens in app.core.security.

The tokens are built here by hand to the HS256 spec rather than with a JWT
library, so these tests hold whichever library signs and checks them. A token
issued before a library change must still open the session after it.
"""

import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.core.security import create_access_token, decode_token


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _segments(header: dict, claims: dict) -> str:
    return f"{_b64(json.dumps(header).encode())}.{_b64(json.dumps(claims).encode())}"


def _signed(claims: dict, key: str, alg: str = "HS256", digest=hashlib.sha256) -> str:
    signing_input = _segments({"alg": alg, "typ": "JWT"}, claims)
    signature = hmac.new(key.encode(), signing_input.encode(), digest).digest()
    return f"{signing_input}.{_b64(signature)}"


def _claims(**overrides) -> dict:
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)
    return {
        "sub": "42",
        "role": "admin",
        "mfa": True,
        "type": "access",
        "tv": 3,
        "exp": int(expires.timestamp()),
        **overrides,
    }


@pytest.mark.unit
class TestDecodeToken:
    def test_a_token_it_issued_opens(self):
        payload = decode_token(create_access_token(42, "admin", True, 3))
        assert payload["sub"] == "42"
        assert payload["role"] == "admin"
        assert payload["mfa"] is True
        assert payload["type"] == "access"
        assert payload["tv"] == 3

    def test_any_hs256_token_signed_with_the_secret_opens(self):
        # The shape every library writes, so a live session survives a swap.
        payload = decode_token(_signed(_claims(), settings.SECRET_KEY))
        assert payload["sub"] == "42"
        assert payload["tv"] == 3

    def test_an_expired_token_is_refused(self):
        past = int((datetime.now(timezone.utc) - timedelta(seconds=5)).timestamp())
        assert decode_token(_signed(_claims(exp=past), settings.SECRET_KEY)) is None

    def test_a_token_signed_with_another_key_is_refused(self):
        assert (
            decode_token(_signed(_claims(), "not-the-secret-key-0123456789abcdef"))
            is None
        )

    def test_a_tampered_token_is_refused(self):
        token = _signed(_claims(), settings.SECRET_KEY)
        header, _, signature = token.split(".")
        forged = _b64(json.dumps(_claims(role="admin", sub="1")).encode())
        assert decode_token(f"{header}.{forged}.{signature}") is None

    def test_an_unsigned_token_is_refused(self):
        unsigned = _segments({"alg": "none", "typ": "JWT"}, _claims()) + "."
        assert decode_token(unsigned) is None

    def test_only_hs256_is_accepted(self):
        token = _signed(_claims(), settings.SECRET_KEY, "HS512", hashlib.sha512)
        assert decode_token(token) is None

    @pytest.mark.parametrize("garbage", ["", "not-a-token", "a.b.c", "a.b.c.d.e"])
    def test_garbage_is_refused(self, garbage):
        assert decode_token(garbage) is None

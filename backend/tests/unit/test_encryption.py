"""Unit tests for app.core.encryption."""

import pytest
from app.core.encryption import encrypt_value, decrypt_value

SECRET = "test-secret-key-for-unit-tests-only"


@pytest.mark.unit
class TestEncryption:
    def test_roundtrip(self):
        plaintext = "my-smtp-password-123"
        token = encrypt_value(plaintext, SECRET)
        assert decrypt_value(token, SECRET) == plaintext

    def test_encrypted_differs_from_plaintext(self):
        plaintext = "hunter2"
        token = encrypt_value(plaintext, SECRET)
        assert token != plaintext

    def test_wrong_key_raises(self):
        token = encrypt_value("secret", SECRET)
        with pytest.raises(ValueError):
            decrypt_value(token, "wrong-key")

    def test_garbage_token_raises(self):
        with pytest.raises(ValueError):
            decrypt_value("not-a-valid-token", SECRET)

    def test_different_plaintexts_produce_different_tokens(self):
        # Fernet uses random IVs — even same plaintext differs each call
        t1 = encrypt_value("abc", SECRET)
        t2 = encrypt_value("abc", SECRET)
        assert t1 != t2
        assert decrypt_value(t1, SECRET) == "abc"
        assert decrypt_value(t2, SECRET) == "abc"

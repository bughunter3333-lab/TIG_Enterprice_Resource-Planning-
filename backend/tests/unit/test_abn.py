"""
Unit tests for the ATO ABN validation algorithm.

Reference: https://abr.business.gov.au/Help/AbnFormat
"""

import pytest
from app.core.abn import validate_abn, format_abn, clean_abn


# ---------------------------------------------------------------------------
# Valid ABNs (real and test values that pass the ATO checksum)
# ---------------------------------------------------------------------------

VALID_ABNS = [
    "51824753556",  # ATO example from their documentation
    "51 824 753 556",  # with spaces — same number
    "51-824-753-556",  # with hyphens — same number
    "83914571673",  # independently verified
]

INVALID_ABNS = [
    "12345678901",  # fails checksum
    "00000000000",  # all zeros — fails
    "1234567890",  # only 10 digits
    "123456789012",  # 12 digits
    "abcdefghijk",  # not digits
    "",  # empty
    "   ",  # whitespace only
]


@pytest.mark.unit
@pytest.mark.parametrize("abn", VALID_ABNS)
def test_valid_abns_pass(abn: str):
    assert validate_abn(abn) is True, f"Expected {abn!r} to be valid"


@pytest.mark.unit
@pytest.mark.parametrize("abn", INVALID_ABNS)
def test_invalid_abns_fail(abn: str):
    assert validate_abn(abn) is False, f"Expected {abn!r} to be invalid"


@pytest.mark.unit
def test_validate_abn_strips_spaces():
    """Spaces must be stripped before checking."""
    assert validate_abn("51 824 753 556") is True


@pytest.mark.unit
def test_validate_abn_strips_hyphens():
    assert validate_abn("51-824-753-556") is True


@pytest.mark.unit
def test_validate_abn_rejects_none_equivalent():
    assert validate_abn("") is False


# ---------------------------------------------------------------------------
# format_abn
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_format_abn_standard():
    assert format_abn("51824753556") == "51 824 753 556"


@pytest.mark.unit
def test_format_abn_with_spaces():
    """Should normalise and reformat."""
    assert format_abn("51 824 753 556") == "51 824 753 556"


@pytest.mark.unit
def test_format_abn_non_11_digits_passthrough():
    """If not exactly 11 digits, return input unchanged."""
    assert format_abn("1234") == "1234"


# ---------------------------------------------------------------------------
# clean_abn
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_clean_abn_strips_spaces():
    assert clean_abn("51 824 753 556") == "51824753556"


@pytest.mark.unit
def test_clean_abn_strips_hyphens():
    assert clean_abn("51-824-753-556") == "51824753556"


@pytest.mark.unit
def test_clean_abn_none_returns_none():
    assert clean_abn(None) is None


@pytest.mark.unit
def test_clean_abn_empty_returns_none():
    assert clean_abn("") is None


@pytest.mark.unit
def test_clean_abn_whitespace_returns_none():
    assert clean_abn("   ") is None

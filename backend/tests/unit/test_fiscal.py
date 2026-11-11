"""
Unit tests for Australian fiscal year helpers.

Australia's financial year: 1 July – 30 June.
Tests define the interface for core/fiscal.py (Phase 2a).
"""

import pytest
from datetime import date

# These imports will fail until Phase 2a creates the module.
# That is intentional — tests drive the implementation.
try:
    from app.core.fiscal import (
        get_fiscal_year_bounds,
        fiscal_year_label,
        current_fiscal_year,
    )

    FISCAL_AVAILABLE = True
except ImportError:
    FISCAL_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not FISCAL_AVAILABLE,
    reason="app.core.fiscal not yet implemented (Phase 2a)",
)


# ---------------------------------------------------------------------------
# get_fiscal_year_bounds(date, start_month=7) -> (date, date)
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_fy_bounds_for_date_in_second_half():
    """July → December falls in the FY that starts that July."""
    start, end = get_fiscal_year_bounds(date(2025, 9, 15))
    assert start == date(2025, 7, 1)
    assert end == date(2026, 6, 30)


@pytest.mark.unit
def test_fy_bounds_for_date_in_first_half():
    """January → June falls in the FY that started the prior July."""
    start, end = get_fiscal_year_bounds(date(2026, 3, 20))
    assert start == date(2025, 7, 1)
    assert end == date(2026, 6, 30)


@pytest.mark.unit
def test_fy_bounds_on_start_boundary():
    start, end = get_fiscal_year_bounds(date(2025, 7, 1))
    assert start == date(2025, 7, 1)


@pytest.mark.unit
def test_fy_bounds_on_end_boundary():
    start, end = get_fiscal_year_bounds(date(2026, 6, 30))
    assert end == date(2026, 6, 30)


@pytest.mark.unit
def test_fy_bounds_calendar_year_start_month():
    """When start_month=1 the fiscal year equals the calendar year."""
    start, end = get_fiscal_year_bounds(date(2025, 8, 10), start_month=1)
    assert start == date(2025, 1, 1)
    assert end == date(2025, 12, 31)


# ---------------------------------------------------------------------------
# fiscal_year_label(date) -> str  e.g. "FY2025-26"
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_fy_label_format():
    label = fiscal_year_label(date(2025, 10, 1))
    assert label == "FY2025-26"


@pytest.mark.unit
def test_fy_label_first_half():
    label = fiscal_year_label(date(2026, 2, 1))
    assert label == "FY2025-26"


# ---------------------------------------------------------------------------
# current_fiscal_year() -> (date, date)
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_current_fiscal_year_returns_tuple():
    result = current_fiscal_year()
    assert isinstance(result, tuple)
    assert len(result) == 2
    start, end = result
    assert start < end
    assert start.month == 7 and start.day == 1
    assert end.month == 6 and end.day == 30

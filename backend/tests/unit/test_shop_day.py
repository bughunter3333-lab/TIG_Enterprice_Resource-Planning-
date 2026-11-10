"""The shop's day is Sydney's, by the time zone database or by Sydney's rule."""

from datetime import datetime, timezone

import pytest

from app.core import shop_day

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    "utc, sydney",
    [
        # A November morning in Sydney is the evening before in UTC (AEDT).
        ("2026-11-09 20:00", "2026-11-10 07:00"),
        # Winter: AEST, UTC+10, across midnight.
        ("2026-07-01 13:59", "2026-07-01 23:59"),
        ("2026-07-01 14:00", "2026-07-02 00:00"),
        # Daylight time starts 2am on the first Sunday of October (4 Oct 2026).
        ("2026-10-03 15:59", "2026-10-04 01:59"),
        ("2026-10-03 16:00", "2026-10-04 03:00"),
        # And ends 3am on the first Sunday of April (5 Apr 2026).
        ("2026-04-04 15:59", "2026-04-05 02:59"),
        ("2026-04-04 16:00", "2026-04-05 02:00"),
    ],
)
def test_sydneys_rule(utc, sydney):
    at = datetime.strptime(utc, "%Y-%m-%d %H:%M")
    assert shop_day.sydney_by_rule(at) == datetime.strptime(sydney, "%Y-%m-%d %H:%M")


def test_today_is_sydneys_date():
    now = datetime(2026, 11, 9, 20, 0, tzinfo=timezone.utc)
    assert shop_day.today(now).isoformat() == "2026-11-10"

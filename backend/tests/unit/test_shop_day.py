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


def test_the_clock_is_one_place_a_test_can_set(monkeypatch):
    # 22:00 UTC on 30 June is 8am on 1 July in Sydney: a new financial year.
    at = datetime(2026, 6, 30, 22, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(shop_day, "_utc_now", lambda: at)
    assert shop_day.today().isoformat() == "2026-07-01"


def test_the_shops_wall_clock_is_sydneys(monkeypatch):
    at = datetime(2026, 6, 30, 22, 5, tzinfo=timezone.utc)
    monkeypatch.setattr(shop_day, "_utc_now", lambda: at)
    assert shop_day.wall_clock() == datetime(2026, 7, 1, 8, 5)


@pytest.mark.parametrize(
    "instant",
    [
        datetime(2026, 11, 9, 21, 0, tzinfo=timezone.utc),
        # As SQLite hands a stored UTC time back: no zone, still UTC.
        datetime(2026, 11, 9, 21, 0),
    ],
)
def test_the_shops_day_an_instant_fell_on(instant):
    assert shop_day.day_of(instant).isoformat() == "2026-11-10"

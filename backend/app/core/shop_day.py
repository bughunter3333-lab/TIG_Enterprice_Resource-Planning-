"""The shop's day: the date in Sydney, not the server's.

The API runs on UTC, so until 10 or 11 in the morning its `date.today()` is
yesterday in Sydney — a credit note dated today by the screen was refused as
"in the future", and a credit applied in the morning was dated the day before
its own note. Everything that stamps or bounds a business day by "today"
should ask this.

The system's time zone database is used when there is one. Without it (a
Windows machine without tzdata — not a dependency of this app), Sydney's rule
is worked out here: AEST, UTC+10, with daylight time, UTC+11, from 2am on the
first Sunday of October to 3am on the first Sunday of April. That rule has
held since 2008.
"""

from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

ZONE = "Australia/Sydney"
_STANDARD = timedelta(hours=10)
_DAYLIGHT = timedelta(hours=11)


def _first_sunday(year: int, month: int) -> date:
    first = date(year, month, 1)
    return first + timedelta(days=(6 - first.weekday()) % 7)


def sydney_by_rule(utc_now: datetime) -> datetime:
    """Sydney's wall-clock time for a naive UTC instant, by the DST rule."""
    year = utc_now.year
    starts = datetime.combine(_first_sunday(year, 10), time(2)) - _STANDARD
    ends = datetime.combine(_first_sunday(year, 4), time(3)) - _DAYLIGHT
    daylight = utc_now >= starts or utc_now < ends
    return utc_now + (_DAYLIGHT if daylight else _STANDARD)


def _utc_now() -> datetime:
    """The server's clock, read in this one place so a test can set it."""
    return datetime.now(timezone.utc)


def wall_clock(now: Optional[datetime] = None) -> datetime:
    """Sydney's wall-clock time now (or at `now`, an aware datetime), naive.

    For a time people read, stored as text: when an email went, a stocktake's
    reference. An instant kept for the machine stays an aware UTC datetime.
    """
    now = now or _utc_now()
    try:
        from zoneinfo import ZoneInfo

        return now.astimezone(ZoneInfo(ZONE)).replace(tzinfo=None)
    except Exception:  # no time zone database here: Sydney's rule instead
        return sydney_by_rule(now.astimezone(timezone.utc).replace(tzinfo=None))


def today(now: Optional[datetime] = None) -> date:
    """The date in Sydney now (or at `now`, an aware datetime)."""
    return wall_clock(now).date()


def day_of(instant: datetime) -> date:
    """The shop's day a stored instant fell on; one with no zone is UTC."""
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=timezone.utc)
    return today(instant)

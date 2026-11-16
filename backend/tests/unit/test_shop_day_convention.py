"""Every business day and shop wall-clock time is read through `app.core.shop_day`.

The API runs in UTC and the shop is in Sydney, so for ten or eleven hours a
day `date.today()` — and a naive `datetime.now()` — is the day before the
shop's. An invoice issued at 8am on 1 July was dated 30 June: the wrong
financial year, the wrong BAS quarter, a due date a day early. This machine is
in Sydney, so no other test sees it; only production and CI run in UTC.

An aware instant, `datetime.now(timezone.utc)`, is a moment, not a day, and is
allowed: a stored instant becomes the shop's day through `shop_day.day_of`.
"""

import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

APP = Path(__file__).resolve().parents[2] / "app"
OWNER = APP / "core" / "shop_day.py"
SERVER_CLOCK = re.compile(r"\bdate\.today\(\)|\bdatetime\.(?:now|today|utcnow)\(\)")


@pytest.mark.parametrize(
    "line",
    [
        "today = date.today()",
        'stamp = datetime.now().strftime("%Y-%m-%d")',
        "when = datetime.utcnow()",
        "d = datetime.today()",
    ],
)
def test_a_server_clock_read_is_seen(line):
    assert SERVER_CLOCK.search(line)


def test_an_instant_is_not_a_day():
    assert not SERVER_CLOCK.search("job.updated_at = datetime.now(timezone.utc)")


def test_the_shops_day_is_read_in_one_place():
    found = [
        f"{path.relative_to(APP.parent)}:{n}: {line.strip()}"
        for path in sorted(APP.rglob("*.py"))
        if path != OWNER
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
        if SERVER_CLOCK.search(line)
    ]
    assert found == [], (
        "Read the shop's day with shop_day.today() (a time people read with "
        "shop_day.wall_clock()), not the server's UTC clock:\n" + "\n".join(found)
    )

"""When an invoice falls due, read from payment terms.

An invoice is overdue by the customer's payment terms counted from the date of
the invoice — not by the job's due date, which is when the goods were promised,
not when the money is (owner decision, 2026-10-19). Terms are free text on the
customer and in company settings, so the forms in use are read here, once:

- "Net 30" (any case or spacing, "Net 30 days" too): 30 days after the invoice;
- "30 days": the same, and so is Jim2's code "30DAYSINV" (printed as a job's
  Pay Terms) with the words it abbreviates, "30 days from invoice";
- "COD", "Cash", "Prepaid", "Due on receipt": the day of the invoice;
- "EOM": the last day of the invoice's month;
- "30 EOM" or "Net 30 EOM": 30 days after the end of that month.

Terms that are blank or not one of these fall back to the company's default
terms, and a default that cannot be read either to Net 30 — an invoice always
has a due date, rather than none and so never overdue.
"""

import calendar
import re
from datetime import date, timedelta
from typing import Optional

DEFAULT_TERMS = "Net 30"

# Three digits at most: a thousand days is not a payment term, and a number
# that large is a typing slip, read as unknown terms rather than as a due date
# years away.
_NET = re.compile(r"net ?(\d{1,3})(?: ?days?)?")
_DAYS = re.compile(r"(\d{1,3}) ?days?(?: ?(?:from )?inv(?:oice)?)?")
_EOM = re.compile(r"(?:net ?)?(\d{1,3}) ?eom")
_ON_RECEIPT = {"cod", "cash", "prepaid", "due on receipt"}


def _month_end(day: date) -> date:
    return day.replace(day=calendar.monthrange(day.year, day.month)[1])


def _read(start: date, terms: Optional[str]) -> Optional[date]:
    """The due date `terms` give an invoice dated `start`; None if unreadable."""
    text = " ".join((terms or "").lower().split())
    if text in _ON_RECEIPT:
        return start
    if text == "eom":
        return _month_end(start)
    for pattern, from_month_end in ((_NET, False), (_DAYS, False), (_EOM, True)):
        match = pattern.fullmatch(text)
        if match:
            base = _month_end(start) if from_month_end else start
            return base + timedelta(days=int(match.group(1)))
    return None


def due_date(start: date, terms: Optional[str], default: Optional[str] = None) -> date:
    """When an invoice dated `start` falls due on `terms`.

    `default` is the company's default terms, used when `terms` is blank or
    unreadable; Net 30 when that is too.
    """
    for candidate in (terms, default):
        due = _read(start, candidate)
        if due is not None:
            return due
    return _read(start, DEFAULT_TERMS)

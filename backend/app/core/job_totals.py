"""A job's money, worked out from its lines — the one formula for it.

Each line is its order quantity times its price ex GST; the job is the sum of
its lines with GST on top. It is how the job form has always added a job up,
and now the server does it too, so the header is never just whatever a caller
sent (finding F04). The job router writes totals with it and the ledger health
check reads them back with it, so the two cannot disagree about the rule.

A line priced inc GST (`JobItem.priced_inc`, the online store's shelf prices)
is its quantity times its price inc GST, of which GST is one eleventh. Taken
from a price ex GST rounded to the cent, $34.95 became $31.77 and the order
totalled a cent less than the store charged, so the card payment was refused
(S2-08). Lines priced ex GST add up exactly as before.
"""

from decimal import Decimal
from typing import Iterable, NamedTuple

from app.core.ledger import ZERO, money

GST_RATE = Decimal("0.10")


class Totals(NamedTuple):
    ex: Decimal
    tax: Decimal
    inc: Decimal


def _inc_total(item) -> Decimal:
    return money(Decimal(int(item.order_qty or 0)) * money(item.price_inc))


def _inc_gst(item) -> Decimal:
    return money(_inc_total(item) / (1 + 1 / GST_RATE))


def line_total(item) -> Decimal:
    """What a line comes to ex GST."""
    if getattr(item, "priced_inc", False):
        return _inc_total(item) - _inc_gst(item)
    return money(Decimal(int(item.order_qty or 0)) * money(item.price_ex))


def from_lines(items: Iterable) -> Totals:
    items = list(items)
    by_inc = [item for item in items if getattr(item, "priced_inc", False)]
    by_ex = [item for item in items if not getattr(item, "priced_inc", False)]
    ex = sum((line_total(item) for item in by_ex), ZERO)
    tax = money(ex * GST_RATE)
    inc = ex + tax
    for item in by_inc:
        ex += line_total(item)
        tax += _inc_gst(item)
        inc += _inc_total(item)
    return Totals(ex, tax, inc)

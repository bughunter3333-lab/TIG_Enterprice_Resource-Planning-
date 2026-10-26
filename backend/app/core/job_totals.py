"""A job's money, worked out from its lines — the one formula for it.

Each line is its order quantity times its price ex GST; the job is the sum of
its lines with GST on top. It is how the job form has always added a job up,
and now the server does it too, so the header is never just whatever a caller
sent (finding F04). The job router writes totals with it and the ledger health
check reads them back with it, so the two cannot disagree about the rule.
"""

from decimal import Decimal
from typing import Iterable, NamedTuple

from app.core.ledger import ZERO, money

GST_RATE = Decimal("0.10")


class Totals(NamedTuple):
    ex: Decimal
    tax: Decimal
    inc: Decimal


def line_total(item) -> Decimal:
    return money(Decimal(int(item.order_qty or 0)) * money(item.price_ex))


def from_lines(items: Iterable) -> Totals:
    ex = sum((line_total(item) for item in items), ZERO)
    tax = money(ex * GST_RATE)
    return Totals(ex, tax, ex + tax)

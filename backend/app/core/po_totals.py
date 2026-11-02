"""A purchase order's money, worked out from its lines — the one formula for it.

Each line is its quantity ordered times its unit cost ex GST; the PO is the sum
of its lines with GST on top. Every way of raising a PO writes its totals with
this (auto-reorder did not, and left a PO with no GST or inc-GST total — F15),
the document the supplier is sent prints it (F17), and the ledger health check
reads the stored totals back against it.
"""

from decimal import Decimal
from typing import Iterable

from app.core.job_totals import GST_RATE, Totals
from app.core.ledger import ZERO, money


def line_total(line) -> Decimal:
    return money(Decimal(int(line.qty_ordered or 0)) * money(line.unit_cost))


def from_lines(lines: Iterable) -> Totals:
    ex = sum((line_total(line) for line in lines), ZERO)
    tax = money(ex * GST_RATE)
    return Totals(ex, tax, ex + tax)


def set_totals(po) -> None:
    """Write the PO's line totals and its ex-GST, GST and inc-GST totals."""
    for line in po.items:
        line.total = line_total(line)
    totals = from_lines(po.items)
    po.total_ex, po.tax_total, po.total_inc = totals
    po.total = totals.inc  # the older single total, kept in step

"""Landed-cost apportionment — Jim2's Cost vs COG distinction.

Jim2 separates **Cost** (what the supplier charged) from **COG / Cost of Goods**
(what the stock actually cost you once freight, duty, customs and insurance are
apportioned across the shipment). For an importer, margin calculated on Cost
alone is always optimistic; COG is the number that tells the truth.

Charges are spread across the received lines on one of two bases:
  value — proportional to line value (qty x unit cost). The usual default:
          duty and insurance scale with what the goods are worth.
  qty   — proportional to units. Better for freight, where a carton costs the
          same to ship regardless of what is in it.

Money is Decimal throughout, and apportionment is exact: the cents handed out
always sum back to the charge (largest-remainder allocation), so a $249.00
freight bill never becomes $248.99 in the ledger.
"""

from dataclasses import dataclass
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP
from typing import List, Literal

CENT = Decimal("0.01")
UNIT_COST_DP = Decimal("0.0001")  # inventory cost columns are Numeric(10, 4)

Basis = Literal["value", "qty"]


@dataclass
class ReceiptLine:
    sku: str
    qty: int
    unit_cost: Decimal


@dataclass
class LandedCharge:
    description: str
    amount: Decimal
    basis: Basis = "value"


@dataclass
class LineLanded:
    sku: str
    qty: int
    unit_cost: Decimal  # Cost — what the supplier charged
    landed_total: Decimal  # charges apportioned to this line
    cog_unit: Decimal  # COG — landed cost per unit


def allocate(total: Decimal, weights: List[Decimal]) -> List[Decimal]:
    """Split `total` across `weights`, to the cent, losing nothing.

    Flooring every share would leave cents unallocated, so the remainder is
    handed out one cent at a time to the largest fractional parts. With zero
    total weight the split is even rather than dropped.
    """
    n = len(weights)
    if n == 0:
        return []

    total_weight = sum(weights)
    if total_weight <= 0:
        weights = [Decimal(1)] * n
        total_weight = Decimal(n)

    shares: List[Decimal] = []
    remainders: List[Decimal] = []
    for w in weights:
        exact = total * Decimal(w) / total_weight
        floored = exact.quantize(CENT, rounding=ROUND_DOWN)
        shares.append(floored)
        remainders.append(exact - floored)

    leftover = int(
        ((total - sum(shares)) / CENT).to_integral_value(rounding=ROUND_HALF_UP)
    )
    if leftover > 0:
        order = sorted(range(n), key=lambda i: remainders[i], reverse=True)
        for k in range(leftover):
            shares[order[k % n]] += CENT
    return shares


def _weights(lines: List[ReceiptLine], basis: Basis) -> List[Decimal]:
    if basis == "qty":
        return [Decimal(ln.qty or 0) for ln in lines]
    value = [Decimal(ln.qty or 0) * Decimal(ln.unit_cost or 0) for ln in lines]
    if sum(value) > 0:
        return value
    # Nothing to weigh on (e.g. free samples) — fall back to units so the
    # charge still lands somewhere rather than being spread over zero value.
    return [Decimal(ln.qty or 0) for ln in lines]


def apportion_landed_costs(
    lines: List[ReceiptLine], charges: List[LandedCharge]
) -> List[LineLanded]:
    """Apportion every charge across `lines` and return Cost + COG per line."""
    totals = [Decimal("0.00")] * len(lines)
    for charge in charges:
        amount = Decimal(charge.amount or 0)
        if amount == 0:
            continue
        for i, share in enumerate(allocate(amount, _weights(lines, charge.basis))):
            totals[i] += share

    out: List[LineLanded] = []
    for ln, landed in zip(lines, totals):
        qty = ln.qty or 0
        unit_cost = Decimal(ln.unit_cost or 0)
        # No units means no per-unit landing — never divide by zero.
        cog = unit_cost + (landed / Decimal(qty) if qty > 0 else Decimal(0))
        out.append(
            LineLanded(
                sku=ln.sku,
                qty=qty,
                unit_cost=unit_cost,
                landed_total=landed.quantize(CENT),
                cog_unit=cog.quantize(UNIT_COST_DP),
            )
        )
    return out

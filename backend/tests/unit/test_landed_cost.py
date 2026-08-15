"""
Unit tests for landed-cost apportionment (Jim2 Cost vs COG).

Cost = what the supplier charged. COG = cost of goods once freight/duty/customs
are apportioned across the received lines. Money is Decimal and every cent of a
charge must land somewhere — apportionment may not lose or invent money.
"""

from decimal import Decimal

import pytest

from app.core.landed_cost import (
    ReceiptLine,
    LandedCharge,
    apportion_landed_costs,
    allocate,
)


@pytest.mark.unit
class TestAllocate:
    def test_splits_exactly_with_no_lost_cents(self):
        # $10.00 over weights 1:1:1 → 3.34/3.33/3.33, summing to exactly 10.00
        out = allocate(Decimal("10.00"), [Decimal(1), Decimal(1), Decimal(1)])
        assert sum(out) == Decimal("10.00")
        assert sorted(out) == [Decimal("3.33"), Decimal("3.33"), Decimal("3.34")]

    def test_proportional_to_weights(self):
        out = allocate(Decimal("100.00"), [Decimal(3), Decimal(1)])
        assert out == [Decimal("75.00"), Decimal("25.00")]
        assert sum(out) == Decimal("100.00")

    def test_zero_weights_spreads_evenly(self):
        out = allocate(Decimal("9.00"), [Decimal(0), Decimal(0), Decimal(0)])
        assert sum(out) == Decimal("9.00")
        assert out == [Decimal("3.00"), Decimal("3.00"), Decimal("3.00")]

    def test_no_lines_returns_empty(self):
        assert allocate(Decimal("5.00"), []) == []


@pytest.mark.unit
class TestApportion:
    def _lines(self):
        # 100 tees @ $6.20 = $620 ; 50 polos @ $12.50 = $625
        return [
            ReceiptLine(sku="TEE", qty=100, unit_cost=Decimal("6.20")),
            ReceiptLine(sku="POLO", qty=50, unit_cost=Decimal("12.50")),
        ]

    def test_by_value_apportions_on_line_value(self):
        charges = [
            LandedCharge(
                description="Sea freight", amount=Decimal("249.00"), basis="value"
            )
        ]
        res = apportion_landed_costs(self._lines(), charges)
        # Line values 620 and 625 (total 1245); 249.00 / 1245 = 0.20 exactly,
        # so each line carries 20% of its own value in freight.
        assert sum(r.landed_total for r in res) == Decimal("249.00")
        tee, polo = res
        assert tee.landed_total == Decimal("124.00")  # 620 * 0.20
        assert polo.landed_total == Decimal("125.00")  # 625 * 0.20
        # COG = supplier cost + landed per unit: 6.20 + (124.00 / 100)
        assert tee.cog_unit == Decimal("7.4400")
        assert polo.cog_unit == Decimal("15.0000")  # 12.50 + (125.00 / 50)

    def test_by_qty_apportions_on_units(self):
        charges = [
            LandedCharge(description="Customs", amount=Decimal("150.00"), basis="qty")
        ]
        res = apportion_landed_costs(self._lines(), charges)
        assert sum(r.landed_total for r in res) == Decimal("150.00")
        # 150 units total → $1/unit → 100 and 50
        assert res[0].landed_total == Decimal("100.00")
        assert res[1].landed_total == Decimal("50.00")

    def test_multiple_charges_accumulate(self):
        charges = [
            LandedCharge(description="Freight", amount=Decimal("150.00"), basis="qty"),
            LandedCharge(description="Duty", amount=Decimal("249.00"), basis="value"),
        ]
        res = apportion_landed_costs(self._lines(), charges)
        assert sum(r.landed_total for r in res) == Decimal("399.00")

    def test_no_charges_leaves_cog_equal_to_cost(self):
        res = apportion_landed_costs(self._lines(), [])
        for r in res:
            assert r.landed_total == Decimal("0.00")
            assert r.cog_unit == r.unit_cost

    def test_zero_value_lines_fall_back_to_qty_for_value_basis(self):
        # Free samples: value basis has nothing to weigh on, so don't lose the charge
        lines = [
            ReceiptLine(sku="SAMPLE", qty=10, unit_cost=Decimal("0.00")),
            ReceiptLine(sku="SAMPLE2", qty=10, unit_cost=Decimal("0.00")),
        ]
        res = apportion_landed_costs(
            lines, [LandedCharge("Freight", Decimal("20.00"), "value")]
        )
        assert sum(r.landed_total for r in res) == Decimal("20.00")

    def test_zero_qty_lines_get_nothing(self):
        lines = [
            ReceiptLine(sku="A", qty=0, unit_cost=Decimal("10.00")),
            ReceiptLine(sku="B", qty=5, unit_cost=Decimal("10.00")),
        ]
        res = apportion_landed_costs(
            lines, [LandedCharge("Freight", Decimal("50.00"), "qty")]
        )
        assert res[0].landed_total == Decimal("0.00")
        assert res[1].landed_total == Decimal("50.00")
        assert res[0].cog_unit == Decimal("10.00")  # no division by zero

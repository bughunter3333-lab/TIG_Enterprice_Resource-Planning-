import pytest
from app.models.stock_location import StockLocation


@pytest.mark.unit
def test_available_qty_normal():
    loc = StockLocation(sku="SKU001", branch="HQ", qty_on_hand=10, committed_qty=3)
    assert loc.available_qty == 7


@pytest.mark.unit
def test_available_qty_no_negative():
    """Available should never go below zero even if committed exceeds on-hand."""
    loc = StockLocation(sku="SKU001", branch="HQ", qty_on_hand=2, committed_qty=5)
    assert loc.available_qty == 0


@pytest.mark.unit
def test_available_qty_zero_committed():
    loc = StockLocation(sku="SKU001", branch="HQ", qty_on_hand=8, committed_qty=0)
    assert loc.available_qty == 8


@pytest.mark.unit
def test_available_qty_none_values():
    """None values default to 0."""
    loc = StockLocation(sku="SKU001", branch="HQ", qty_on_hand=None, committed_qty=None)
    assert loc.available_qty == 0

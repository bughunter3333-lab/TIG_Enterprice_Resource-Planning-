"""
Integration tests for GET /inventory/{sku}/stats — movement velocity stats
(Jim2 Stock "Stats" tab): units sold over 30/90/365-day windows, receipts,
and stock-cover days at the current sales pace.
"""

from datetime import datetime, timedelta

import pytest
from app.models.inventory import StockMovement


def _mv(db, sku, days_ago, mtype, qty):
    now = datetime.now()
    db.add(
        StockMovement(
            sku=sku,
            date=(now - timedelta(days=days_ago)).strftime("%d/%m/%Y"),
            type=mtype,
            quantity=qty,
            created_at=now - timedelta(days=days_ago),
        )
    )


@pytest.mark.integration
class TestStockStats:
    def test_windows_totals_and_cover(self, client, db, make_inventory):
        make_inventory(sku="STAT1", stock=40)
        _mv(db, "STAT1", 5, "Sale", -10)  # sold 10 — in 30/90/365
        _mv(db, "STAT1", 20, "Sale", -5)  # sold 5  — in 30/90/365
        _mv(db, "STAT1", 60, "Sale", -20)  # sold 20 — in 90/365
        _mv(db, "STAT1", 200, "Sale", -15)  # sold 15 — in 365
        _mv(db, "STAT1", 400, "Sale", -99)  # sold 99 — older than 365
        _mv(db, "STAT1", 10, "Purchase", 50)  # received 50
        db.commit()

        d = client.get("/inventory/STAT1/stats").json()
        assert d["on_hand"] == 40
        assert d["units_sold_30"] == 15
        assert d["units_sold_90"] == 35
        assert d["units_sold_365"] == 50
        assert d["total_sold_all_time"] == 149
        assert d["units_received_365"] == 50
        assert d["sale_count"] == 5
        # velocity: 50 units over 365d → ~4.17/month; cover = 40 / (50/365) ≈ 292d
        assert d["avg_monthly_sold"] == pytest.approx(50 / 12, abs=0.1)
        assert d["stock_cover_days"] == pytest.approx(40 / (50 / 365), abs=1.0)

    def test_no_sales_has_no_cover(self, client, db, make_inventory):
        make_inventory(sku="STAT2", stock=5)
        d = client.get("/inventory/STAT2/stats").json()
        assert d["units_sold_365"] == 0
        assert d["stock_cover_days"] is None  # no velocity → undefined cover

    def test_unknown_sku_404(self, client):
        assert client.get("/inventory/NOPE/stats").status_code == 404

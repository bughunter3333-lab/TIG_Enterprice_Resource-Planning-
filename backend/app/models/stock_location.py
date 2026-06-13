from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class StockLocation(Base):
    __tablename__ = "stock_locations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(50), ForeignKey("inventory.sku", ondelete="CASCADE"), nullable=False, index=True)
    branch = Column(String(50), nullable=False)
    zone = Column(String(20), nullable=True)
    qty_on_hand = Column(Integer, nullable=False, default=0)
    committed_qty = Column(Integer, nullable=False, default=0)
    backorder_qty = Column(Integer, nullable=False, default=0)
    on_po_qty = Column(Integer, nullable=False, default=0)
    primary_bin_1 = Column(String(50), nullable=True)
    max_qty_bin_1 = Column(Integer, nullable=True)
    primary_bin_2 = Column(String(50), nullable=True)
    max_qty_bin_2 = Column(Integer, nullable=True)

    __table_args__ = (UniqueConstraint("sku", "branch", name="uq_stock_locations_sku_branch"),)

    @property
    def available_qty(self) -> int:
        return max(0, (self.qty_on_hand or 0) - (self.committed_qty or 0))

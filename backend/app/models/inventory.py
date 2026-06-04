from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from app.database import Base


class InventoryItem(Base):
    __tablename__ = "inventory"

    sku = Column(String(50), primary_key=True)
    name = Column(String(255), nullable=False)
    category = Column(String(50))
    supplier = Column(String(100))
    stock = Column(Integer, default=0)
    min_stock = Column(Integer, default=0)
    reorder_qty = Column(Integer, default=0)
    on_order_qty = Column(Integer, default=0)
    weight_kg = Column(Numeric(8, 3), default=0)
    committed_qty = Column(Integer, default=0)
    unit_cost = Column(Numeric(10, 2), default=0)
    sell_price = Column(Numeric(10, 2), default=0)
    location = Column(String(50))
    status = Column(String(20), default="Active", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Variant matrix links (nullable — existing SKUs unaffected)
    style_id = Column(Integer, ForeignKey("styles.id"), nullable=True, index=True)
    colour_code = Column(String(20), nullable=True)
    size_code = Column(String(20), nullable=True)

    movements = relationship("StockMovement", back_populates="item", cascade="all, delete-orphan")
    style = relationship("Style", back_populates="inventory_items")

    @property
    def available_qty(self) -> int:
        return max(0, (self.stock or 0) - (self.committed_qty or 0))


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(50), ForeignKey("inventory.sku"), nullable=False)
    date = Column(String(20))
    type = Column(String(30))   # e.g. Adjustment, Job Allocation, Purchase
    quantity = Column(Integer)
    reference = Column(String(50))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    item = relationship("InventoryItem", back_populates="movements")

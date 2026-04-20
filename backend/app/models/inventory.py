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
    unit_cost = Column(Numeric(10, 2), default=0)
    sell_price = Column(Numeric(10, 2), default=0)
    location = Column(String(50))
    status = Column(String(20), default="Active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    movements = relationship("StockMovement", back_populates="item", cascade="all, delete-orphan")


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

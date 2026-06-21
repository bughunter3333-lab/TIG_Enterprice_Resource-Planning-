from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import Base


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(String(20), primary_key=True)
    supplier_id = Column(
        String(20), ForeignKey("suppliers.id"), nullable=True, index=True
    )
    supplier_name = Column(String(100))
    status = Column(String(20), default="Draft", index=True)
    order_date = Column(String(20))
    expected_date = Column(String(20))
    total = Column(Numeric(10, 2), default=0)
    total_ex = Column(Numeric(10, 2), default=0)
    tax_total = Column(Numeric(10, 2), default=0)
    total_inc = Column(Numeric(10, 2), default=0)
    bill_no = Column(String(50))
    due_date = Column(String(20))
    received_date = Column(String(20))
    notes = Column(String(500))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    items = relationship(
        "PurchaseOrderItem", back_populates="order", cascade="all, delete-orphan"
    )


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(String(20), ForeignKey("purchase_orders.id"), nullable=False)
    sku = Column(String(50))
    description = Column(String(255))
    qty_ordered = Column(Integer, default=0)
    qty_received = Column(Integer, default=0)
    unit_cost = Column(Numeric(10, 2), default=0)
    total = Column(Numeric(10, 2), default=0)

    order = relationship("PurchaseOrder", back_populates="items")

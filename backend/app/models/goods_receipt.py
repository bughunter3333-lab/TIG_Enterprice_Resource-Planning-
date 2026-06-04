from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import Base


class GoodsReceipt(Base):
    __tablename__ = "goods_receipts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    po_id = Column(String(20), ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True, index=True)
    supplier_id = Column(String(20), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True)
    supplier_name = Column(String(100))
    received_date = Column(String(20), nullable=False)
    reference = Column(String(50))
    # Pending → Inspecting → Accepted | Rejected
    status = Column(String(20), default="Pending", index=True)
    notes = Column(String(500))
    created_by = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    lines = relationship("GoodsReceiptLine", back_populates="receipt", cascade="all, delete-orphan")
    purchase_order = relationship("PurchaseOrder", foreign_keys=[po_id])


class GoodsReceiptLine(Base):
    __tablename__ = "goods_receipt_lines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    receipt_id = Column(Integer, ForeignKey("goods_receipts.id", ondelete="CASCADE"), nullable=False, index=True)
    sku = Column(String(50), nullable=False)
    description = Column(String(255))
    qty_expected = Column(Integer, default=0)
    qty_received = Column(Integer, default=0)
    unit_cost = Column(Numeric(10, 2), default=0)
    # Good | Damaged | Short | Surplus
    condition = Column(String(20), default="Good")
    notes = Column(String(255))

    receipt = relationship("GoodsReceipt", back_populates="lines")

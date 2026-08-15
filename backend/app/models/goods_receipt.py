from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import Base


class GoodsReceipt(Base):
    __tablename__ = "goods_receipts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    po_id = Column(
        String(20),
        ForeignKey("purchase_orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    supplier_id = Column(
        String(20),
        ForeignKey("suppliers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    supplier_name = Column(String(100))
    received_date = Column(String(20), nullable=False)
    reference = Column(String(50))
    # Pending → Inspecting → Accepted | Rejected
    status = Column(String(20), default="Pending", index=True)
    notes = Column(String(500))
    created_by = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    lines = relationship(
        "GoodsReceiptLine", back_populates="receipt", cascade="all, delete-orphan"
    )
    charges = relationship(
        "GoodsReceiptCharge", back_populates="receipt", cascade="all, delete-orphan"
    )
    purchase_order = relationship("PurchaseOrder", foreign_keys=[po_id])


class GoodsReceiptCharge(Base):
    """A landed cost on a receipt — freight, duty, customs, insurance.

    Apportioned across the received lines to turn Cost into COG (Jim2's
    Cost vs Cost of Goods distinction). See app/core/landed_cost.py.
    """

    __tablename__ = "goods_receipt_charges"

    id = Column(Integer, primary_key=True, autoincrement=True)
    receipt_id = Column(
        Integer,
        ForeignKey("goods_receipts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description = Column(String(100), nullable=False)
    amount = Column(Numeric(10, 2), default=0)
    # value = spread by line value (duty, insurance) | qty = per unit (freight)
    basis = Column(String(10), default="value")

    receipt = relationship("GoodsReceipt", back_populates="charges")


class GoodsReceiptLine(Base):
    __tablename__ = "goods_receipt_lines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    receipt_id = Column(
        Integer,
        ForeignKey("goods_receipts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sku = Column(String(50), nullable=False, index=True)
    description = Column(String(255))
    qty_expected = Column(Integer, default=0)
    qty_received = Column(Integer, default=0)
    unit_cost = Column(Numeric(10, 2), default=0)
    # Good | Damaged | Short | Surplus
    condition = Column(String(20), default="Good")
    notes = Column(String(255))

    receipt = relationship("GoodsReceipt", back_populates="lines")

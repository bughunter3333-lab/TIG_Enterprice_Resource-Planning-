from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, func
from app.database import Base


class SupplierBill(Base):
    __tablename__ = "supplier_bills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    supplier_id = Column(
        String(20), ForeignKey("suppliers.id"), nullable=True, index=True
    )
    supplier_name = Column(String(100))
    po_id = Column(
        String(20), ForeignKey("purchase_orders.id"), nullable=True, index=True
    )
    bill_number = Column(String(50))
    bill_date = Column(String(20))
    due_date = Column(String(20))
    description = Column(String(500))
    amount_ex = Column(Numeric(10, 2), default=0)
    tax = Column(Numeric(10, 2), default=0)
    amount_inc = Column(Numeric(10, 2), default=0)
    status = Column(String(20), default="pending", index=True)  # pending/approved/paid
    paid_date = Column(String(20))
    paid_amount = Column(Numeric(10, 2), default=0)
    notes = Column(String(500))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

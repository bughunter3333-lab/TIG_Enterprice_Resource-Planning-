from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import Base


class SupplierBill(Base):
    __tablename__ = "supplier_bills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    supplier_id = Column(
        String(20),
        ForeignKey("suppliers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    supplier_name = Column(String(100))
    po_id = Column(
        String(20),
        ForeignKey("purchase_orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    bill_number = Column(String(50))
    bill_date = Column(String(20))
    # Indexed: accounts payable ages bills by it.
    due_date = Column(String(20), index=True)
    description = Column(String(500))
    amount_ex = Column(Numeric(10, 2), default=0)
    tax = Column(Numeric(10, 2), default=0)
    amount_inc = Column(Numeric(10, 2), default=0)
    status = Column(String(20), default="pending", index=True)  # pending/approved/paid
    paid_date = Column(String(20))
    paid_amount = Column(Numeric(10, 2), default=0)
    notes = Column(String(500))
    # The ledger account the bill's cost posts to. Empty means "decide by kind":
    # a bill against a purchase order is cost of sales, anything else general
    # expenses. Without it rent, fuel and power all landed in one line of the P&L.
    account_id = Column(Integer, ForeignKey("ledger_accounts.id"), nullable=True)
    # A credit note — a bill for less than nothing — applied against one of the
    # supplier's bills, which is owed that much less (S2-09). Not a payment:
    # both are posted already, and the payable nets them; nothing is paid out.
    applied_to_bill_id = Column(
        Integer,
        ForeignKey("supplier_bills.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # The credit notes applied against this bill, and the bill a credit note
    # is applied to.
    credits = relationship(
        "SupplierBill", foreign_keys=[applied_to_bill_id], back_populates="applied_to"
    )
    applied_to = relationship(
        "SupplierBill",
        foreign_keys=[applied_to_bill_id],
        remote_side=[id],
        back_populates="credits",
    )

from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, func
from sqlalchemy.orm import backref, relationship
from app.database import Base


class SupplierBillPayment(Base):
    """One payment made against a supplier bill.

    A bill is often paid in more than one run. Each run is its own row, posted
    to the ledger on its own date; the bill's `paid_amount` is their sum. A
    single field overwritten on each payment is what lost the first $100 of a
    $184.25 bill paid in two runs.
    """

    __tablename__ = "supplier_bill_payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    bill_id = Column(
        Integer,
        ForeignKey("supplier_bills.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount = Column(Numeric(10, 2), nullable=False)
    paid_date = Column(String(20))  # YYYY-MM-DD
    reference = Column(String(100))  # EFT reference, cheque number
    paid_by = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bill = relationship(
        "SupplierBill",
        backref=backref(
            "payments",
            order_by="SupplierBillPayment.id",
            cascade="all, delete-orphan",
        ),
    )

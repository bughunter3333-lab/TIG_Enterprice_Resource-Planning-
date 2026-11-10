from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from app.database import Base


class CustomerCreditNote(Base):
    """A customer credit note — the ATO's adjustment note — against an invoice.

    docs/superpowers/specs/2026-11-09-returns-credit-notes.md. Applied to the
    invoice it is raised against up to what that invoice owes; the rest is
    credit on the customer's account, applied to a later invoice.
    """

    __tablename__ = "customer_credit_notes"

    # CN-0001, its own series.
    id = Column(String(20), primary_key=True)
    customer_id = Column(
        String(20), ForeignKey("customers.id"), nullable=False, index=True
    )
    # The invoice it credits.
    job_id = Column(String(20), ForeignKey("jobs.id"), nullable=False, index=True)
    credit_date = Column(String(10), nullable=False)  # ISO day
    reason = Column(Text)
    total_ex = Column(Numeric(10, 2), nullable=False, default=0)
    tax = Column(Numeric(10, 2), nullable=False, default=0)
    total_inc = Column(Numeric(10, 2), nullable=False, default=0)
    created_by = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    lines = relationship(
        "CreditNoteLine",
        back_populates="credit_note",
        cascade="all, delete-orphan",
        order_by="CreditNoteLine.id",
    )
    applications = relationship(
        "CreditNoteApplication",
        back_populates="credit_note",
        cascade="all, delete-orphan",
        order_by="CreditNoteApplication.id",
    )


class CreditNoteLine(Base):
    """One job line credited: how many, for how much, and whether the goods came
    back — and, for plain goods back, what inspection made of them."""

    __tablename__ = "credit_note_lines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    credit_note_id = Column(
        String(20),
        ForeignKey("customer_credit_notes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    job_item_id = Column(
        Integer, ForeignKey("job_items.id", ondelete="SET NULL"), nullable=True
    )
    # As the line read when credited: the job line may change or go later.
    stock_code = Column(String(50))
    description = Column(Text)
    qty = Column(Integer, nullable=False)
    total_ex = Column(Numeric(10, 2), nullable=False, default=0)
    tax = Column(Numeric(10, 2), nullable=False, default=0)
    total_inc = Column(Numeric(10, 2), nullable=False, default=0)
    # The goods came back; and they are plain, so they go into stock (RET).
    goods_back = Column(Boolean, nullable=False, default=False)
    restockable = Column(Boolean, nullable=False, default=False)
    # waiting · restocked · scrapped — only for plain goods back.
    inspection = Column(String(20))
    inspected_at = Column(DateTime(timezone=True))
    inspected_by = Column(String(100))

    credit_note = relationship("CustomerCreditNote", back_populates="lines")


class CreditNoteApplication(Base):
    """Credit used against an invoice: the one credited, or a later one."""

    __tablename__ = "credit_note_applications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    credit_note_id = Column(
        String(20),
        ForeignKey("customer_credit_notes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    job_id = Column(String(20), ForeignKey("jobs.id"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    # The day it was applied (ISO), as `credit_date`: aged receivables as at a
    # past day adds back credit applied after it, as it does payments.
    applied_on = Column(String(10), nullable=False)
    applied_by = Column(String(100))

    credit_note = relationship("CustomerCreditNote", back_populates="applications")

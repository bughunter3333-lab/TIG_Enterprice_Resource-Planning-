"""The general ledger: accounts, journal entries and their lines.

Design and the reasons behind it: docs/superpowers/specs/2026-09-25-general-ledger-design.md

Only posted entries exist. An entry is never edited or deleted once written; it
is corrected by a second entry that reverses it. Every write goes through
`app.core.ledger.post`, which is the only place the invariants are enforced —
nothing else in the codebase should construct these rows.
"""

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
    true,
)
from sqlalchemy.orm import relationship

from app.database import Base


class LedgerAccount(Base):
    """One account in the chart.

    `role` is how the posting code finds an account — "the receivables account",
    never "1100" — so accounts can be renumbered and renamed without breaking
    anything that posts to them. At most one account holds each role.
    """

    __tablename__ = "ledger_accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(20), nullable=False, unique=True, index=True)
    name = Column(String(100), nullable=False)
    # asset | liability | equity | income | cost_of_sales | expense
    category = Column(String(20), nullable=False)
    role = Column(String(40), nullable=True, unique=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default=true())
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class JournalEntry(Base):
    """A balanced set of lines, posted on one date.

    An entry made automatically belongs to the document that caused it —
    `source_type` and `source_id` name that document, and there is at most one
    unreversed entry per document. A reversing entry carries the same source,
    so the whole history of an invoice (posted, reversed, posted again) is one
    query.
    """

    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entry_date = Column(Date, nullable=False, index=True)
    memo = Column(String(255), nullable=True)
    # invoice | payment | bill | bill_payment | manual | opening
    source_type = Column(String(30), nullable=False, index=True)
    source_id = Column(String(40), nullable=True, index=True)
    reverses_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)
    reversed_by_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)
    created_by = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    lines = relationship(
        "JournalLine",
        back_populates="entry",
        order_by="JournalLine.id",
        cascade="all, delete-orphan",
    )


class JournalLine(Base):
    """One debit or one credit to one account.

    The check constraint holds the rule at the database as well as in the
    posting code: never negative, never both sides. `job_id` and `party_id` are
    plain references rather than foreign keys — the ledger is the record of what
    happened, and it has to outlive anything upstream being tidied away.
    """

    __tablename__ = "journal_lines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entry_id = Column(
        Integer,
        ForeignKey("journal_entries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    account_id = Column(
        Integer, ForeignKey("ledger_accounts.id"), nullable=False, index=True
    )
    debit = Column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    credit = Column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    description = Column(String(255), nullable=True)
    party_type = Column(String(20), nullable=True)  # customer | supplier
    party_id = Column(String(40), nullable=True, index=True)
    job_id = Column(String(20), nullable=True, index=True)

    entry = relationship("JournalEntry", back_populates="lines")
    account = relationship("LedgerAccount")

    __table_args__ = (
        CheckConstraint(
            "debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0)",
            name="ck_journal_lines_one_side",
        ),
    )

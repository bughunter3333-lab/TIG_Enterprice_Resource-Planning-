from sqlalchemy import Column, Integer, String, DateTime, func

from app.database import Base


class StockAuditEntry(Base):
    """One recorded change to a stock record — a field at a time.

    A row per field rather than per save, because the question people ask is
    "who moved this SKU out of B.3.H.1", not "who pressed Save on Tuesday". The
    values are stored as text so the same table can carry a bin, a zone and a
    max quantity without a column each; nothing computes on them, they are read.

    `branch` is null for a change to the item itself rather than to one of its
    branch positions, which is why it is the only nullable identifier here.
    """

    __tablename__ = "stock_audit"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(50), nullable=False, index=True)
    branch = Column(String(50), nullable=True)
    action = Column(String(20), nullable=False)  # created | updated | deleted
    field = Column(String(50), nullable=False)
    old_value = Column(String(255), nullable=True)
    new_value = Column(String(255), nullable=True)
    changed_by = Column(String(50), nullable=False)
    changed_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

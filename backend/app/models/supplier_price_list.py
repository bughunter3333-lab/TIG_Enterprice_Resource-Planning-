from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import Base


class SupplierPriceList(Base):
    __tablename__ = "supplier_price_lists"

    id = Column(Integer, primary_key=True, autoincrement=True)
    supplier_id = Column(
        String(20),
        ForeignKey("suppliers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sku = Column(String(50), nullable=False, index=True)
    description = Column(String(255))
    unit_cost = Column(Numeric(10, 2), nullable=False)
    min_qty = Column(Integer, default=1)
    currency = Column(String(10), default="AUD")
    lead_time_days = Column(Integer)
    valid_from = Column(String(20))
    valid_to = Column(String(20))
    notes = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    supplier = relationship("Supplier", back_populates="price_list")

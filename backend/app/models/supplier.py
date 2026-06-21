from sqlalchemy import Column, String, DateTime, Boolean, func
from sqlalchemy.orm import relationship
from app.database import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(String(20), primary_key=True)
    name = Column(String(100), nullable=False)
    contact = Column(String(100))
    email = Column(String(255))
    phone = Column(String(30))
    address = Column(String(255))
    abn = Column(String(20))
    gst_registered = Column(Boolean, default=True)
    payment_terms = Column(String(50))
    currency = Column(String(10), default="AUD")
    status = Column(String(20), default="Active", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    price_list = relationship(
        "SupplierPriceList",
        back_populates="supplier",
        cascade="all, delete-orphan",
        order_by="SupplierPriceList.sku",
    )

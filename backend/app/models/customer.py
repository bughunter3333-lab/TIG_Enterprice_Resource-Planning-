from sqlalchemy import Column, Integer, String, Numeric, DateTime, Boolean, func
from sqlalchemy.orm import relationship
from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    id = Column(String(20), primary_key=True)  # e.g. CUST001
    name = Column(String(100), nullable=False)
    contact = Column(String(100))
    email = Column(String(255))
    phone = Column(String(30))
    mobile = Column(String(30))
    address = Column(String(255))
    abn = Column(String(20))
    account_type = Column(String(30), default="Account")
    payment_terms = Column(String(30), default="Net 30")
    credit_limit = Column(Numeric(10, 2), default=0)
    balance = Column(Numeric(10, 2), default=0)
    ytd_sales = Column(Numeric(10, 2), default=0)
    account_manager = Column(String(100))
    customer_group = Column(String(50), default="General")
    territory = Column(String(50))
    credit_hold = Column(Boolean, default=False)
    gst_registered = Column(Boolean, default=True)
    status = Column(String(20), default="Active", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    ship_tos = relationship("CustomerShipTo", back_populates="customer", cascade="all, delete-orphan", order_by="CustomerShipTo.code")

from sqlalchemy import Column, Integer, String, Numeric, DateTime, func
from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    id = Column(String(20), primary_key=True)  # e.g. CUST001
    name = Column(String(100), nullable=False)
    contact = Column(String(100))
    email = Column(String(255))
    phone = Column(String(30))
    address = Column(String(255))
    account_type = Column(String(30), default="Account")
    credit_limit = Column(Numeric(10, 2), default=0)
    balance = Column(Numeric(10, 2), default=0)
    ytd_sales = Column(Numeric(10, 2), default=0)
    status = Column(String(20), default="Active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

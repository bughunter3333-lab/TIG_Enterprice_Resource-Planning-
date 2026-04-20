from sqlalchemy import Column, Integer, String, Numeric, DateTime, func
from app.database import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(String(20), primary_key=True)
    name = Column(String(100), nullable=False)
    contact = Column(String(100))
    email = Column(String(255))
    phone = Column(String(30))
    address = Column(String(255))
    payment_terms = Column(String(50))
    currency = Column(String(10), default="AUD")
    status = Column(String(20), default="Active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

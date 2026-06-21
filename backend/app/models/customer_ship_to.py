from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import Base


class CustomerShipTo(Base):
    __tablename__ = "customer_ship_tos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(
        String(20),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code = Column(String(20), nullable=False)
    name = Column(String(100))
    address = Column(String(255))
    city = Column(String(100))
    state = Column(String(50))
    postcode = Column(String(10))
    country = Column(String(50), default="Australia")
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer", back_populates="ship_tos")

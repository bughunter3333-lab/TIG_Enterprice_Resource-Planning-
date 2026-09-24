from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship
from app.database import Base


class CustomerShipTo(Base):
    __tablename__ = "customer_ship_tos"
    # Declared so the model describes the database. It was created by
    # i3j4k5l6m7n8 but never written here, so autogenerate read its absence as
    # an instruction and proposed dropping it — which would let one customer
    # hold two sites under the same ship code.
    __table_args__ = (
        UniqueConstraint("customer_id", "code", name="uq_customer_ship_tos_code"),
    )

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

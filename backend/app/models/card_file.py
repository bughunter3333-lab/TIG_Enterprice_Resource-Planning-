from sqlalchemy import Column, String, Text, DateTime, func
from app.database import Base


class CardFile(Base):
    __tablename__ = "card_files"

    ship_code = Column(String(30), primary_key=True)      # e.g. RESP.SYD
    customer_code = Column(String(30), nullable=False)    # e.g. RESP.HO (billing account)
    company_name = Column(String(100))
    contact_name = Column(String(100))
    address1 = Column(String(255))
    address2 = Column(String(255))
    suburb = Column(String(100))
    state = Column(String(50))
    postcode = Column(String(10))
    country = Column(String(50), default='AU')
    phone = Column(String(30))
    email = Column(String(255))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

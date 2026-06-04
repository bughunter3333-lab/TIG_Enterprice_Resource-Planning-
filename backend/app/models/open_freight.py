from sqlalchemy import Column, Integer, String, Numeric, Text, DateTime, func
from app.database import Base


class OpenFreightAccount(Base):
    __tablename__ = "open_freight_account"

    id = Column(Integer, primary_key=True)
    account_number = Column(String(50))
    account_name = Column(String(100))
    depot = Column(String(100))
    contact_name = Column(String(100))
    contact_phone = Column(String(30))
    contact_email = Column(String(255))
    api_key = Column(String(255))
    notes = Column(Text)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class OpenFreightParcel(Base):
    __tablename__ = "open_freight_parcels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    parcel_type = Column(String(30))       # Satchel, Box, Envelope, Pallet, Other
    service = Column(String(50))           # Standard, Express, Overnight
    carrier_code = Column(String(50))
    max_weight_kg = Column(Numeric(8, 3))
    length_cm = Column(Numeric(8, 1))
    width_cm = Column(Numeric(8, 1))
    height_cm = Column(Numeric(8, 1))
    rate = Column(Numeric(10, 2))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

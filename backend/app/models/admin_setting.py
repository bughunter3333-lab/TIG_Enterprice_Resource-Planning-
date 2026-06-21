from sqlalchemy import Column, String, Text, DateTime, func

from app.database import Base


class AdminSetting(Base):
    __tablename__ = "admin_settings"
    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

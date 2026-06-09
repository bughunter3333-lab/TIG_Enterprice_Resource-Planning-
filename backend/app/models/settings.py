from sqlalchemy import Column, Integer, String, Numeric, Boolean, Text
from app.database import Base


class CompanySettings(Base):
    __tablename__ = "company_settings"
    id = Column(Integer, primary_key=True, default=1)
    company_name = Column(String(150), default="Total Image Group")
    abn = Column(String(20))
    address = Column(Text)
    phone = Column(String(30))
    email = Column(String(100))
    website = Column(String(100))
    gst_rate = Column(Numeric(5, 2), default=10.0)
    invoice_prefix = Column(String(10), default="INV")
    quote_prefix = Column(String(10), default="QT")
    bank_name = Column(String(100))
    bank_bsb = Column(String(10))
    bank_account = Column(String(20))
    bank_account_name = Column(String(100))
    payment_terms_default = Column(String(50), default="Net 30")
    smtp_host = Column(String(100))
    smtp_port = Column(Integer, default=587)
    smtp_user = Column(String(100))
    smtp_password = Column(String(200))
    smtp_from_name = Column(String(100), default="Total Image Group")
    smtp_use_tls = Column(Boolean, default=True)
    tyro_merchant_id = Column(String(100))
    tyro_terminal_id = Column(String(100))
    tyro_environment = Column(String(20), default='sandbox')


class EmailLog(Base):
    __tablename__ = "email_log"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sent_at = Column(String(30))
    to_email = Column(String(200))
    subject = Column(String(200))
    job_id = Column(String(20))
    email_type = Column(String(20))   # invoice / quote / reminder / statement
    status = Column(String(20))       # sent / failed
    error = Column(Text)
    sent_by = Column(String(50))

from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import Base


class JobPayment(Base):
    __tablename__ = "job_payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(20), ForeignKey("jobs.id"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    method = Column(String(50), default="Account")  # EFT / Cash / Card / Account / etc.
    reference = Column(String(100))  # cheque no., EFT ref, etc.
    received_date = Column(String(20))  # YYYY-MM-DD
    received_by = Column(String(100))
    notes = Column(String(500))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    job = relationship("Job", backref="payments")

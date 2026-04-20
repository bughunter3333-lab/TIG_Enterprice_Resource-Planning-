from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from app.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(20), primary_key=True)
    customer_id = Column(String(20), ForeignKey("customers.id"), nullable=False)
    customer_name = Column(String(100))
    status = Column(String(20), nullable=False, default="QUOTE")
    invoice = Column(String(20))
    date_in = Column(String(20))
    due = Column(String(40))
    out = Column(String(20))
    quote = Column(String(50))
    priority = Column(String(20), default="Normal")
    type = Column(String(20), default="Normal")
    assigned_to = Column(String(50))
    total_ex = Column(Numeric(10, 2), default=0)
    total_inc = Column(Numeric(10, 2), default=0)
    deposit = Column(Numeric(10, 2), default=0)
    balance_due = Column(Numeric(10, 2), default=0)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    items = relationship("JobItem", back_populates="job", cascade="all, delete-orphan")
    comments = relationship("JobComment", back_populates="job", cascade="all, delete-orphan", order_by="JobComment.id")


class JobItem(Base):
    __tablename__ = "job_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(20), ForeignKey("jobs.id"), nullable=False)
    description = Column(Text)
    sizes = Column(String(255))
    stock_code = Column(String(50))
    order_qty = Column(Integer, default=0)
    supply_qty = Column(Integer, default=0)
    qty = Column(Integer, default=0)
    price_ex = Column(Numeric(10, 2), default=0)
    price_inc = Column(Numeric(10, 2), default=0)
    total = Column(Numeric(10, 2), default=0)

    job = relationship("Job", back_populates="items")


class JobComment(Base):
    __tablename__ = "job_comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(20), ForeignKey("jobs.id"), nullable=False)
    date = Column(String(20))
    time = Column(String(10))
    initials = Column(String(10))
    status = Column(String(20))
    comment = Column(Text)

    job = relationship("Job", back_populates="comments")

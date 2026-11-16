from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.database import Base


class DispatchSession(Base):
    """A recorded despatch batch (Jim2 'Dispatch #'): who went out, when, how.

    The autoincrement id IS the Dispatch # shown to users; sessions are
    reviewable and exportable after the fact.
    """

    __tablename__ = "dispatch_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    lines = relationship(
        "DispatchSessionLine", back_populates="session", cascade="all, delete-orphan"
    )


class DispatchSessionLine(Base):
    __tablename__ = "dispatch_session_lines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(
        Integer, ForeignKey("dispatch_sessions.id"), nullable=False, index=True
    )
    job_id = Column(String(20), ForeignKey("jobs.id"), nullable=False)
    customer_name = Column(String(255), nullable=True)
    ship_via = Column(String(100), nullable=True)
    ship_ref = Column(String(100), nullable=True)
    cartons = Column(Integer, default=1)
    # Where it went, as it stood on the day: the job's ship-to code and the
    # address. A job's ship-to can be changed afterwards; a despatch cannot.
    ship_to = Column(String(100), nullable=True)
    address = Column(Text, nullable=True)
    # The day the consignment goes (ISO): today unless the despatch says
    # otherwise — after the carrier's cut-off it goes tomorrow (S2-20, B1-07).
    despatch_date = Column(String(20), nullable=True)

    session = relationship("DispatchSession", back_populates="lines")
    items = relationship(
        "DispatchLineItem",
        back_populates="session_line",
        cascade="all, delete-orphan",
        order_by="DispatchLineItem.id",
    )


class DispatchLineItem(Base):
    """What one despatch of a job sent of one of its lines (F21).

    The job line's picked and supplied quantities are running totals, so a
    further consignment's paperwork printed everything sent so far; this is
    what went in this one.
    """

    __tablename__ = "dispatch_line_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    dispatch_session_line_id = Column(
        Integer,
        ForeignKey("dispatch_session_lines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # A job line deleted after it went leaves the record of what went standing
    # rather than refusing the delete or losing the despatch.
    job_item_id = Column(
        Integer,
        ForeignKey("job_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    qty = Column(Integer, nullable=False)

    session_line = relationship("DispatchSessionLine", back_populates="items")

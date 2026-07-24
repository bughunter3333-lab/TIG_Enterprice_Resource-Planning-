from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
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

    session = relationship("DispatchSession", back_populates="lines")

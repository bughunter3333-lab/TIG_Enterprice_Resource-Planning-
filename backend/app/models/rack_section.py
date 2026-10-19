from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.database import Base


class RackSection(Base):
    """A stretch of one rack face marked for a customer.

    "Bays 3-7 of aisle B belong to Zone Bowling": a rectangle on a single face
    of an aisle, held as its two opposite corners. Odd bays are on one side of
    an aisle and even bays face them, so both bays of a section have the same
    parity. Along the face a box is placed by (bay, position) compared as a
    pair; levels are letters counted up from the floor, shorter runs first.

    A stored row is always smallest corner first — (bay_from, position_from) <=
    (bay_to, position_to), level_from <= level_to — so two sections can be
    compared without working out which way round each was drawn.
    """

    __tablename__ = "rack_sections"
    # The overlap rule is checked before a row is stored, which two saves at
    # the same moment can both pass. The database holds the part of it that it
    # can: no two sections start at the same box, so the same save sent twice
    # is stored once.
    __table_args__ = (
        UniqueConstraint(
            "branch",
            "aisle",
            "bay_from",
            "position_from",
            "level_from",
            name="uq_rack_sections_start",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    branch = Column(String(20), nullable=False, index=True)
    customer_id = Column(
        String(20),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    aisle = Column(String(10), nullable=False)
    bay_from = Column(Integer, nullable=False)
    position_from = Column(Integer, nullable=False)
    bay_to = Column(Integer, nullable=False)
    position_to = Column(Integer, nullable=False)
    level_from = Column(String(2), nullable=False)
    level_to = Column(String(2), nullable=False)
    created_by = Column(String(100), nullable=True)  # username of who marked it
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer", back_populates="rack_sections")

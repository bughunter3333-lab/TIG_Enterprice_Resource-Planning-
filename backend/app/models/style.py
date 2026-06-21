from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    DateTime,
    ForeignKey,
    Boolean,
    Text,
    func,
)
from sqlalchemy.orm import relationship
from app.database import Base


class Style(Base):
    __tablename__ = "styles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    category = Column(String(100))
    brand = Column(String(100))
    gender = Column(String(20))
    season = Column(String(50))
    collection = Column(String(100))
    description = Column(Text)

    base_purchase_price = Column(Numeric(10, 2), default=0)
    base_sell_price = Column(Numeric(10, 2), default=0)
    gst_applicable = Column(Boolean, default=True)

    image_url = Column(String(500))
    notes = Column(Text)
    active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    colours = relationship(
        "StyleColour",
        back_populates="style",
        cascade="all, delete-orphan",
        order_by="StyleColour.sort_order",
    )
    sizes = relationship(
        "StyleSize",
        back_populates="style",
        cascade="all, delete-orphan",
        order_by="StyleSize.sort_order",
    )
    inventory_items = relationship("InventoryItem", back_populates="style")


class StyleColour(Base):
    __tablename__ = "style_colours"

    id = Column(Integer, primary_key=True, autoincrement=True)
    style_id = Column(Integer, ForeignKey("styles.id"), nullable=False)
    code = Column(String(20), nullable=False)
    name = Column(String(100), nullable=False)
    hex = Column(String(7))
    sort_order = Column(Integer, default=0)

    style = relationship("Style", back_populates="colours")


class StyleSize(Base):
    __tablename__ = "style_sizes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    style_id = Column(Integer, ForeignKey("styles.id"), nullable=False)
    code = Column(String(20), nullable=False)
    sort_order = Column(Integer, default=0)

    style = relationship("Style", back_populates="sizes")

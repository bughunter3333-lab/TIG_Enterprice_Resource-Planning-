from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class StockPriceLevel(Base):
    __tablename__ = "stock_price_levels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(
        String(50),
        ForeignKey("inventory.sku", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    price_level = Column(String(50), nullable=False)
    price_calc_method = Column(String(50), nullable=True, default="Fixed Price")
    base_pl = Column(String(50), nullable=True)
    currency = Column(String(10), nullable=True, default="AUD")
    tax_code = Column(String(10), nullable=True, default="G")

    breakpoints = relationship(
        "StockPriceBreakpoint", back_populates="level", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("sku", "price_level", name="uq_stock_price_levels_sku_level"),
    )


class StockPriceBreakpoint(Base):
    __tablename__ = "stock_price_breakpoints"

    id = Column(Integer, primary_key=True, autoincrement=True)
    price_level_id = Column(
        Integer, ForeignKey("stock_price_levels.id", ondelete="CASCADE"), nullable=False
    )
    min_qty = Column(Integer, nullable=False, default=0)
    price_ex = Column(Numeric(10, 4), nullable=False)
    price_inc = Column(Numeric(10, 4), nullable=False)
    pont_pct = Column(Numeric(5, 2), nullable=True)

    level = relationship("StockPriceLevel", back_populates="breakpoints")

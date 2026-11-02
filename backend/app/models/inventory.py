from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    DateTime,
    ForeignKey,
    Text,
    func,
    or_,
)
from sqlalchemy.orm import relationship
from app.database import Base

# A stock code kept for a charge rather than goods — freight, a set-up, a fee
# (S2-05). Jim2's Service and Non-Depleting types, and the seed data's Service
# category (FREIGHT, SETUP-SCRN). Such a line has no stock level: it is never
# short, so it is supplied in full and never reserved, bought, weighed, picked
# or listed as back-ordered. Read as goods, every job with a freight line sat
# on the buying list and printed 'Freight: 1 back-ordered' on its delivery note.
CHARGE_ITEM_TYPES = ("service", "non-depleting")
CHARGE_CATEGORY = "service"


def is_charge(item: "InventoryItem") -> bool:
    return (item.item_type or "").strip().lower() in CHARGE_ITEM_TYPES or (
        item.category or ""
    ).strip().lower() == CHARGE_CATEGORY


class InventoryItem(Base):
    __tablename__ = "inventory"

    sku = Column(String(50), primary_key=True)
    name = Column(String(255), nullable=False)
    category = Column(String(50))
    supplier = Column(String(100))
    stock = Column(Integer, default=0)
    min_stock = Column(Integer, default=0)
    reorder_qty = Column(Integer, default=0)
    on_order_qty = Column(Integer, default=0)
    weight_kg = Column(Numeric(8, 3), default=0)
    committed_qty = Column(Integer, default=0)
    unit_cost = Column(Numeric(10, 2), default=0)
    sell_price = Column(Numeric(10, 2), default=0)
    location = Column(String(50))
    status = Column(String(20), default="Active", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Jim2 item detail fields
    item_type = Column(String(30), nullable=True, default="Depleting")
    gl_group = Column(String(100), nullable=True)
    barcode = Column(String(100), nullable=True)
    buy_unit = Column(String(20), nullable=True)
    sell_unit = Column(String(20), nullable=True)
    buy_tax_pct = Column(Numeric(5, 2), nullable=True, default=10)
    sell_tax_pct = Column(Numeric(5, 2), nullable=True, default=10)

    # Cost tracking
    last_cost = Column(Numeric(10, 4), nullable=True)
    last_cog = Column(Numeric(10, 4), nullable=True)
    avg_cost = Column(Numeric(10, 4), nullable=True)
    avg_cog = Column(Numeric(10, 4), nullable=True)
    max_cog = Column(Numeric(10, 4), nullable=True)
    last_po_cogs = Column(Numeric(10, 4), nullable=True)
    avg_po_cogs = Column(Numeric(10, 4), nullable=True)
    last_ex = Column(Numeric(10, 4), nullable=True)
    last_effective_date = Column(String(20), nullable=True)
    price_template = Column(String(100), nullable=True)

    # Jim2 "Descriptions" tab — long-form text per SKU (nullable)
    desc_extended = Column(Text, nullable=True)
    desc_web = Column(Text, nullable=True)
    desc_care = Column(Text, nullable=True)

    # Variant matrix links (nullable — existing SKUs unaffected)
    style_id = Column(Integer, ForeignKey("styles.id"), nullable=True, index=True)
    colour_code = Column(String(20), nullable=True)
    size_code = Column(String(20), nullable=True)

    movements = relationship(
        "StockMovement", back_populates="item", cascade="all, delete-orphan"
    )
    style = relationship("Style", back_populates="inventory_items")

    @property
    def available_qty(self) -> int:
        return max(0, (self.stock or 0) - (self.committed_qty or 0))


def charge_condition():
    """`is_charge` in SQL, for a query over stock items."""
    return or_(
        func.lower(func.trim(InventoryItem.item_type)).in_(CHARGE_ITEM_TYPES),
        func.lower(func.trim(InventoryItem.category)) == CHARGE_CATEGORY,
    )


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(50), ForeignKey("inventory.sku"), nullable=False)
    date = Column(String(20))
    type = Column(String(30))  # e.g. Adjustment, Job Allocation, Purchase
    quantity = Column(Integer)
    reference = Column(String(50))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Jim2 links and location detail (all nullable — no breaking change)
    job_id = Column(String(20), ForeignKey("jobs.id"), nullable=True, index=True)
    po_id = Column(String(50), ForeignKey("purchase_orders.id"), nullable=True)
    po_line = Column(Integer, nullable=True)
    location_branch = Column(String(50), nullable=True)
    qty_bal = Column(Integer, nullable=True)
    pack_num = Column(String(50), nullable=True)
    bin = Column(String(50), nullable=True)
    link_tran_id = Column(Integer, ForeignKey("stock_movements.id"), nullable=True)
    link_gl = Column(String(50), nullable=True)

    item = relationship("InventoryItem", back_populates="movements")

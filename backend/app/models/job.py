from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from app.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(20), primary_key=True)
    customer_id = Column(String(20), ForeignKey("customers.id"), nullable=False, index=True)
    customer_name = Column(String(100))
    status = Column(String(30), nullable=False, default="QUOTE", index=True)
    invoice = Column(String(20))
    date_in = Column(String(20))
    due = Column(String(40))
    out = Column(String(20))
    quote = Column(String(50))
    priority = Column(String(20), default="Normal")
    type = Column(String(20), default="Normal")
    assigned_to = Column(String(50))
    total_ex = Column(Numeric(10, 2), default=0)
    tax = Column(Numeric(10, 2), default=0)
    total_inc = Column(Numeric(10, 2), default=0)
    deposit = Column(Numeric(10, 2), default=0)
    balance_due = Column(Numeric(10, 2), default=0)
    payment_method = Column(String(50), default="Account")
    shipping_address = Column(Text)
    notes = Column(Text)
    # Jim2 fields
    cust_ref = Column(String(100))
    our_ref = Column(String(100))
    description = Column(String(200))
    ship_to = Column(String(100))
    project_no = Column(String(50))
    serial_no = Column(String(100))
    name_contact = Column(String(100))
    # ERP enhancement fields
    payment_status = Column(String(20), default="unpaid")   # unpaid / partial / paid
    commitment_date = Column(String(20))                     # promised delivery date
    validity_date = Column(String(20))                       # quote expiry date
    locked = Column(Boolean, default=False)                  # prevent editing after approval
    invoice_status = Column(String(20), default="not_invoiced")  # not_invoiced / to_invoice / invoiced
    proof_status = Column(String(20), default="none")            # none / sent / approved / rejected
    proof_notes = Column(Text)
    # Production / dispatch
    branch = Column(String(50), default="HQ")
    ship_to_id = Column(Integer, ForeignKey("customer_ship_tos.id"), nullable=True)
    weight_total = Column(Numeric(8, 3), default=0)
    fuel_levy = Column(Numeric(10, 2), default=0)
    # Jim2 Sprint-2 fields
    price_level = Column(String(50))             # Retail / Trade / Wholesale / VIP / Cost
    acc_mgr = Column(String(100))                # account manager name or initials
    invoice_desc = Column(Text)                  # description printed on invoice
    ex_job_ref = Column(String(100))             # customer's own PO / reference number
    requested_by = Column(String(100))           # free-text person who placed the order
    lock_rate = Column(Boolean, default=False)   # lock exchange/pricing rate
    # Compliance / audit timestamps
    invoice_date = Column(String(20))
    payment_date = Column(String(20))
    dispatched_at = Column(String(20))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    items = relationship("JobItem", back_populates="job", cascade="all, delete-orphan")
    comments = relationship("JobComment", back_populates="job", cascade="all, delete-orphan", order_by="JobComment.id")
    # ship_to (str, above) is the Jim2 ship-to code; ship_to_address is the linked
    # CustomerShipTo record via ship_to_id. Distinct names so neither shadows the other.
    ship_to_address = relationship("CustomerShipTo", foreign_keys=[ship_to_id])


class JobItem(Base):
    __tablename__ = "job_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(20), ForeignKey("jobs.id"), nullable=False, index=True)
    sort = Column(Integer, default=0)
    display_type = Column(String(20), default="product")    # product / section / note
    description = Column(Text)
    sizes = Column(String(255))
    stock_code = Column(String(50), index=True)
    decoration_type = Column(String(30), default="None")    # None / EMB / TRS / Screen / DTF / DTG / Sub / Pad / Laser / Vinyl
    emb_code = Column(String(50))
    trs_code = Column(String(50))
    stitch_count = Column(Integer, nullable=True)           # EMB stitch count (pricing basis)
    color_count = Column(Integer, nullable=True)            # Screen/DTF/DTG color count
    dec_position = Column(String(30))                       # Chest / Back / L.Sleeve / etc.
    order_qty = Column(Integer, default=0)
    supply_qty = Column(Integer, default=0)
    qty = Column(Integer, default=0)
    b_ord = Column(Integer, default=0)
    qty_pick = Column(Integer, default=0)
    qty_delivered = Column(Integer, default=0)
    qty_invoiced = Column(Integer, default=0)
    weight_kg = Column(Numeric(8, 3), default=0)
    purchase_price = Column(Numeric(10, 2), default=0)
    margin = Column(Numeric(10, 2), default=0)
    margin_percent = Column(Numeric(5, 2), default=0)
    discount = Column(Numeric(5, 2), default=0)
    price_ex = Column(Numeric(10, 2), default=0)
    price_inc = Column(Numeric(10, 2), default=0)
    total = Column(Numeric(10, 2), default=0)
    hide = Column(Boolean, default=False)
    tax_type = Column(String(5))
    item_status = Column(String(30))
    po_no = Column(String(50), index=True)
    po_due = Column(String(20))

    job = relationship("Job", back_populates="items")


class JobComment(Base):
    __tablename__ = "job_comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(20), ForeignKey("jobs.id"), nullable=False, index=True)
    date = Column(String(20))
    time = Column(String(10))
    initials = Column(String(10))
    author_name = Column(String(100))
    status = Column(String(30))
    inc = Column(Boolean, default=False)
    is_internal = Column(Boolean, default=False)
    pinned_at = Column(DateTime(timezone=True))
    comment = Column(Text)

    job = relationship("Job", back_populates="comments")

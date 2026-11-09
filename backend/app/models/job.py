from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    exists,
    func,
    select,
)
from sqlalchemy.orm import column_property, relationship
from app.database import Base
from app.models.inventory import InventoryItem, charge_condition
from app.models.customer import Customer
from app.models.logo import Logo


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(20), primary_key=True)
    customer_id = Column(
        String(20), ForeignKey("customers.id"), nullable=False, index=True
    )
    customer_name = Column(String(100))
    status = Column(String(30), nullable=False, default="QUOTE", index=True)
    # When it came to its status: how long it has sat there is counted from
    # this (docs/superpowers/specs/2026-11-09-status-times.md).
    status_changed_at = Column(DateTime(timezone=True))
    invoice = Column(String(20))
    date_in = Column(String(20))
    due = Column(String(40))
    out = Column(String(20))
    quote = Column(String(50))
    priority = Column(String(20), default="Normal")
    # Normal, Branch or Employee (JIM7); `priority` is the urgency.
    order_category = Column(
        String(20), nullable=False, default="Normal", server_default="Normal"
    )
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
    # Jim2's Item#: NOP.ONLINE for a job the customer's employee raised through
    # the portal, SALE for one a person keyed. How the work arrived.
    item_no = Column(String(50), index=True)
    project_no = Column(String(50))
    serial_no = Column(String(100))
    name_contact = Column(String(100))
    # ERP enhancement fields
    payment_status = Column(String(20), default="unpaid")  # unpaid / partial / paid
    commitment_date = Column(String(20))  # promised delivery date
    validity_date = Column(String(20))  # quote expiry date
    locked = Column(Boolean, default=False)  # prevent editing after approval
    invoice_status = Column(
        String(20), default="not_invoiced"
    )  # not_invoiced / to_invoice / invoiced
    proof_status = Column(
        String(20), default="none"
    )  # none / sent / approved / rejected
    proof_notes = Column(Text)
    # Production / dispatch
    branch = Column(String(50), default="HQ")
    ship_to_id = Column(Integer, ForeignKey("customer_ship_tos.id"), nullable=True)
    weight_total = Column(Numeric(8, 3), default=0)
    fuel_levy = Column(Numeric(10, 2), default=0)
    # How it went and the consignment note, written when it is despatched. The
    # connote used to live only in a comment (F22).
    ship_via = Column(String(100))
    connote = Column(String(100))
    # The account that created the job. The portal may comment only on the
    # jobs it booked (F26).
    created_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Jim2 Sprint-2 fields
    price_level = Column(String(50))  # Retail / Trade / Wholesale / VIP / Cost
    acc_mgr = Column(String(100))  # account manager name or initials
    invoice_desc = Column(Text)  # description printed on invoice
    ex_job_ref = Column(String(100))  # customer's own PO / reference number
    requested_by = Column(String(100))  # free-text person who placed the order
    lock_rate = Column(Boolean, default=False)  # lock exchange/pricing rate
    # Compliance / audit timestamps
    invoice_date = Column(String(20))
    # The terms an invoice was issued on and the day it falls due by them,
    # stamped when it is invoiced: changing the customer's terms afterwards
    # used to re-date every open invoice (S2-13).
    invoice_terms = Column(String(30))
    invoice_due_date = Column(String(20))
    payment_date = Column(String(20))
    dispatched_at = Column(String(20))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # The token a client holds to prove which version of this job it edited.
    #
    # An integer, not `updated_at`. That column is a wall clock and it advances
    # about once every 10ms, so two saves landing inside one tick carried an
    # identical token and the second was accepted as current: 16 of 40
    # back-to-back stale saves went through when this was measured. A lock that
    # fails on simultaneous saves fails at the only thing it is for.
    #
    # The increment lives in the mapper rather than in a save path, so it fires
    # on every UPDATE of this row whichever endpoint issued it. A counter bumped
    # by hand in one endpoint would be precisely the shape of bug it exists to
    # prevent — and narrower than the `onupdate` above that it replaces.
    version = Column(Integer, nullable=False, default=1, server_default="1")

    __mapper_args__ = {"version_id_col": version}

    # In the order the job record shows them, so a line's number reads the same
    # on the record, the documents and the production board.
    items = relationship(
        "JobItem",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="(JobItem.sort, JobItem.id)",
    )
    comments = relationship(
        "JobComment",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="JobComment.id",
    )
    # ship_to (str, above) is the Jim2 ship-to code; ship_to_address is the linked
    # CustomerShipTo record via ship_to_id. Distinct names so neither shadows the other.
    ship_to_address = relationship("CustomerShipTo", foreign_keys=[ship_to_id])
    # The customer's watchout, read with the job, never copied onto it: a
    # change on the customer shows on every job for them at once.
    customer_watchout = column_property(
        select(Customer.watchout)
        .where(Customer.id == customer_id)
        .correlate_except(Customer)
        .scalar_subquery()
    )


class JobItem(Base):
    __tablename__ = "job_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(20), ForeignKey("jobs.id"), nullable=False, index=True)
    sort = Column(Integer, default=0)
    display_type = Column(String(20), default="product")  # product / section / note
    description = Column(Text)
    sizes = Column(String(255))
    stock_code = Column(String(50), index=True)
    decoration_type = Column(
        String(30), default="None"
    )  # None / EMB / TRS / Screen / DTF / DTG / Sub / Pad / Laser / Vinyl
    emb_code = Column(String(50))
    trs_code = Column(String(50))
    # Generic decoration code — works for any method (EMB/TRS/SP/DTF/…).
    # emb_code/trs_code are kept for back-compat with existing rows.
    dec_code = Column(String(100))
    stitch_count = Column(Integer, nullable=True)  # EMB stitch count (pricing basis)
    color_count = Column(Integer, nullable=True)  # Screen/DTF/DTG color count
    dec_position = Column(String(30))  # Chest / Back / L.Sleeve / etc.
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
    # Priced inc GST — the online store's shelf price: the line totals its
    # price_inc to the cent, and price_ex is only that price less GST, shown
    # (S2-08, `core/job_totals.py`).
    priced_inc = Column(Boolean, default=False)
    total = Column(Numeric(10, 2), default=0)
    hide = Column(Boolean, default=False)
    tax_type = Column(String(5))
    item_status = Column(String(30))
    # Where the garment is on the floor, once handed off on the production
    # board: its lane (picking, embroidery, print, packing, decorator:<id>),
    # the person given it, and when. Never the job's status (owner decision
    # 2026-11-07, docs/superpowers/specs/2026-11-07-production-board.md).
    station = Column(String(40))
    station_holder = Column(String(50))
    station_at = Column(DateTime(timezone=True))
    po_no = Column(String(50), index=True)
    po_due = Column(String(20))
    # A decoration line points at the logo it applies; a decoration or an
    # alteration points at the garment line it is done to (owner decision
    # 2026-10-25, findings F09, F12, F19). Either makes the line a service:
    # supplied in full, never bought, reserved, picked or shipped as stock.
    logo_id = Column(
        Integer, ForeignKey("logos.id", ondelete="SET NULL"), nullable=True, index=True
    )
    applies_to_item_id = Column(
        Integer, ForeignKey("job_items.id", ondelete="SET NULL"), nullable=True
    )
    # Read from the logo, never stored on the line: the proof is the logo's,
    # approved once for every job, and the job page used to keep its own copy
    # that the logo's approval never reached (F31). None on a line with no logo.
    logo_code = column_property(
        select(Logo.code)
        .where(Logo.id == logo_id)
        .correlate_except(Logo)
        .scalar_subquery()
    )
    logo_proof_status = column_property(
        select(Logo.proof_status)
        .where(Logo.id == logo_id)
        .correlate_except(Logo)
        .scalar_subquery()
    )

    # Its code is a stock item kept for a charge — freight, a set-up, a fee —
    # not goods (S2-05, `models.inventory.is_charge`). Read with the line, and
    # again after any flush that touches it, so a recoded line reads its new
    # code once flushed.
    is_charge = column_property(
        exists()
        .where(InventoryItem.sku == stock_code, charge_condition())
        .correlate_except(InventoryItem)
    )

    job = relationship("Job", back_populates="items")

    @property
    def is_service(self) -> bool:
        return (
            self.logo_id is not None
            or self.applies_to_item_id is not None
            or bool(self.is_charge)
        )


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

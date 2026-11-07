import hashlib

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, cast, Integer, text
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import List, Literal, Optional
from datetime import date, datetime, timedelta, timezone

from app.database import get_db
from app.core import (
    despatch_documents,
    invoice_numbers,
    job_totals,
    job_weight,
    payment_terms,
)
from app.core.reservations import (
    COMMITTED_STATUSES,
    FINISHED_STATUSES,
    committed_total,
)
from app.core.stock_location import DEFAULT_BRANCH
from app.core.stock_ledger import post_movement, reverse_job_movements
from app.core.ledger import LedgerError
from app.core.ledger_postings import has_posted_invoice, sync_invoice, sync_payment
from app.models.dispatch_session import (
    DispatchLineItem,
    DispatchSession,
    DispatchSessionLine,
)
from app.models.job import Job, JobItem, JobComment
from app.models.job_payment import JobPayment
from app.models.logo import Logo
from app.models.customer import Customer
from app.models.inventory import InventoryItem, StockMovement, is_charge
from app.models.settings import CompanySettings
from app.models.stock_pricing import StockPriceLevel
from app.core.dependencies import (
    SERVICE_ROLES,
    require_any,
    require_commenter,
    require_intake,
    require_staff,
)
from app.models.user import User

router = APIRouter(prefix="/jobs", tags=["jobs"])

# A field the server does not know is refused, not dropped: dropping it told
# the portal its data was saved when it was not — an alteration's link to its
# garment was lost that way (F10).
_KNOWN_FIELDS_ONLY = ConfigDict(extra="forbid")

# What the online store's portal books its orders as. TIG confirms them.
PORTAL_ITEM_NO = "NOP.ONLINE"
_PORTAL_STATUSES = ("New", "QUOTE")

# Jim2's order category, beside the urgency in `priority` (owner decision
# 2026-11-06, JIM7): a customer's order, a branch's, or an employee's own.
OrderCategory = Literal["Normal", "Branch", "Employee"]

VALID_STATUSES = {
    "QUOTE",
    "New",
    "ORDER",
    "In Progress",
    "PROOF",
    "Picked",
    "Inco/Pick",
    "PRINT",
    "ProdExt",
    "Pick/Pack",
    "Desp/Ready",
    "FINISH",
    "Ready",
    "INVOICE",
    "PAID",
    "CANCEL",
}

# Production, in order — TIG's own ladder (docs/superpowers/specs/
# 2026-11-07-tig-status-ladder.md). `New` is shown as Booked and `ORDER` as
# Confirmed; the stored values stay. Picked and Inco/Pick (part picked, the
# rest waiting on stock) come before PRINT, so garments are picked while the
# proof is out; ProdExt (out at an external decorator) comes after it, so no
# logo leaves unapproved. Desp/Ready is packed and waiting for the carrier;
# FINISH is gone (F30); Ready is FINISH checked by a person, ready to invoice.
# A job moves forward to any later step — one that needs no proof skips PROOF,
# one with no decoration goes from ORDER straight to Pick/Pack, as TIG does in
# bulk — and back a step to put a mistake right.
PRODUCTION_LADDER = (
    "ORDER",
    "In Progress",
    "PROOF",
    "Picked",
    "Inco/Pick",
    "PRINT",
    "ProdExt",
    "Pick/Pack",
    "Desp/Ready",
    "FINISH",
    "Ready",
)

# Back a step means back to the step it most likely came from: a step that
# is often skipped going forward brings the ones before it into reach.
_BACK_A_STEP: dict[str, set[str]] = {
    "ORDER": {"QUOTE", "New"},
    "In Progress": {"ORDER"},
    "PROOF": {"In Progress"},
    "Picked": {"PROOF", "In Progress", "ORDER"},
    # Inco/Pick is often reached straight from before Picked (the pick panel
    # marks a part pick), so it reaches back as far as Picked does.
    "Inco/Pick": {"Picked", "PROOF", "In Progress", "ORDER"},
    "PRINT": {"Inco/Pick", "Picked", "PROOF", "In Progress"},
    "ProdExt": {"PRINT", "Inco/Pick", "Picked"},
    # An undecorated job comes to packing from picking; packing that finds a
    # short goes back to Picked or Inco/Pick.
    "Pick/Pack": {"ProdExt", "PRINT", "Inco/Pick", "Picked"},
    "Desp/Ready": {"Pick/Pack"},
    "FINISH": {"Desp/Ready", "Pick/Pack"},
    "Ready": {"FINISH"},
}


def _ladder() -> dict[str, set[str]]:
    moves: dict[str, set[str]] = {
        "QUOTE": {*PRODUCTION_LADDER, "New", "CANCEL"},
        "New": {*PRODUCTION_LADDER, "QUOTE", "CANCEL"},
        # Invoicing is from FINISH or Ready only: the goods have gone.
        "INVOICE": {"PAID", *FINISHED_STATUSES, "CANCEL"},
        "PAID": {"CANCEL"},
        "CANCEL": {"QUOTE"},
    }
    for n, step in enumerate(PRODUCTION_LADDER):
        moves[step] = {*PRODUCTION_LADDER[n + 1 :], *_BACK_A_STEP[step], "CANCEL"}
    # Straight to PAID is a cash sale: invoiced and paid in the one move, and
    # the transition invoices it on the way (stamps, numbers and posts it).
    # The payment is recorded first, as for any job (`_validate_required_fields`).
    for finished in FINISHED_STATUSES:
        moves[finished] |= {"INVOICE", "PAID"}
    return moves


# Key = current status, value = the statuses it may move to. Everyone keeps to
# it; an admin may also go further back within production (`_validate_transition`).
ALLOWED_TRANSITIONS: dict[str, set[str]] = _ladder()

# A job is despatched once it is packed. Invoiced jobs are here too: a job can
# be invoiced before the carrier collects it.
DESPATCHABLE_STATUSES = frozenset(
    {"Pick/Pack", "Desp/Ready", *FINISHED_STATUSES, "INVOICE", "PAID"}
)

# Fields that must be present when moving to certain statuses. The invoice
# number is not among them: invoicing a job without one issues the next
# (app/core/invoice_numbers.py).
REQUIRED_FIELDS_FOR_STATUS: dict[str, list[tuple[str, str]]] = {
    "ORDER": [("customer_id", "Customer must be set before converting to ORDER")],
}

# Who may put a job into, or take it out of, being invoiced. Overseas staff move
# jobs through production; invoicing posts to the ledger and changes what the
# customer owes, so it is for the same roles that take payments (finding F23).
_INVOICING_ROLES = frozenset(require_staff.roles)

# Before an order exists: nothing is reserved and nothing is owed.
_PRE_ORDER_STATUSES = frozenset({"QUOTE", "New", "CANCEL"})


# ── Pydantic schemas ──────────────────────────────────────────────────────────


class JobItemSchema(BaseModel):
    model_config = _KNOWN_FIELDS_ONLY

    # Present on a line that already exists, so a save can update it in place
    # rather than replacing it with a new row. Absent on lines being added.
    id: Optional[int] = None
    sort: int = 0
    display_type: str = "product"
    description: Optional[str] = None
    sizes: Optional[str] = None
    stock_code: Optional[str] = None
    decoration_type: str = "None"
    emb_code: Optional[str] = None
    trs_code: Optional[str] = None
    dec_code: Optional[str] = None
    stitch_count: Optional[int] = None
    color_count: Optional[int] = None
    dec_position: Optional[str] = None
    # Never below zero (S2-07): a -1 line keyed for a return reserved -1, so
    # every availability check saw a unit that does not exist, and restocked
    # nothing. A return is not a negative order.
    order_qty: int = Field(0, ge=0)
    # None means "work it out"; 0 means "supply nothing from stock", which is a
    # real choice on a line that is entirely bought in. The job form always
    # sends both, so this only affects callers that omit them.
    supply_qty: Optional[int] = Field(None, ge=0)
    qty: int = Field(0, ge=0)
    b_ord: Optional[int] = Field(None, ge=0)
    qty_pick: int = 0
    qty_delivered: int = 0
    qty_invoiced: int = 0
    weight_kg: float = 0
    purchase_price: float = 0
    margin: float = 0
    margin_percent: float = 0
    discount: float = 0
    price_ex: float = 0
    price_inc: float = 0
    total: float = 0
    hide: bool = False
    tax_type: Optional[str] = None
    item_status: Optional[str] = None
    po_no: Optional[str] = None
    po_due: Optional[str] = None
    # The logo this line applies. A line whose stock code is a logo's code
    # finds it without this.
    logo_id: Optional[int] = None
    # The line this one is done to — a decoration or an alteration of a
    # garment. By id on a line that exists, or by the target's `sort` when the
    # lines are sent together and have no ids yet (`applies_to_line`).
    applies_to_item_id: Optional[int] = None
    applies_to_line: Optional[int] = None


class _JobSharedFields(BaseModel):
    model_config = _KNOWN_FIELDS_ONLY

    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    date_in: Optional[str] = None
    type: Optional[str] = None
    quote: Optional[str] = None
    invoice: Optional[str] = None
    due: Optional[str] = None
    out: Optional[str] = None
    priority: Optional[str] = None
    order_category: Optional[OrderCategory] = None
    assigned_to: Optional[str] = None
    total_ex: Optional[float] = None
    tax: Optional[float] = None
    total_inc: Optional[float] = None
    deposit: Optional[float] = None
    balance_due: Optional[float] = None
    payment_method: Optional[str] = None
    shipping_address: Optional[str] = None
    notes: Optional[str] = None
    # Jim2 fields
    cust_ref: Optional[str] = None
    our_ref: Optional[str] = None
    description: Optional[str] = None
    ship_to: Optional[str] = None
    # Jim2's Item#: NOP.ONLINE for a portal order, SALE for one keyed by hand.
    item_no: Optional[str] = None
    project_no: Optional[str] = None
    serial_no: Optional[str] = None
    name_contact: Optional[str] = None
    # ERP enhancement fields
    payment_status: Optional[str] = None
    commitment_date: Optional[str] = None
    validity_date: Optional[str] = None
    locked: Optional[bool] = None
    invoice_status: Optional[str] = None
    proof_status: Optional[str] = None
    proof_notes: Optional[str] = None
    # Production / dispatch fields
    branch: Optional[str] = None
    ship_to_id: Optional[int] = None
    weight_total: Optional[float] = None
    fuel_levy: Optional[float] = None
    # Jim2 Sprint-2 fields
    price_level: Optional[str] = None
    acc_mgr: Optional[str] = None
    invoice_desc: Optional[str] = None
    ex_job_ref: Optional[str] = None
    requested_by: Optional[str] = None
    lock_rate: Optional[bool] = None

    @field_validator("branch")
    @classmethod
    def _blank_branch_is_hq(cls, value: Optional[str]) -> Optional[str]:
        # Null, which every derived figure reads as HQ. '' was stored as a branch
        # of its own: the reservation stayed at HQ while the derived committed
        # figure moved to '' (F14).
        return value if value is None or value.strip() else None


class JobCreate(_JobSharedFields):
    id: Optional[str] = None
    customer_id: str
    customer_name: Optional[str] = None
    status: str = "QUOTE"
    date_in: Optional[str] = None
    quote: Optional[str] = None
    priority: str = "Normal"
    order_category: OrderCategory = "Normal"
    type: str = "Normal"
    total_ex: float = 0
    tax: float = 0
    total_inc: float = 0
    deposit: float = 0
    balance_due: float = 0
    payment_method: Optional[str] = "Account"
    payment_status: str = "unpaid"
    locked: bool = False
    invoice_status: str = "not_invoiced"
    items: List[JobItemSchema] = Field(default_factory=list)


class JobUpdate(_JobSharedFields):
    status: Optional[str] = None
    items: Optional[List[JobItemSchema]] = None


class StatusUpdate(BaseModel):
    model_config = _KNOWN_FIELDS_ONLY

    status: str
    # Invoicing goods the system says do not exist is refused by default. A
    # wrong count is ordinary, so it can be accepted deliberately, and the
    # acceptance is written onto the job.
    allow_negative_stock: bool = False


class CommentCreate(BaseModel):
    model_config = _KNOWN_FIELDS_ONLY

    comment: str = Field(min_length=1, max_length=4000)
    inc: bool = False
    is_internal: bool = False


class BulkStatusRequest(BaseModel):
    model_config = _KNOWN_FIELDS_ONLY

    job_ids: List[str] = Field(min_length=1)
    status: str
    allow_negative_stock: bool = False


class DuplicateRequest(BaseModel):
    """Overrides for the copy. Everything omitted carries over from the source."""

    model_config = _KNOWN_FIELDS_ONLY

    ship_to: Optional[str] = None
    ship_to_id: Optional[int] = None
    shipping_address: Optional[str] = None
    cust_ref: Optional[str] = None
    due: Optional[str] = None
    status: str = "QUOTE"


class LockToggle(BaseModel):
    model_config = _KNOWN_FIELDS_ONLY

    locked: bool


class PaymentCreate(BaseModel):
    model_config = _KNOWN_FIELDS_ONLY

    amount: float
    method: str = "EFT"
    reference: Optional[str] = None
    received_date: Optional[str] = None
    notes: Optional[str] = None


class DispatchRequest(BaseModel):
    model_config = _KNOWN_FIELDS_ONLY

    ship_via: str = Field(max_length=100)
    ship_ref: str = Field(max_length=100)
    cartons: int = Field(1, ge=1)
    notes: Optional[str] = None
    advance_status: bool = False
    # A job that has gone already goes again only when this says so: a further
    # consignment, such as back-ordered sizes following on (F22).
    again: bool = False
    # The day it goes, when not today — after the carrier's cut-off (B1-07).
    despatch_date: Optional[date] = None


# How far a despatch may be dated from today: a consignment recorded late, or
# booked for the next collection. Beyond that it is a typing slip (2062).
DESPATCH_DATE_BACK_DAYS = 30
DESPATCH_DATE_AHEAD_DAYS = 14


def despatch_day(value: Optional[date]) -> str:
    """The ISO day a despatch goes: today unless given, and within range.

    The screens send the browser's day. The API keeps UTC, which is a day
    behind Sydney until 10 or 11 in the morning, so the range allows a day
    either side of the server's today: a date the screen offers is never
    refused for it.
    """
    today = date.today()
    if value is None:
        return today.isoformat()
    if not (
        today - timedelta(days=DESPATCH_DATE_BACK_DAYS + 1)
        <= value
        <= today + timedelta(days=DESPATCH_DATE_AHEAD_DAYS + 1)
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                f"A despatch is dated within {DESPATCH_DATE_BACK_DAYS} days before "
                f"and {DESPATCH_DATE_AHEAD_DAYS} days after today, not {value}"
            ),
        )
    return value.isoformat()


class PickLine(BaseModel):
    model_config = _KNOWN_FIELDS_ONLY

    item_id: int
    qty_pick: int = Field(ge=0)


class PickRequest(BaseModel):
    model_config = _KNOWN_FIELDS_ONLY

    picks: List[PickLine]


# ── Helpers ───────────────────────────────────────────────────────────────────


def _validate_transition(job: "Job", new_status: str, current_user: "User") -> None:
    """Raise 422 if the status move is not on the ladder.

    Admins used to bypass it entirely, so an admin could take a quote straight
    to PAID. They keep to it like everyone; what an admin may also do is take a
    job further back through production than one step — never back across
    invoicing, which is what unprint is for.
    """
    allowed = ALLOWED_TRANSITIONS.get(job.status, set())
    if current_user.role == "admin" and job.status in PRODUCTION_LADDER:
        earlier = ("QUOTE", "New", *PRODUCTION_LADDER)
        allowed = allowed | set(earlier[: earlier.index(job.status)])
    if new_status not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot move from '{job.status}' to '{new_status}'. "
            f"Allowed next statuses: {', '.join(sorted(allowed)) or 'none'}.",
        )


def _validate_required_fields(job: "Job", new_status: str) -> None:
    """Raise 422 if required fields are missing for the target status."""
    for field, message in REQUIRED_FIELDS_FOR_STATUS.get(new_status, []):
        if not getattr(job, field, None):
            raise HTTPException(status_code=422, detail=message)
    if new_status in _DEPLETED_STATUSES and float(job.total_inc or 0) <= 0:
        raise HTTPException(
            status_code=422,
            detail="Job total must be greater than zero before invoicing",
        )
    # PAID says the payments cover the job. Moving there marked it paid and
    # recorded no payment, so a cash sale read PAID while the customer's
    # balance, receivables and the ledger all said it was owed in full. Money
    # comes in only by recording a payment, which works on a job not yet
    # invoiced too; the move to PAID then follows.
    owed = _owed_once_invoiced(job) if new_status == "PAID" else 0
    if owed > 0:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Job {job.id} still owes ${owed:.2f}. Record the payment first "
                "— a job is PAID once its payments cover it."
            ),
        )


def _owed_once_invoiced(job: "Job") -> float:
    """What the job owes on its invoice: its balance if it has one, else what
    invoicing it will set (`_stamp_invoiced`)."""
    if job.status in _DEPLETED_STATUSES:
        return float(job.balance_due or 0)
    return max(0.0, round(float(job.total_inc or 0) - float(job.deposit or 0), 2))


def _require_role_for(job: "Job", new_status: str, user: "User") -> None:
    """Invoicing, and taking a job back out of being invoiced, are staff work."""
    touches_invoice = (
        new_status in _DEPLETED_STATUSES or job.status in _DEPLETED_STATUSES
    )
    if touches_invoice and user.role not in _INVOICING_ROLES:
        raise HTTPException(
            status_code=403,
            detail=(
                "Invoicing a job, or moving an invoiced job, posts to the "
                "accounts — ask a staff member to do it."
            ),
        )


def _takes_an_order(old_status: str, new_status: str) -> bool:
    """Whether this move is the customer committing to buy.

    Not only QUOTE to ORDER: a job created straight into ORDER, copied into
    ORDER by Create Similar, or moved past ORDER in one step is an order just
    the same, and each of those used to skip the credit check (F27).
    """
    return old_status in _PRE_ORDER_STATUSES and new_status not in _PRE_ORDER_STATUSES


def _check_credit_limit(job: "Job", db: Session) -> None:
    """Raise 422 if this order would take the customer past their credit limit.

    What counts against the limit is what the customer owes on invoices, the
    orders they already have open, and this one. The customer balance is only
    the first of those — counting uninvoiced FINISH jobs in it was how the
    balance came to disagree with receivables (F06) — so open orders are added
    here, where they belong, instead.
    """
    if not job.customer_id:
        return
    # Locked for the check: two orders for one customer at the same moment
    # each left the other out of 'open orders', and both passed (F27).
    customer = (
        db.query(Customer)
        .filter(Customer.id == job.customer_id)
        .with_for_update()
        .first()
    )
    if not customer:
        return
    if customer.credit_hold:
        raise HTTPException(
            status_code=422, detail=f"Customer '{customer.name}' is on credit hold"
        )
    limit = float(customer.credit_limit or 0)
    if limit <= 0:
        return
    owing = float(customer.balance or 0)
    open_orders = float(
        db.query(func.coalesce(func.sum(Job.balance_due), 0))
        .filter(
            Job.customer_id == job.customer_id,
            Job.status.in_(list(COMMITTED_STATUSES)),
            Job.id != job.id,
        )
        .scalar()
        or 0
    )
    this_order = float(job.balance_due or 0)
    if owing + open_orders + this_order > limit:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Order would exceed credit limit of ${limit:.2f} "
                f"(owing ${owing:.2f}, open orders ${open_orders:.2f}, "
                f"this order ${this_order:.2f})"
            ),
        )
    # Jim2's "Ordered On Account - Proceed with order": the credit decision,
    # on the job's own trail, with the figures it was made on (F28).
    db.add(
        _system_comment(
            job,
            "Ordered on account — proceed with order "
            f"(owing ${owing:.2f}, open orders ${open_orders:.2f}, this order "
            f"${this_order:.2f}, limit ${limit:.2f})",
        )
    )


def _system_comment(job: "Job", text: str, by: Optional["User"] = None) -> "JobComment":
    """A line on the job's trail, by a person or by the system ('SYS')."""
    now = datetime.now()
    return JobComment(
        job_id=job.id,
        date=now.strftime("%d/%m/%Y"),
        time=now.strftime("%H:%M"),
        initials=_get_initials(by) if by is not None else "SYS",
        author_name=(by.full_name or by.username) if by is not None else "System",
        status=job.status,
        is_internal=True,
        comment=text,
    )


def _check_status_change(
    job: "Job",
    new_status: str,
    db: Session,
    by: "User",
    *,
    ladder: bool,
    credit: bool,
) -> None:
    """Everything that must hold before a job may move to `new_status`.

    One place, called by the transition itself, because each entry point used
    to carry its own copy and each copy left something out: despatch invoiced
    with no invoice checks (F05), the role gate let overseas staff invoice
    (F23), and creating, copying or importing a job checked nothing at all.
    """
    if new_status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")
    if ladder:
        _validate_transition(job, new_status, by)
    _require_role_for(job, new_status, by)
    _validate_required_fields(job, new_status)
    _require_approved_proofs(job, new_status)
    if credit and _takes_an_order(job.status, new_status):
        _check_credit_limit(job, db)


_PRINTED = PRODUCTION_LADDER[PRODUCTION_LADDER.index("PRINT") :]


def _require_approved_proofs(job: "Job", new_status: str) -> None:
    """A job goes to print only once each logo on it is approved (S2-15).

    It reached PRINT with its logo's proof never sent: nothing linked the
    production step to the logo master's approval. Checked on the way from
    anywhere before PRINT — a quote, a portal order, a job being created — to
    PRINT, past it or straight to invoiced: skipping forward does not skip it.
    Not on a job brought back, which was printed already. A logo is approved
    once, for every job (`POST /logos/{id}/proof`).
    """
    # Going out to an external decorator is checked from anywhere, printed or
    # not: the artwork leaves the building, and a logo whose artwork changed
    # while the job was at PRINT (`PATCH /logos/{id}` resets its proof)
    # or a logo line added after printing would go out unapproved.
    to_the_decorator = new_status == "ProdExt" and job.status != "ProdExt"
    printed_already = job.status in _PRINTED or job.status in _DEPLETED_STATUSES
    if not to_the_decorator and (
        printed_already
        or not (new_status in _PRINTED or new_status in _DEPLETED_STATUSES)
    ):
        return
    waiting = sorted(
        {
            item.logo_code or f"logo {item.logo_id}"
            for item in job.items
            if item.logo_id is not None and item.logo_proof_status != "approved"
        }
    )
    if waiting:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Job {job.id} cannot go to {new_status}: the proof of "
                f"{', '.join(waiting)} is not approved"
            ),
        )


def _total_from_lines(job: "Job", *, emptied: bool = False) -> None:
    """Set the job's totals from its lines — the server's figures, not the browser's.

    The header used to be whatever the caller sent, so a line added at despatch
    without resending the totals was never charged (F04). A job with no lines —
    a Jim2 import carries totals only — keeps the totals it has (nothing here
    takes them from a caller, `_HEADER_TOTALS`); one whose last line a save
    has just removed (`emptied`) totals zero, or it went on charging for lines
    it no longer has.
    """
    items = list(job.items)
    if not items:
        if emptied:
            job.total_ex = job.tax = job.total_inc = 0.0
        return
    for item in items:
        item.total = float(job_totals.line_total(item))
    totals = job_totals.from_lines(items)
    job.total_ex = float(totals.ex)
    job.tax = float(totals.tax)
    job.total_inc = float(totals.inc)


def _require_invoice_number_free(db: Session, number: Optional[str], job_id) -> None:
    holder = invoice_numbers.typed_holder(db, number, except_job_id=job_id)
    if holder is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Invoice number {number.strip()} is already on job {holder}",
        )


# Statuses where the stock has physically left the building. Depletion happens on
# the way in and is reversed on the way out, so a recalled invoice puts the goods
# back rather than leaving them written off.
_DEPLETED_STATUSES = {
    "INVOICE",
    "PAID",
}

# Fuel levy rate: 13% of freight (derived from sticky note: $30→$3.90, $20→$2.60, $15→$1.95)
_FUEL_LEVY_RATE = 0.13


def calculate_fuel_levy(freight_amount: float) -> float:
    """Return fuel levy rounded to 2 decimal places at the sliding rate."""
    if freight_amount <= 0:
        return 0.0
    return round(freight_amount * _FUEL_LEVY_RATE, 2)


def _reserved_by_sku(job: "Job") -> dict[str, int]:
    """What the job reserves: what its lines supply from stock, per SKU.

    Supply, not the order quantity. The back-ordered part of a line is not on
    the shelf to reserve — it is being bought — and reserving it gave a stored
    commitment for goods that were not there, so the Committed movement said 3
    while every screen that derives the figure said 2 (F14).
    """
    reserved: dict[str, int] = {}
    for item in job.items:
        if not _is_stock_line(item):
            continue
        qty = int(item.supply_qty or 0)
        if qty > 0:
            reserved[item.stock_code] = reserved.get(item.stock_code, 0) + qty
    return reserved


def _post_reservation(job: "Job", db: Session, changes: dict[str, int]) -> None:
    """Post signed reservation changes, one movement per SKU."""
    today = datetime.now().strftime("%Y-%m-%d")
    for sku, delta in sorted(changes.items()):
        if not delta:
            continue
        # The reservation belongs to the branch that will ship it.
        post_movement(
            db,
            sku=sku,
            movement_type="Committed" if delta > 0 else "Released",
            branch=job.branch,
            committed=delta,
            date=today,
            reference=job.id,
            job_id=job.id,
            notes=f"{'Committed for' if delta > 0 else 'Released from'} Job {job.id}",
        )


def _move_reservation(job: "Job", db: Session, to_branch: Optional[str]) -> None:
    """Take an open order's reservation to the branch that will now ship it.

    Released where it was held and committed at the new branch, so the stored
    per-branch figure follows the job; a branch change used to leave it at the
    old branch, where nothing would ever release it (F14).
    """
    if (to_branch or DEFAULT_BRANCH) == (job.branch or DEFAULT_BRANCH):
        return
    held = _reserved_by_sku(job)
    _post_reservation(job, db, {sku: -qty for sku, qty in held.items()})
    job.branch = to_branch
    _post_reservation(job, db, held)


def _commit_job_stock(job: "Job", db: Session) -> None:
    """Reserve (commit) the stock this job supplies from the shelf."""
    _post_reservation(job, db, _reserved_by_sku(job))


def _release_job_stock(job: "Job", db: Session) -> None:
    """Release the stock this job had reserved."""
    _post_reservation(
        job, db, {sku: -qty for sku, qty in _reserved_by_sku(job).items()}
    )


def _deplete_on_hand(job: "Job", db: Session) -> None:
    """Goods physically leave on-hand stock when the job is invoiced (Jim2 model).
    Idempotent per job: a "Sale" movement already on the ledger means done."""
    already = (
        db.query(StockMovement)
        .filter(StockMovement.job_id == job.id, StockMovement.type == "Sale")
        .first()
    )
    if already:
        return
    today = datetime.now().strftime("%Y-%m-%d")
    for item in job.items:
        if not _is_stock_line(item):
            continue
        qty = item.supply_qty or 0  # only what was actually supplied from stock ships
        if qty <= 0:
            continue
        # Goods leave the branch that shipped them.
        post_movement(
            db,
            sku=item.stock_code,
            movement_type="Sale",
            branch=job.branch,
            quantity=-qty,
            date=today,
            reference=job.id,
            job_id=job.id,
            notes=f"Invoiced — shipped on Job {job.id}",
        )


def _restore_on_hand(job: "Job", db: Session) -> None:
    """Reverse invoice depletion (e.g. on unprint): add stock back, drop Sale rows."""
    reverse_job_movements(db, job_id=job.id, movement_type="Sale", branch=job.branch)


# A job stops being freely editable once it has been locked by hand, or once it
# has been invoiced — at that point its numbers are on a document the customer
# has, and the bookkeeper has taken them.
_SETTLED_STATUSES = frozenset({"INVOICE", "PAID"})


def _require_mutable(job: "Job", *, allow_settled: bool = False) -> None:
    """Refuse a write to a job that is locked or already invoiced.

    Both states were decorative. `locked` was written by its toggle and read
    nowhere, so the padlock in the UI promised a protection the server did not
    honour, and an invoiced job could be edited as freely as a quote.

    Two concrete harms, not hypotheticals. Depletion is idempotent per job — a
    Sale movement already on the ledger means done — so a line ADDED to an
    invoiced job never depletes, and the shelf count silently overstates by that
    line forever. And the customer's balance is recalculated only inside a
    status transition, so editing an invoiced job's totals leaves their AR
    saying something the invoice does not.

    `unprint` is the way back: it returns the job to FINISH and restores the
    stock properly. Pass `allow_settled` for the writers that are meant to work
    on an invoiced job — recording a payment, adding a comment, unprinting.
    """
    if job.locked:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "locked",
                "message": (
                    f"Job {job.id} is locked. Unlock it before making changes."
                ),
            },
        )
    if not allow_settled and job.status in _SETTLED_STATUSES:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "settled",
                "message": (
                    f"Job {job.id} is {job.status} and cannot be edited. "
                    "Unprint it first — that puts the stock back and returns it "
                    "to FINISH."
                ),
            },
        )


def job_version(job: "Job") -> str:
    """The token a client holds to say which version of a job it edited.

    Backed by `Job.version`, a counter the mapper increments on every UPDATE.
    It used to be `updated_at`, which is a wall clock with roughly 10ms of
    resolution — two saves inside one tick shared a token, so the second was
    read as current and overwrote the first. See the note on the column.
    """
    return str(job.version if job.version is not None else 1)


def _require_current_version(job: "Job", if_match: Optional[str]) -> None:
    """Refuse a save built on a version of the job that has since moved on.

    Saving overwrites the whole job, so without this two people editing the same
    job means the second save silently discards the first's work — no error, no
    trace, and the loser finds out when something they typed is missing.

    The check is opt-in: a client that sends no token is not held to one. That
    keeps every existing caller working, and means adopting it is a change to
    the client rather than a flag day.
    """
    if if_match is None:
        return
    current = job_version(job)
    if if_match.strip('"') != current:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "conflict",
                "message": (
                    "This job was changed by someone else while you were "
                    "editing it. Reload to see their changes before saving."
                ),
                "current_version": current,
            },
        )


def _is_stock_line(item: "JobItem") -> bool:
    """Goods: reserved, picked and shipped as stock.

    Not a decoration or alteration line — that is a service done to goods the
    job already has (`JobItem.is_service`), so nothing of it is held, bought or
    shipped, whatever its code.
    """
    return (
        bool(item.stock_code) and item.display_type == "product" and not item.is_service
    )


def _logo_for(db: Session, data: dict, customer_id: Optional[str]) -> Optional[Logo]:
    """The logo a line applies: one of the job's customer's active logos.

    Named by id, or found by the line's stock code. Any logo used to match, so
    a line took another customer's logo — its price, stitches and proof — or a
    retired one (F09), and the portal could read any logo's cost back (F26).
    The refusal does not say whether the logo exists for someone else.
    """
    theirs = db.query(Logo).filter(
        Logo.customer_id == customer_id, Logo.is_active.is_(True)
    )
    if data.get("logo_id"):
        logo = theirs.filter(Logo.id == data["logo_id"]).first()
        if logo is None:
            raise HTTPException(
                status_code=422,
                detail=f"No logo {data['logo_id']} for customer {customer_id}",
            )
        return logo
    code = (data.get("stock_code") or "").strip()
    if not code:
        return None
    return theirs.filter(func.lower(Logo.code) == code.lower()).first()


def _require_own_logos(db: Session, job: "Job", customer_id: Optional[str]) -> None:
    """A job for `customer_id` carries no other customer's logo lines (F09).

    `_logo_for` is asked only when a line is written, so moving a job to another
    customer kept the first customer's logo — its price, stitches and proof —
    on the new customer's job. The refusal names the lines to take off first.
    """
    ids = {item.logo_id for item in job.items if item.logo_id is not None}
    if not ids:
        return
    logos = {logo.id: logo for logo in db.query(Logo).filter(Logo.id.in_(ids))}
    foreign = [
        f"line {item.sort} ({logos[item.logo_id].code})"
        for item in sorted(job.items, key=lambda i: i.sort or 0)
        if item.logo_id in logos and logos[item.logo_id].customer_id != customer_id
    ]
    if foreign:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Job {job.id} carries another customer's logo on "
                f"{', '.join(foreign)} — take those lines off before moving it "
                f"to {customer_id}"
            ),
        )


def _require_no_retired_logo(db: Session, job: "Job") -> None:
    """Create Similar applies no retired logo (F09).

    `_logo_for` refuses one on a line written by hand; a copy took the source's
    logo as it stood, so new work went out with artwork the customer retired.
    """
    retired = [
        f"line {item.sort} ({logo.code})"
        for item in sorted(job.items, key=lambda i: i.sort or 0)
        if item.logo_id is not None
        and (logo := db.get(Logo, item.logo_id)) is not None
        and not logo.is_active
    ]
    if retired:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Job {job.id} applies a retired logo on {', '.join(retired)} — "
                "change those lines before copying it"
            ),
        )


def _from_logo(logo: Logo, line: dict, sent: set) -> dict:
    """What a line applying `logo` takes from it, where the line says nothing."""
    taken = {
        "logo_id": logo.id,
        "dec_code": line.get("dec_code") or logo.code,
        "dec_position": line.get("dec_position") or logo.position,
    }
    if line.get("decoration_type") in (None, "", "None"):
        taken["decoration_type"] = logo.decoration_type
    if line.get("stitch_count") is None:
        taken["stitch_count"] = logo.stitch_count
    if "price_ex" not in sent and "price_inc" not in sent:
        taken["price_ex"] = float(logo.price_ex or 0)
    if "purchase_price" not in sent:
        taken["purchase_price"] = float(logo.cost_ex or 0)
    return taken


def _new_line(
    line: "JobItemSchema",
    db: Session,
    customer_id: Optional[str],
    price_level: Optional[str] = None,
) -> "JobItem":
    """A new job line, as the server builds it — from the form, a portal or a script.

    A line carrying a logo's code applies that logo: it points at it, and takes
    its method, position, stitch count, price and cost unless the line says
    otherwise. That line, and one that applies to another line (an alteration),
    is a service: supplied in full, never back-ordered. A portal that does not
    know TIG's stock sent them with no supply or back-order, and they became
    garments to buy (F12).
    """
    data = line.model_dump(exclude={"id", "applies_to_line"})
    logo = _logo_for(db, data, customer_id)
    if logo is not None:
        data.update(_from_logo(logo, data, line.model_fields_set))
    _price_line(data, line.model_fields_set, db, price_level)
    # Set now: `is_charge` is read from the database, and a line not yet
    # flushed has none — its weight and what it may apply to are worked out
    # before then (the flush reads it again).
    charge = _is_charge_code(db, data.get("stock_code"))
    if (
        logo is not None
        or line.applies_to_line is not None
        or data.get("applies_to_item_id")
        or charge
    ):
        data["supply_qty"] = int(data.get("order_qty") or 0)
        data["b_ord"] = 0
        item = JobItem(**data)
    else:
        item = JobItem(**_derive_line_split(data, db))
    item.is_charge = charge
    return item


def _price_line(data: dict, sent: set, db: Session, price_level: Optional[str]) -> None:
    """The price of a new line that did not say its price ex GST.

    Priced inc GST only — the online store sends its shelf prices — it is
    held at that price (S2-08). Those lines were stored at $0: price_inc was
    accepted and never read, and the order totalled nothing. Sent no price at
    all, a stock code takes the stock's price (S2-16); it was booked at $0.
    A logo line has the logo's price already (`_from_logo`).
    """
    if "price_ex" in sent:
        return
    if "price_inc" in sent:
        inc = float(data.get("price_inc") or 0)
        if inc:
            data["priced_inc"] = True
            data["price_ex"] = round(inc / 1.1, 2)
        return
    if data.get("logo_id"):
        return
    price = _stock_price(
        db, data.get("stock_code"), int(data.get("order_qty") or 0), price_level
    )
    if price is not None:
        data["price_ex"] = price
        data["price_inc"] = round(price * 1.1, 2)


def _stock_price(
    db: Session, sku: Optional[str], qty: int, price_level: Optional[str]
) -> Optional[float]:
    """A stock code's price ex GST for `qty` on the job's price level (S2-16).

    The level the job names, or the stock's only level when it names none it
    has; on it, the break for the line's own quantity — not the customer's
    running total, so a later order never reprices an earlier one. Without a
    level or a break that applies, the stock's sell price. None when the code
    is no stock item or has no price.
    """
    if not sku:
        return None
    inv = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if inv is None:
        return None
    levels = db.query(StockPriceLevel).filter(StockPriceLevel.sku == sku).all()
    wanted = (price_level or "").strip().lower()
    level = next((lv for lv in levels if lv.price_level.lower() == wanted), None)
    if level is None and len(levels) == 1:
        level = levels[0]
    if level is not None:
        breaks = [b for b in level.breakpoints if (b.min_qty or 0) <= qty]
        if breaks:
            best = max(breaks, key=lambda b: b.min_qty or 0)
            return round(float(best.price_ex), 2)
    return float(inv.sell_price) if inv.sell_price else None


def _is_charge_code(db: Session, sku: Optional[str]) -> bool:
    """A stock code kept for freight, a set-up or a fee, not goods (S2-05).

    `JobItem.is_charge` says the same of a saved line; this is for a line not
    flushed yet, or one just recoded."""
    if not sku:
        return False
    inv = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    return inv is not None and is_charge(inv)


def _applies_to_targets(
    items: list, pairs: list[tuple["JobItem", int]]
) -> list[tuple["JobItem", "JobItem"]]:
    """Resolve each `applies_to_line` — the `sort` of the line it applies to."""
    by_sort: dict = {}
    for item in items:
        by_sort.setdefault(item.sort, []).append(item)
    # Not linked yet, so a line that itself applies to another does not read
    # as a service until after this; it is not goods either way.
    sources = {id(item) for item, _ in pairs}
    resolved = []
    for item, target_sort in pairs:
        targets = [t for t in by_sort.get(target_sort, []) if t is not item]
        if len(targets) != 1:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Line {item.sort} applies to line {target_sort}, which is not "
                    "one line on this job"
                ),
            )
        if id(targets[0]) in sources or not _is_stock_line(targets[0]):
            raise _not_a_goods_line(item, f"line {target_sort}")
        resolved.append((item, targets[0]))
    return resolved


def _not_a_goods_line(item: "JobItem", target: str) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail=(
            f"Line {item.sort} applies to {target}, which is not a goods line "
            "on this job"
        ),
    )


def _link(resolved: list[tuple["JobItem", "JobItem"]]) -> None:
    """Point each line at the line it applies to. After a flush: needs ids."""
    for item, target in resolved:
        item.applies_to_item_id = target.id


def _reconcile_items(job: "Job", incoming: List["JobItemSchema"], db: Session) -> list:
    """Update the job's lines in place, matching by id.

    Saving used to delete every line and rebuild the list, which threw away line
    identity on every save. That identity is referenced elsewhere while a job is
    being worked: order requirements hand out `item_id` so a purchase order can
    be raised against a specific line, and the picking screen posts quantities
    back against it. Rebuilding the rows left those references pointing at ids
    that no longer existed.

    It also made a save destructive under concurrency — two people editing one
    job meant the second save discarded the first's lines wholesale rather than
    conflicting on the line they both touched.

    Lines carrying an id are updated, lines without one are added, and lines the
    payload no longer mentions are removed. Returns the (line, sort) pairs that
    name a line they apply to, for `_applies_to_targets` once the lines are in.
    """
    existing = {item.id: item for item in job.items}
    kept = {line.id for line in incoming if line.id in existing}
    seen = set()
    pairs = []
    named = []

    for line in incoming:
        current = existing.get(line.id) if line.id is not None else None
        if current is not None:
            # Only what the caller actually sent. A full dump would fill every
            # omitted field with its schema default, which puts back the same
            # wipe the delete-and-recreate caused — po_no and qty_pick are
            # written by other screens and rarely appear in a save payload.
            sent = line.model_dump(
                exclude={"id", "applies_to_line"}, exclude_unset=True
            )
            recoded = "stock_code" in sent and (
                (sent["stock_code"] or "").strip().lower()
                != (current.stock_code or "").strip().lower()
            )
            ordered_before = int(current.order_qty or 0)
            ex_before = round(float(current.price_ex or 0), 2)
            for name, value in sent.items():
                setattr(current, name, value)
            # A new price ex GST typed over a line priced inc GST reprices it
            # ex; the form resending the one it was shown does not (S2-08).
            if current.priced_inc:
                if round(float(current.price_ex or 0), 2) != ex_before:
                    current.priced_inc = False
                else:
                    current.price_ex = round(float(current.price_inc or 0) / 1.1, 2)
            # A saved line given a logo's code applies the logo, as a new line
            # does; it stayed goods and was bought (F02). So does one keyed
            # before its logo was registered, on whichever save comes next.
            if recoded or "logo_id" in sent or current.logo_id is None:
                _relink_logo(current, sent, db, job.customer_id, recoded=recoded)
            # A recoded line's `is_charge` is its old code's until it is
            # flushed; set it now for what reads it before then.
            charge = (
                _is_charge_code(db, current.stock_code)
                if recoded
                else bool(current.is_charge)
            )
            current.is_charge = charge
            if (
                current.logo_id is not None
                or current.applies_to_item_id is not None
                or charge
                or line.applies_to_line is not None
            ):
                current.supply_qty, current.b_ord = current.order_qty or 0, 0
            elif _split_is_stale(current, sent, ordered_before, recoded):
                split = _derive_line_split(
                    {"order_qty": current.order_qty, "stock_code": current.stock_code},
                    db,
                    job=job,
                    siblings=tuple(
                        i for i in job.items if i is not current and i.id in kept
                    ),
                )
                current.supply_qty, current.b_ord = split["supply_qty"], split["b_ord"]
            seen.add(current.id)
        else:
            # No id, or an id this job does not own — either way it is new here,
            # and a new row does want the defaults.
            current = _new_line(line, db, job.customer_id, job.price_level)
            job.items.append(current)
        if line.applies_to_line is not None:
            pairs.append((current, line.applies_to_line))
        else:
            named.append(current)

    for item_id, item in existing.items():
        if item_id not in seen:
            db.delete(item)
    # Checked once every line is in its final state, and every line, not only
    # the ones that resent it: any id was accepted (a line on another job, the
    # line itself, one not there), and a garment turned into a note or deleted
    # left its alteration pointing at nothing (F19). A line relinked by its
    # `applies_to_line` is checked by `_applies_to_targets` instead.
    for item in named:
        target_id = item.applies_to_item_id
        if target_id is None:
            continue
        target = existing.get(target_id) if target_id in seen else None
        if target is None or target is item or not _is_stock_line(target):
            raise _not_a_goods_line(item, _line_name(existing, seen, target_id))
    return pairs


def _split_is_stale(
    item: "JobItem", sent: dict, ordered_before: int, recoded: bool
) -> bool:
    """A saved goods line's supply and back-order no longer describe it (S2-03).

    Its quantity or its code changed, and the save did not send a split that
    adds up to the new quantity. A save that sent the old split with a new
    quantity — or none at all — kept the old one: 26 polos billed, 22
    reserved and shipped, and the 4 never back-ordered, so never bought.
    """
    if item.display_type != "product":
        return False
    order = int(item.order_qty or 0)
    if not recoded and order == ordered_before:
        return False
    supply, back_order = sent.get("supply_qty"), sent.get("b_ord")
    if supply is None or back_order is None:
        return True
    return int(supply) + int(back_order) != order


def _line_name(existing: dict, seen: set, item_id: int) -> str:
    """How a refusal names the line an alteration points at."""
    target = existing.get(item_id)
    if target is None:
        return f"item {item_id}"
    return f"line {target.sort}" + ("" if item_id in seen else " (removed)")


def _relink_logo(
    item: "JobItem",
    sent: dict,
    db: Session,
    customer_id: Optional[str],
    *,
    recoded: bool,
) -> None:
    """Apply the logo a saved line now names, by id or by its code.

    Recoded to a code that is none of the customer's logos, it drops the logo
    it had and is goods again, split as a new goods line is: it kept the logo,
    so the garment it now names was never bought (F02).
    """
    logo = _logo_for(
        db,
        {"logo_id": sent.get("logo_id"), "stock_code": item.stock_code},
        customer_id,
    )
    if logo is None:
        if recoded and item.logo_id is not None:
            item.logo_id = None
            if not item.is_service:
                split = _derive_line_split(
                    {
                        "order_qty": item.order_qty,
                        "stock_code": item.stock_code,
                        "supply_qty": sent.get("supply_qty"),
                        "b_ord": sent.get("b_ord"),
                    },
                    db,
                )
                item.supply_qty, item.b_ord = split["supply_qty"], split["b_ord"]
        return
    line = {
        name: getattr(item, name)
        for name in ("decoration_type", "dec_code", "dec_position", "stitch_count")
    }
    for name, value in _from_logo(logo, line, set(sent)).items():
        setattr(item, name, value)


def _derive_line_split(
    data: dict,
    db: Session,
    *,
    job: Optional["Job"] = None,
    siblings: tuple = (),
) -> dict:
    """Fill in supply and back-order for a line that did not state them.

    Mirrors the job form: supply what is available, back-order the rest, and
    cap supply at availability rather than at stock on hand, so two orders
    cannot both reserve the same units. A line with no stock code has nothing
    to reserve and nothing to procure -- that is how the freight and decoration
    lines read in Jim2, Order 1 / Supply 1 / B.Ord 0. Nor has a charge kept as
    a stock code (S2-05).

    Only called for lines that omitted the fields. An explicit zero is a
    decision and is left alone. For a saved line of `job`, what is available
    leaves out what the job itself holds, but its other lines (`siblings`)
    still count against it.
    """
    supply_given = data.get("supply_qty") is not None
    bord_given = data.get("b_ord") is not None
    if supply_given and bord_given:
        return data

    order = int(data.get("order_qty") or 0)
    sku = data.get("stock_code")

    if not sku:
        supply = order
        back_order = 0
    else:
        inv = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
        if inv is None:
            # Not a stocked line. Nothing to reserve; the whole quantity has to
            # be bought, which is what the buying screen is for.
            supply, back_order = 0, order
        elif is_charge(inv):
            supply, back_order = order, 0
        else:
            # committed_total, not InventoryItem.committed_qty. The stored
            # column is not maintained -- inventory.py derives commitment from
            # the open jobs themselves and overrides it on read, "so what the
            # grid shows cannot drift from the documents it describes".
            # Reading the column here made every line look fully suppliable.
            if job is None:
                committed = committed_total(db, sku)
            else:
                committed = committed_total(db, sku, excluding_job=job.id) + sum(
                    int(other.supply_qty or 0)
                    for other in siblings
                    if other.stock_code == sku and _is_stock_line(other)
                )
            available = max(0, int(inv.stock or 0) - committed)
            supply = min(order, available)
            back_order = max(0, order - supply)

    if not supply_given:
        data["supply_qty"] = supply
    if not bord_given:
        data["b_ord"] = back_order
    return data


def _supply_only_what_is_free(job: "Job", db: Session) -> None:
    """Cap each goods line's supply at what is free now; back-order the rest.

    For a job becoming an order. Its split was worked out when the lines were
    written, but a quote or a portal order (New) reserves nothing, so other
    orders have been free to take that stock since. Reserving the old split
    let two orders hold the same units, with nothing back-ordered for order
    requirements to buy. Only ever down: a line that chose to buy in what
    stock could have supplied keeps that choice. The cut goes on the trail.
    """
    free: dict = {}
    cut: dict = {}
    for item in sorted(job.items, key=lambda i: (i.sort or 0, i.id or 0)):
        if not _is_stock_line(item) or not item.supply_qty:
            continue
        sku = item.stock_code
        if sku not in free:
            inv = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
            free[sku] = (
                None
                if inv is None
                else max(
                    0,
                    int(inv.stock or 0)
                    - committed_total(db, sku, excluding_job=job.id),
                )
            )
        if free[sku] is None:
            continue
        supply = min(int(item.supply_qty), free[sku])
        short = int(item.supply_qty) - supply
        if short:
            item.supply_qty = supply
            item.b_ord = int(item.b_ord or 0) + short
            cut[sku] = cut.get(sku, 0) + short
        free[sku] -= supply
    if cut:
        back_ordered = ", ".join(f"{sku} {qty}" for sku, qty in sorted(cut.items()))
        db.add(
            _system_comment(
                job,
                f"Confirmed with {back_ordered} back-ordered — the stock it was "
                "booked against is no longer free",
            )
        )


def _cap_supply_at_free(job: "Job", db: Session, held: dict) -> None:
    """A save never has an open order hold more than is free to it (S2-03).

    Each line's split is worked out on its own while the save is applied, so
    a quantity raised and a line added in one save could each take the same
    free units: 13 held of 10 on hand, nothing back-ordered, nothing bought.
    Run once the save's lines are flushed, over all of them together: for a
    SKU the job now holds more of than it did, it may hold what it held, or
    what is free to it if that is more; the rest is back-ordered, from its
    last lines first.
    """
    lines: dict = {}
    for item in job.items:
        if _is_stock_line(item) and item.supply_qty:
            lines.setdefault(item.stock_code, []).append(item)
    for sku, items in sorted(lines.items()):
        holding = sum(int(i.supply_qty) for i in items)
        if holding <= held.get(sku, 0):
            continue
        inv = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
        if inv is None:
            continue
        free = int(inv.stock or 0) - committed_total(db, sku, excluding_job=job.id)
        excess = holding - max(held.get(sku, 0), free)
        for item in sorted(items, key=lambda i: (i.sort or 0, i.id or 0), reverse=True):
            if excess <= 0:
                break
            cut = min(int(item.supply_qty), excess)
            item.supply_qty -= cut
            item.b_ord = int(item.b_ord or 0) + cut
            excess -= cut


def _on_hand_shortfalls(job: "Job", db: Session) -> dict:
    """SKUs this job would push below zero on hand, and by how much.

    Quantities are summed per SKU: two lines of three against five on hand is
    short by one even though neither line is. Uses supply_qty because that is
    what _deplete_on_hand actually ships.
    """
    wanted: dict = {}
    for item in job.items:
        if not _is_stock_line(item):
            continue
        qty = int(item.supply_qty or 0)
        if qty > 0:
            wanted[item.stock_code] = wanted.get(item.stock_code, 0) + qty
    if not wanted:
        return {}

    rows = db.query(InventoryItem).filter(InventoryItem.sku.in_(list(wanted))).all()
    on_hand = {r.sku: int(r.stock or 0) for r in rows}
    return {
        sku: qty - on_hand[sku]
        for sku, qty in wanted.items()
        if sku in on_hand and qty > on_hand[sku]
    }


def _apply_status_transition(
    job: "Job",
    new_status: str,
    db: Session,
    *,
    by: "User",
    allow_negative_stock: bool = False,
    ladder: bool = True,
    credit: bool = True,
) -> None:
    """Move `job` to `new_status` and run every side effect that implies.

    Every path that changes a job's status must come through here. Three used to
    do it themselves and disagreed with each other: `PATCH /jobs/{id}` applied
    the status with a bare setattr and ran no stock effects at all, and unprint
    dropped a PAID job into FINISH — a committed status — without re-reserving
    anything, leaving the stored committed quantity understated.

    Stock moves on two independent boundaries rather than per-status branches:

      committed — reserved for this job; released when it leaves those statuses
      depleted  — physically shipped; restored when it comes back out

    The boundary form is what makes the reverse transitions right. The old
    per-status form depleted on entering INVOICE and had no matching restore, so
    a job sent INVOICE -> FINISH kept its stock written off — only `unprint`
    put it back, and only on its own path.

    Validation runs here too, for the same reason: every path that changed a
    status used to carry its own copy of the checks, and each copy left one out
    (`_check_status_change`). `by` is who is making the move. `ladder=False` is
    for the paths whose move is not a step a person picks from the ladder —
    creating, copying or importing a job, and unprinting one — and
    `credit=False` for an import, which records orders the shop already took.
    """
    old_status = job.status
    if old_status == new_status:
        return

    # Checked before anything is mutated. Raising after `job.status` has been
    # reassigned leaves the job holding a status the caller was refused, and
    # any later commit in the same session persists it.
    _check_status_change(job, new_status, db, by, ladder=ladder, credit=credit)
    entering_depleted = (
        old_status not in _DEPLETED_STATUSES and new_status in _DEPLETED_STATUSES
    )
    shortfalls = _on_hand_shortfalls(job, db) if entering_depleted else {}
    if shortfalls and not allow_negative_stock:
        detail = ", ".join(
            f"{sku} short by {qty}" for sku, qty in sorted(shortfalls.items())
        )
        raise HTTPException(
            status_code=409,
            detail=(
                f"Invoicing this job would take stock below zero: {detail}. "
                "Check the count, or invoice anyway to accept it."
            ),
        )
    # Last of the checks, because issuing a number uses it up.
    if entering_depleted and not (job.invoice or "").strip():
        job.invoice = invoice_numbers.issue(db)

    job.status = new_status
    today = datetime.now().strftime("%Y-%m-%d")

    was_committed = old_status in COMMITTED_STATUSES
    now_committed = new_status in COMMITTED_STATUSES
    if not was_committed and now_committed:
        # Not on a recall to FINISH: those goods shipped and are coming back,
        # they are not being taken off the shelf now.
        if old_status in _PRE_ORDER_STATUSES:
            _supply_only_what_is_free(job, db)
        _commit_job_stock(job, db)
    elif was_committed and not now_committed:
        _release_job_stock(job, db)

    was_depleted = old_status in _DEPLETED_STATUSES
    now_depleted = new_status in _DEPLETED_STATUSES
    if not was_depleted and now_depleted:
        # Refused above unless it was accepted deliberately. Getting here with
        # a shortfall means somebody chose to bill goods the system says do not
        # exist, and that decision belongs in the job's history rather than
        # only in a stock figure that has quietly gone negative.
        if shortfalls:
            now = datetime.now()
            db.add(
                JobComment(
                    job_id=job.id,
                    date=now.strftime("%d/%m/%Y"),
                    time=now.strftime("%H:%M"),
                    initials="SYS",
                    author_name="System",
                    status=new_status,
                    is_internal=True,
                    comment=(
                        "Invoiced with insufficient stock on hand: "
                        + ", ".join(
                            f"{sku} short by {qty}"
                            for sku, qty in sorted(shortfalls.items())
                        )
                    ),
                )
            )
        _deplete_on_hand(job, db)
    elif was_depleted and not now_depleted:
        _restore_on_hand(job, db)
        # Recalled: it is no longer invoiced, and when it is invoiced again it
        # is on that day. Unprint used to leave it reading 'invoiced' with the
        # old date (F33). The number stays — it is the same invoice, reissued.
        job.invoice_status = "not_invoiced"
        job.invoice_date = None
        # Reissued, it falls due on the terms of that day.
        job.invoice_terms = job.invoice_due_date = None

    # Compliance timestamps. Not dispatched_at: that is the day a despatch was
    # recorded (`_record_despatch`), and stamping it on FINISH dated goods that
    # had not gone anywhere (F32).
    if new_status in _DEPLETED_STATUSES:
        _stamp_invoiced(job, today, db)
    if new_status == "PAID":
        job.payment_status = "paid"
        if not job.payment_date:
            job.payment_date = today

    # What the customer owes changes exactly when a job crosses the invoiced
    # boundary — either way. Unprinting takes the invoice back off it.
    if old_status in _DEPLETED_STATUSES or new_status in _DEPLETED_STATUSES:
        _recalculate_customer_balance(job.customer_id, db)

    # The revenue crosses the same boundary the stock does: entering INVOICE or
    # PAID posts the invoice, leaving them reverses it. Unprint, edit and
    # re-invoice therefore reads in the ledger as posted, reversed, posted.
    _sync_invoice_or_refuse(job, db)


def _stamp_invoiced(job: "Job", today: str, db: Session) -> None:
    """What becoming invoiced writes onto a job, from every path that does it.

    Once only on INVOICE, so a job sent straight to PAID — or created already
    invoiced, or imported — carried no invoice date. The BAS report selects by
    invoice date, so those sales were silently absent from it; the ledger found
    this by disagreeing with it. Keyed on the invoiced boundary now, the same
    one stock and the ledger use.

    It always marks the job invoiced; only the date is kept when it has one.
    Returning early on a date left a job that came in from an import with a
    stale date reading INVOICE but 'not_invoiced' (F33).
    """
    job.invoice_status = "invoiced"
    if job.invoice_date:
        _stamp_terms(job, db)
        return
    job.invoice_date = today
    _stamp_terms(job, db)
    # What the customer owes, worked out here rather than in the browser.
    # This was only ever computed in the job form, so a job invoiced by an
    # import, a feed, a portal or a script carried a balance of zero, and
    # every consumer of the field believed it -- the credit-limit check at job
    # creation, the customer statement, the sales register and the receivables
    # figures. The invariant is total inc GST less whatever has already been
    # taken; `record_payment` maintains it from here.
    job.balance_due = max(
        0.0, round(float(job.total_inc or 0) - float(job.deposit or 0), 2)
    )


def _stamp_terms(job: "Job", db: Session) -> None:
    """The terms an invoice is issued on, and the day it falls due (S2-13).

    The customer's terms, else the company's default, counted from the invoice
    date. Read once, here: aged receivables used to work the due date out from
    the customer's terms of the day, so changing them re-dated every open
    invoice, and the PDF printed the goods' due date and the company's terms.
    """
    if job.invoice_due_date:
        return
    customer_terms = (
        db.query(Customer.payment_terms).filter(Customer.id == job.customer_id).scalar()
    )
    default = db.query(CompanySettings.payment_terms_default).limit(1).scalar()
    try:
        issued = date.fromisoformat(job.invoice_date[:10])
    except ValueError:
        return  # an imported date that is not one; receivables reads it as before
    job.invoice_terms = payment_terms.terms_in_force(customer_terms, default)
    job.invoice_due_date = payment_terms.due_date(issued, job.invoice_terms).isoformat()


# Whether a job is paid or invoiced, what has been taken against it and what
# is still owed are facts about payments and invoicing, not fields a person
# types. They change through `record_payment` and the invoicing boundary
# (`_stamp_invoiced`). The job form used to offer Paid and Invoice dropdowns
# and send all four on every save, and both create and update wrote them
# straight onto the job -- so a job could read Paid with no payment taken and
# nothing in the ledger, and the browser's balance fed the credit check and
# the customer's balance. A create or a save that carries them is ignored for
# them now.
_SERVER_OWNED_MONEY = frozenset(
    {"deposit", "balance_due", "payment_status", "invoice_status"}
)

# A job's total is its lines'. Only the Jim2 import writes header totals, for
# history that has no lines; a job created, copied or edited here with no
# lines totals zero, or keeps the totals it was imported with. Taking the
# caller's figures let a lineless job be invoiced at whatever was sent — a
# $5,000 invoice for nothing (F04). The form still sends them; they are ignored.
_HEADER_TOTALS = frozenset({"total_ex", "tax", "total_inc"})


def _settle_money(job: "Job") -> None:
    """Re-derive what is owed, and the payment status, from the total and the
    payments taken -- the invariant `balance_due == total_inc - deposit` that
    invoicing and `record_payment` already keep."""
    deposit = float(job.deposit or 0)
    job.balance_due = max(0.0, round(float(job.total_inc or 0) - deposit, 2))
    if job.status == "PAID":
        # What the PAID transition says too; the ledger health check lists
        # any PAID job that still owes.
        job.payment_status = "paid"
    elif deposit <= 0:
        job.payment_status = "unpaid"
    elif job.balance_due <= 0:
        job.payment_status = "paid"
    else:
        job.payment_status = "partial"


def _sync_invoice_or_refuse(job: "Job", db: Session) -> None:
    try:
        sync_invoice(db, job)
    except LedgerError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


def _recalculate_weight(job: "Job", db: Session) -> None:
    """The job's weight, worked out on the server (app/core/job_weight.py)."""
    job.weight_total = job_weight.order_weight(job, db)


def _recalculate_customer_balance(customer_id: str, db: Session) -> None:
    """Recompute customer.balance: what is owed on their invoices.

    INVOICE and PAID jobs only — the same jobs aged receivables and the ledger
    count. FINISH used to be included, so a customer with goods despatched but
    not yet invoiced showed a balance their receivables did not (F06); open
    orders count against the credit limit in `_check_credit_limit` instead.

    The flush matters. `SessionLocal` is built with `autoflush=False`, so the
    SUM below reads what is on disk and not what the caller has just changed in
    memory. Both callers modify `balance_due` immediately beforehand -- the
    INVOICE transition establishes it, `record_payment` reduces it -- so
    without this the customer's balance is always one write behind: invoicing
    two jobs left the balance holding only the first, and taking a payment
    recalculated the balance from the amount owed before it.
    """
    if not customer_id:
        return
    from sqlalchemy import func as sqlfunc

    db.flush()

    total = (
        db.query(sqlfunc.coalesce(sqlfunc.sum(Job.balance_due), 0))
        .filter(
            Job.customer_id == customer_id,
            Job.status.in_(list(_DEPLETED_STATUSES)),
        )
        .scalar()
    )
    db.query(Customer).filter(Customer.id == customer_id).update(
        {"balance": float(total or 0)}, synchronize_session=False
    )


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/fuel-levy")
def get_fuel_levy(freight: float, _: User = Depends(require_any)):
    """Calculate fuel levy for a given freight amount (13% sliding scale)."""
    return {"freight": freight, "fuel_levy": calculate_fuel_levy(freight)}


@router.get("")
def list_jobs(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    q = db.query(Job).options(joinedload(Job.items), joinedload(Job.comments))
    if status and status != "all":
        q = q.filter(Job.status == status)
    if priority and priority != "all":
        q = q.filter(Job.priority == priority)
    if search:
        term = f"%{search}%"
        # The portal's order number (serial_no) and the person who ordered
        # (name_contact, requested_by) too: a portal order could be found only
        # by the customer's name (F01). The customer and ship-to codes as well,
        # as the screen's own filter matches them: a job past the newest 500
        # loaded could not be found by either. And the PO number on its lines:
        # in Jim2 the job list is filtered by the PO buying for it (JIM26).
        q = q.filter(
            Job.items.any(JobItem.po_no.ilike(term))
            | Job.id.ilike(term)
            | Job.customer_id.ilike(term)
            | Job.ship_to.ilike(term)
            | Job.customer_name.ilike(term)
            | Job.invoice.ilike(term)
            | Job.cust_ref.ilike(term)
            | Job.our_ref.ilike(term)
            | Job.serial_no.ilike(term)
            | Job.name_contact.ilike(term)
            | Job.requested_by.ilike(term)
            | Job.ex_job_ref.ilike(term)
            | Job.connote.ilike(term)
        )
    return q.order_by(Job.created_at.desc()).offset(offset).limit(limit).all()


JOB_ID_START = 110000


def _next_job_id(db: Session) -> str:
    # Single MAX() aggregate — O(log N) via primary key index.
    # regexp_match limits to 6-digit IDs so legacy 7-digit random IDs are excluded.
    result = (
        db.query(func.max(cast(Job.id, Integer)))
        .filter(Job.id.regexp_match(r"^\d{6}$"))
        .scalar()
    )
    return str((result or JOB_ID_START - 1) + 1)


def _get_initials(user: "User") -> str:
    name = user.full_name or user.username
    return name[:3].upper()


@router.get("/next-id")
def get_next_job_id(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    return {"next_id": _next_job_id(db)}


@router.post("/bulk-status")
def bulk_status(
    body: BulkStatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """Move many jobs to one status, judging each on its own.

    Jim2 does this routinely — its comment trails are full of "Bulk status
    update". Ours moved one job per request, which for a sixty-eight site
    rollout is sixty-eight round trips and no single answer at the end.

    A job that will not move does not stop the batch. The alternative is an
    operator picking through sixty-eight jobs to find the one that refused,
    which is worse than the problem this replaces.

    Registered above the parameterised routes so "bulk-status" is not read as a
    job id.
    """
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")

    moved, failed = 0, []
    for job_id in body.job_ids:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            failed.append({"job_id": job_id, "reason": "Job not found"})
            continue
        # A SAVEPOINT per job. Plain db.rollback() would discard the whole
        # session — every job already moved in this batch would be undone by
        # the next one that refused, which is the opposite of judging each on
        # its own.
        savepoint = db.begin_nested()
        try:
            now = datetime.now()
            _apply_status_transition(
                job,
                body.status,
                db,
                by=current_user,
                allow_negative_stock=body.allow_negative_stock,
            )
            db.add(
                JobComment(
                    job_id=job_id,
                    date=now.strftime("%d/%m/%Y"),
                    time=now.strftime("%H:%M"),
                    initials=_get_initials(current_user),
                    author_name=current_user.full_name or current_user.username,
                    status=body.status,
                    is_internal=True,
                    comment="Bulk status update",
                )
            )
            savepoint.commit()
            moved += 1
        except HTTPException as exc:
            savepoint.rollback()
            failed.append({"job_id": job_id, "reason": str(exc.detail)})

    db.commit()
    return {"moved": moved, "failed": failed}


class BulkDueRequest(BaseModel):
    model_config = _KNOWN_FIELDS_ONLY

    job_ids: List[str] = Field(min_length=1, max_length=500)
    due: date


@router.post("/bulk-due")
def bulk_due(
    body: BulkDueRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """Move the due date of many jobs at once — Jim2's "Change Jobs Date Due"
    on the job list (JIM24): a late delivery of garments moves every job
    waiting on it. Each job's trail says what its date was; a job that is not
    there is named and the rest go ahead."""
    due = body.due.isoformat()
    changed, failed = 0, []
    for job_id in body.job_ids:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            failed.append({"job_id": job_id, "reason": "Job not found"})
            continue
        if job.due != due:
            job.comments.append(
                _system_comment(
                    job,
                    f"Due date moved from {job.due or 'none'} to {due}",
                    by=current_user,
                )
            )
            job.due = due
        changed += 1
    db.commit()
    return {"changed": changed, "failed": failed}


class AutoPickRequest(BaseModel):
    model_config = _KNOWN_FIELDS_ONLY

    job_ids: List[str] = Field(min_length=1, max_length=500)


@router.post("/auto-pick")
def auto_pick(
    body: AutoPickRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Pick every goods line of many jobs to what it supplies — Jim2's Auto Pick.

    Picking was one job per request, each listing every line and quantity
    (F20). What a line supplies is what stock is reserved for it, so that is
    what goes in the carton; a line still waiting on a back-order is picked as
    far as it can be and reads Partial. Each job is judged on its own, as the
    bulk status move judges them, and one that refuses — locked, or not found
    — is reported without stopping the rest.
    """
    picked, failed = [], []
    now = datetime.now()
    for job_id in body.job_ids:
        job = (
            db.query(Job)
            .options(joinedload(Job.items))
            .filter(Job.id == job_id)
            .first()
        )
        if not job:
            failed.append({"job_id": job_id, "reason": "Job not found"})
            continue
        try:
            _require_mutable(job, allow_settled=True)
        except HTTPException as exc:
            failed.append({"job_id": job_id, "reason": str(exc.detail)})
            continue
        updated, all_picked = _pick(
            job, {i.id: int(i.supply_qty or 0) for i in _goods_lines(job)}
        )
        db.add(
            JobComment(
                job_id=job.id,
                date=now.strftime("%d/%m/%Y"),
                time=now.strftime("%H:%M"),
                initials=_get_initials(current_user),
                author_name=current_user.full_name or current_user.username,
                status=job.status,
                is_internal=True,
                comment=f"Auto Pick: {updated} line(s)"
                + (" — all lines picked" if all_picked else " — some still to come"),
            )
        )
        picked.append({"job_id": job.id, "all_picked": all_picked})
    db.commit()
    return {"jobs": picked, "failed": failed}


@router.get("/sales-register")
def sales_register(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    customer_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    # Invoiced sales are a money report, which overseas staff do not read
    # (2026-10-19; the same line as /reports/sales-summary).
    _: User = Depends(require_staff),
):
    """Return INVOICE and PAID jobs for the Sales Register, filtered by date range."""
    q = (
        db.query(Job)
        .options(joinedload(Job.items))
        .filter(Job.status.in_(["INVOICE", "PAID"]))
    )
    if customer_id:
        q = q.filter(Job.customer_id == customer_id)
    if date_from:
        q = q.filter(Job.date_in >= date_from)
    if date_to:
        q = q.filter(Job.date_in <= date_to)
    result = q.order_by(Job.date_in.desc()).all()
    total_ex = sum(float(j.total_ex or 0) for j in result)
    total_inc = sum(float(j.total_inc or 0) for j in result)
    total_tax = sum(float(j.tax or 0) for j in result)
    return {
        "jobs": result,
        "summary": {
            "count": len(result),
            "total_ex": round(total_ex, 2),
            "total_inc": round(total_inc, 2),
            "total_tax": round(total_tax, 2),
        },
    }


@router.get("/order-requirements")
def get_order_requirements(
    req_type: str = Query("garment", alias="type"),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Aggregate job items needing ordering, grouped by SKU (garment) or decoration type.

    Open orders only — the statuses that reserve stock. This used to take
    every job but CANCEL and PAID, so a quote nobody had accepted was bought
    for, and the back-order report (which left quotes out) disagreed (F13).
    """
    base = (
        db.query(JobItem, Job)
        .join(Job, JobItem.job_id == Job.id)
        .filter(Job.status.in_(list(COMMITTED_STATUSES)))
    )

    if req_type == "garment":
        rows = base.filter(
            JobItem.b_ord > 0,
            (JobItem.po_no.is_(None)) | (JobItem.po_no == ""),
            # A charge saved back-ordered before charges were services (S2-05).
            ~JobItem.is_charge,
        ).all()

        grouped: dict = {}
        skus = list({item.stock_code for item, _ in rows if item.stock_code})
        inv_map = (
            {
                inv.sku: inv
                for inv in db.query(InventoryItem)
                .filter(InventoryItem.sku.in_(skus))
                .all()
            }
            if skus
            else {}
        )

        for item, job in rows:
            key = item.stock_code or ""
            if key not in grouped:
                inv = inv_map.get(key)
                grouped[key] = {
                    "sku": key,
                    "description": item.description or "",
                    "supplier": inv.supplier if inv else "",
                    "unit_cost": (
                        float(inv.unit_cost) if inv else float(item.purchase_price or 0)
                    ),
                    "total_b_ord": 0,
                    "jobs": [],
                }
            grouped[key]["total_b_ord"] += item.b_ord or 0
            grouped[key]["jobs"].append(
                {
                    "job_id": job.id,
                    "customer_name": job.customer_name or "",
                    "item_id": item.id,
                    "b_ord": item.b_ord or 0,
                    "po_no": item.po_no or "",
                }
            )
        return list(grouped.values())

    # Decoration to buy in. A line applying a logo says who does it: a logo done
    # in-house is production work, not a purchase, so it is not listed — the
    # worklist used to ask a PO for every decorated line, in-house or not (F16).
    rows = base.filter(
        JobItem.decoration_type.notin_(["None", ""]),
        JobItem.decoration_type.isnot(None),
        (JobItem.po_no.is_(None)) | (JobItem.po_no == ""),
    ).all()
    logo_ids = {item.logo_id for item, _ in rows if item.logo_id}
    logos = (
        {lg.id: lg for lg in db.query(Logo).filter(Logo.id.in_(logo_ids))}
        if logo_ids
        else {}
    )

    grouped: dict = {}
    for item, job in rows:
        logo = logos.get(item.logo_id)
        if logo is not None and logo.made_by == "in_house":
            continue
        dec_code = (
            logo.code
            if logo is not None
            else (item.emb_code if item.decoration_type == "EMB" else item.trs_code)
        ) or ""
        key = f"{item.decoration_type}:{dec_code}"
        if key not in grouped:
            grouped[key] = {
                "sku": dec_code,
                "decoration_type": item.decoration_type,
                "description": (logo.name if logo is not None else None)
                or item.description
                or "",
                # Unknown for a line that names no logo: decorated on the
                # garment line itself, the job form's way.
                "made_by": logo.made_by if logo is not None else None,
                "supplier_id": logo.supplier_id if logo is not None else None,
                "total_qty": 0,
                "jobs": [],
            }
        grouped[key]["total_qty"] += item.order_qty or 0
        grouped[key]["jobs"].append(
            {
                "job_id": job.id,
                "customer_name": job.customer_name or "",
                "item_id": item.id,
                "qty": item.order_qty or 0,
                "dec_code": dec_code,
                "po_no": item.po_no or "",
            }
        )
    return list(grouped.values())


@router.get("/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db), _: User = Depends(require_any)):
    job = (
        db.query(Job)
        .options(joinedload(Job.items), joinedload(Job.comments))
        .filter(Job.id == job_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _job_with_relations(db: Session, job_id: str) -> Job:
    """Re-load a job with items + comments eagerly so the response includes them.
    (db.refresh() expires relationships, which would serialize an empty items list.)"""
    return (
        db.query(Job)
        .options(joinedload(Job.items), joinedload(Job.comments))
        .filter(Job.id == job_id)
        .first()
    )


def _transition_new_job(
    job: "Job",
    status: str,
    db: Session,
    by: "User",
    links: Optional[list] = None,
    **options,
) -> None:
    """Bring a job that has just been built into the status it was asked for.

    It starts as a QUOTE and moves through the shared transition, so a job
    created — or copied, or imported — straight into ORDER is credit-checked
    and reserves its stock, and one created straight into INVOICE takes its
    stock out, is refused if that goes below zero, is numbered, posts, and is
    owed. Each of those used to be a separate hand-written branch here, and the
    branches had dropped all but the reservation and the ledger post.

    In a savepoint, so a refusal leaves nothing of the new job behind. `links`
    are the (line, line it applies to) pairs, set once the lines have ids.
    """
    savepoint = db.begin_nested()
    try:
        db.add(job)
        db.flush()
        if links:
            _link(links)
            db.flush()
        _apply_status_transition(job, status, db, by=by, ladder=False, **options)
        savepoint.commit()
    except HTTPException:
        savepoint.rollback()
        raise


# What an order number is trimmed of, as it is stored and in the duplicate
# check alike. SQL's trim() takes only spaces where Python's strip() took tabs
# and line breaks too, so 'WEB-1001\t' was stored raw and never matched its own
# retry; tabs and line breaks become spaces first, on both sides.
_ORDER_NUMBER_BREAKS = ("\t", "\r", "\n")


def _order_number(value: Optional[str]) -> str:
    text = value or ""
    for ch in _ORDER_NUMBER_BREAKS:
        text = text.replace(ch, " ")
    return text.strip(" ")


def _stored_order_number(column):
    """`_order_number`, as SQL — for rows stored before it applied."""
    for ch in _ORDER_NUMBER_BREAKS:
        column = func.replace(column, ch, " ")
    return func.trim(column)


def _portal_rules(body: "JobCreate") -> None:
    """What an order from the online store's portal must be.

    Booked as New (or a QUOTE request) for TIG to confirm — the portal does not
    take orders on account or invoice; with its order number, which is what
    makes a retry recognisable; and with no job number or invoice number of its
    own choosing.
    """
    if body.status not in _PORTAL_STATUSES:
        raise HTTPException(
            status_code=422,
            detail="The portal books orders as New for TIG to confirm "
            f"(or QUOTE), not {body.status}",
        )
    if not _order_number(body.serial_no):
        raise HTTPException(
            status_code=422,
            detail="A portal order carries its order number (serial_no)",
        )
    if body.id or body.invoice:
        raise HTTPException(
            status_code=422,
            detail="The portal does not choose job or invoice numbers",
        )


def _require_registered_decoration(
    line: "JobItemSchema", item: "JobItem", db: Session
) -> None:
    """A portal decoration line names a registered logo or a stock item (F12).

    One whose code is neither, and which is done to no garment line, was read
    as a garment and bought. The portal registers the logo first. Staff lines
    are not refused (the plan's rule). A decoration is marked by its method, or
    by an embroidery or decoration code alone — the form sends "None" for no
    method, and a line marked only by its codes was bought too.
    """
    code = (item.stock_code or "").strip()
    marks = (item.decoration_type, item.emb_code, item.dec_code)
    if (
        all((mark or "").strip() in ("", "None") for mark in marks)
        or not code
        or item.is_service
        or line.applies_to_line is not None
        or db.get(InventoryItem, code) is not None
    ):
        return
    raise HTTPException(
        status_code=422,
        detail=(
            f"Line {item.sort}: {code} is not one of this customer's logos or a "
            "stock item — register the logo first"
        ),
    )


# What a line cost TIG and what it makes on it. A service account (the online
# store's portal) is told neither: through a line naming a logo, it read that
# logo's cost back (F26).
_COST_FIELDS = frozenset({"purchase_price", "margin", "margin_percent"})


def _without_cost(job: "Job") -> dict:
    body = jsonable_encoder(job)
    return {
        **body,
        "items": [
            {name: value for name, value in item.items() if name not in _COST_FIELDS}
            for item in body.get("items", [])
        ],
    }


def _order_lock_key(customer_id: Optional[str], serial: str) -> int:
    """The advisory-lock key of a portal order: a signed 64-bit number.

    From hashlib, not hash(): Python salts string hashes per process, and every
    API instance must reach the same key for the same order.
    """
    name = f"portal-order\x1f{customer_id}\x1f{_order_number(serial).lower()}"
    digest = hashlib.sha256(name.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big", signed=True)


def _lock_order_number(db: Session, customer_id: Optional[str], serial: str) -> None:
    """Hold (customer, order number) until this transaction ends (F01).

    The duplicate check reads, and the job is written after: two overlapping
    retries each read nothing and both booked. With the lock the second waits
    for the first to commit, and its check then sees the job. No unique index:
    live data may already hold duplicates, which would fail the deploy.
    PostgreSQL only — SQLite has one writer at a time already.
    """
    if db.get_bind().dialect.name != "postgresql":
        return
    db.execute(
        text("SELECT pg_advisory_xact_lock(:key)"),
        {"key": _order_lock_key(customer_id, serial)},
    )


def _require_not_a_repeat(
    db: Session,
    customer_id: Optional[str],
    item_no: Optional[str],
    serial_no: Optional[str],
    job_id: Optional[str] = None,
) -> None:
    """A portal order already booked is not booked again (F01).

    The order number (serial_no) of an online-store order, per customer, among
    jobs not cancelled. A portal that retries a timed-out request used to make
    a second job, which shipped and invoiced the same uniform twice. The
    refusal names the job already made, so the retry can carry on with it.
    `job_id` is the job being edited, which does not repeat itself.
    """
    serial = _order_number(serial_no)
    if item_no != PORTAL_ITEM_NO or not serial:
        return
    _lock_order_number(db, customer_id, serial)
    query = db.query(Job).filter(
        Job.customer_id == customer_id,
        Job.item_no == PORTAL_ITEM_NO,
        func.lower(_stored_order_number(Job.serial_no)) == serial.lower(),
        Job.status != "CANCEL",
    )
    if job_id is not None:
        query = query.filter(Job.id != job_id)
    existing = query.first()
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "duplicate",
                "message": f"Order {serial} is already job {existing.id}",
                "job_id": existing.id,
            },
        )


def _store_payment(job: "Job", body: "JobCreate") -> float:
    """What the online store took at checkout, to record with its order (S2-08).

    The store sends it as `deposit`, with its payment method. It was dropped
    without a word, so a card-paid order read as owed by the employer's
    account until staff keyed the payment again. More than the order comes to
    is refused: it is money taken for goods the order does not have.
    """
    amount = round(float(body.deposit or 0), 2)
    if amount <= 0:
        return 0.0
    if amount > float(job.balance_due or 0):
        raise HTTPException(
            status_code=422,
            detail=(
                f"The store took ${amount:.2f} but the order comes to "
                f"${float(job.total_inc or 0):.2f}"
            ),
        )
    return amount


def _name_from_customer(job: "Job", db: Session) -> None:
    """The buyer's name from the customer master, when none was keyed (S2-01).

    The tax invoice's Bill To, aged receivables and the despatch screens read
    `customer_name`. The online store never sends one, so every portal job
    printed an invoice naming no buyer — invalid from $1,000 — and aged
    receivables listed it as 'Unknown'.
    """
    if (job.customer_name or "").strip() or not job.customer_id:
        return
    name = db.query(Customer.name).filter(Customer.id == job.customer_id).scalar()
    if name:
        job.customer_name = name


@router.post("")
def create_job(
    body: JobCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_intake),
):
    from_portal = current_user.role == "portal"
    if from_portal:
        _portal_rules(body)
    item_no = PORTAL_ITEM_NO if from_portal else body.item_no
    _require_not_a_repeat(db, body.customer_id, item_no, body.serial_no)
    job_id = body.id or _next_job_id(db)
    if db.query(Job).filter(Job.id == job_id).first():
        raise HTTPException(status_code=409, detail="Job ID already exists")
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
    _require_invoice_number_free(db, body.invoice, job_id)
    job = Job(
        **{
            **body.model_dump(
                exclude={"items", "status", *_SERVER_OWNED_MONEY, *_HEADER_TOTALS}
            ),
            "id": job_id,
            "status": "QUOTE",
            "item_no": item_no,
            # Stored as the duplicate check reads it, so a retry matches.
            "serial_no": (
                None if body.serial_no is None else _order_number(body.serial_no)
            ),
            "created_by_user_id": current_user.id,
        }
    )
    _name_from_customer(job, db)
    job.deposit = 0
    job.total_ex = job.tax = job.total_inc = 0.0
    job.invoice_status = "not_invoiced"
    # The first line of the trail: who took the order, and how it came in (F28).
    opening = _system_comment(
        job,
        (
            f"Booked from the online store — order {job.serial_no}"
            if from_portal
            else f"Created as {body.status}"
        ),
        by=current_user,
    )
    opening.status = body.status
    job.comments.append(opening)
    pairs = []
    for item_data in body.items:
        line = _new_line(item_data, db, body.customer_id, body.price_level)
        if item_data.applies_to_item_id is not None:
            # A new job's lines have no ids yet, so any id names another job's
            # line (F19). They are named by their `sort` instead.
            raise _not_a_goods_line(line, f"item {item_data.applies_to_item_id}")
        if from_portal:
            _require_registered_decoration(item_data, line, db)
        job.items.append(line)
        if item_data.applies_to_line is not None:
            pairs.append((line, item_data.applies_to_line))
    links = _applies_to_targets(job.items, pairs)
    _total_from_lines(job)
    _recalculate_weight(job, db)
    _settle_money(job)
    paid_at_store = _store_payment(job, body) if from_portal else 0.0
    _transition_new_job(job, body.status, db, current_user, links=links)
    if paid_at_store:
        _take_payment(
            job,
            db,
            current_user,
            amount=paid_at_store,
            method=(
                body.payment_method
                if "payment_method" in body.model_fields_set and body.payment_method
                else "Card"
            ),
            reference=f"Online order {job.serial_no}",
            notes="Paid at the online store",
        )
        _recalculate_customer_balance(job.customer_id, db)
    db.commit()
    made = _job_with_relations(db, job_id)
    return _without_cost(made) if current_user.role in SERVICE_ROLES else made


@router.patch("/{job_id}")
def update_job(
    job_id: str,
    body: JobUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
    if_match: Optional[str] = Header(default=None, alias="If-Match"),
):
    job = db.query(Job).options(joinedload(Job.items)).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _require_current_version(job, if_match)
    _require_mutable(job)
    if body.status and body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
    if body.status and body.status != job.status:
        # Before anything is written; the transition checks again once the
        # lines are in place, for the credit check and stock.
        _validate_transition(job, body.status, current_user)
        _require_role_for(job, body.status, current_user)
    if body.invoice is not None:
        _require_invoice_number_free(db, body.invoice, job.id)
    # An edit can make a job a repeat of a portal order too: a new order
    # number, keyed as an online order, or moved to the customer who already
    # has that order (F01).
    if (
        (
            body.serial_no is not None
            and _order_number(body.serial_no) != _order_number(job.serial_no)
        )
        or (body.item_no is not None and body.item_no != job.item_no)
        or (body.customer_id is not None and body.customer_id != job.customer_id)
    ):
        _require_not_a_repeat(
            db,
            body.customer_id or job.customer_id,
            job.item_no if body.item_no is None else body.item_no,
            job.serial_no if body.serial_no is None else body.serial_no,
            job_id=job.id,
        )

    # Status is applied last, through the shared transition, so it is never just
    # another field in this setattr loop — that is how this endpoint used to move
    # a job into ORDER while reserving no stock at all.
    update_data = body.model_dump(
        exclude_none=True,
        exclude={
            "items",
            "status",
            "weight_total",
            *_SERVER_OWNED_MONEY,
            *_HEADER_TOTALS,
        },
    )
    if "branch" in body.model_fields_set and body.branch is None:
        update_data["branch"] = None  # blank: HQ, stored as null (F14)
    total_before = float(job.total_inc or 0)
    customer_before = job.customer_id
    if "branch" in update_data and job.status in COMMITTED_STATUSES:
        _move_reservation(job, db, update_data["branch"])
    for field, value in update_data.items():
        setattr(job, field, value)

    had_lines = bool(job.items)
    if body.items is not None:
        # An open order holds a reservation for what its lines supply; editing
        # the lines moves it by the difference, so the reservation stays what
        # the job now supplies rather than what it supplied when committed.
        held = _reserved_by_sku(job) if job.status in COMMITTED_STATUSES else None
        pairs = _reconcile_items(job, body.items, db)
        db.flush()
        # A deleted row lingers in the loaded collection until it is reloaded,
        # so until this expiry `job.items` can hold removed lines alongside the
        # current ones — and everything below iterates it.
        db.expire(job, ["items"])
        if pairs:
            _link(_applies_to_targets(job.items, pairs))
            db.flush()
        if held is not None:
            _cap_supply_at_free(job, db, held)
            now = _reserved_by_sku(job)
            _post_reservation(
                job,
                db,
                {sku: now.get(sku, 0) - held.get(sku, 0) for sku in {*held, *now}},
            )

    moved = job.customer_id != customer_before
    if moved:
        _require_own_logos(db, job, job.customer_id)
        if "customer_name" not in update_data:
            # The old customer's name would bill the new one.
            job.customer_name = None
            _name_from_customer(job, db)

    # The total and weight follow the lines, and what is owed follows the total
    # — never the browser's figures.
    _total_from_lines(job, emptied=had_lines and not job.items)
    _recalculate_weight(job, db)
    _settle_money(job)
    # An open order made bigger asks for more credit, the same as a new one;
    # only crossing into ORDER was checked, so a $156 order could be edited to
    # $1,562 against a $200 limit (F27). One moved to another customer asks
    # that customer for all of it: a move was never checked at all.
    if job.status in COMMITTED_STATUSES and (
        moved or float(job.total_inc or 0) > total_before
    ):
        _check_credit_limit(job, db)

    if body.status and body.status != job.status:
        # After the lines are in place: what gets reserved is what the job now
        # holds, not what it held when the request arrived.
        #
        # No negative-stock override here on purpose. Accepting a short count is
        # a deliberate act and belongs on the status endpoint, where it is asked
        # for explicitly; a PATCH that happens to carry a status must not do it
        # silently.
        _apply_status_transition(job, body.status, db, by=current_user)

    # Assigned explicitly so the job row is always part of the UPDATE: a save
    # that only touches lines changes no column on the job itself, and without
    # this the mapper would see nothing to write and the version would not move.
    job.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _job_with_relations(db, job_id)


@router.post("/{job_id}/status")
def update_status(
    job_id: str,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    now = datetime.now()
    _apply_status_transition(
        job,
        body.status,
        db,
        by=current_user,
        allow_negative_stock=body.allow_negative_stock,
    )

    comment = JobComment(
        job_id=job_id,
        date=now.strftime("%d/%m/%Y"),
        time=now.strftime("%H:%M"),
        initials=_get_initials(current_user),
        author_name=current_user.full_name or current_user.username,
        status=body.status,
        is_internal=True,
        comment=f"Status changed to {body.status}",
    )
    db.add(comment)
    db.commit()
    db.refresh(job)
    return job


@router.post("/{job_id}/duplicate")
def duplicate_job(
    job_id: str,
    body: DuplicateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Create a new job carrying this one's order, optionally to another site.

    Jim2's "Create Similar", which is how a thirteen-venue rollout stays
    workable: same garments, same decoration, same pricing, next address. A job
    holds one ship-to and that is not going to change, so the answer to a
    sixty-eight site order is sixty-eight jobs — this is what stops that meaning
    sixty-eight jobs typed out by hand.

    What carries over is the order. What does not is anything belonging to the
    source's own fulfilment: its invoice, its dates, its money taken, its picked
    and delivered quantities, and the purchase orders raised against its lines.
    Those belong to that job and copying them would attach this job's goods to
    somebody else's purchase order.
    """
    src = db.query(Job).options(joinedload(Job.items)).filter(Job.id == job_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Job not found")
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
    _require_no_retired_logo(db, src)

    carried = (
        "customer_id",
        "customer_name",
        "priority",
        "order_category",
        "type",
        "assigned_to",
        "payment_method",
        "notes",
        "our_ref",
        "description",
        "project_no",
        "name_contact",
        "branch",
        "price_level",
        "acc_mgr",
        "invoice_desc",
        "requested_by",
        "lock_rate",
        "shipping_address",
        "ship_to",
        "ship_to_id",
        "cust_ref",
        "due",
    )
    new = Job(
        id=_next_job_id(db),
        status="QUOTE",
        created_by_user_id=current_user.id,
        date_in=datetime.now().strftime("%Y-%m-%d"),
        # The copy's total is its lines' (`_HEADER_TOTALS`).
        total_ex=0,
        tax=0,
        total_inc=0,
        deposit=0,
        balance_due=0,
        payment_status="unpaid",
        invoice_status="not_invoiced",
        locked=False,
        **{name: getattr(src, name) for name in carried},
    )
    for field, value in body.model_dump(exclude={"status"}, exclude_none=True).items():
        setattr(new, field, value)
    # Its trail starts by saying where it came from, as a created job's does
    # (F28); a copy used to start with nothing at all.
    opening = _system_comment(
        new, f"Created as {body.status} — a copy of job {src.id}", by=current_user
    )
    opening.status = body.status
    new.comments.append(opening)

    copies = {}
    for item in sorted(src.items, key=lambda i: i.sort or 0):
        copies[item.id] = JobItem(
            sort=item.sort,
            logo_id=item.logo_id,
            display_type=item.display_type,
            description=item.description,
            sizes=item.sizes,
            stock_code=item.stock_code,
            decoration_type=item.decoration_type,
            emb_code=item.emb_code,
            trs_code=item.trs_code,
            dec_code=item.dec_code,
            stitch_count=item.stitch_count,
            color_count=item.color_count,
            dec_position=item.dec_position,
            order_qty=item.order_qty,
            qty=item.qty,
            weight_kg=item.weight_kg,
            purchase_price=item.purchase_price,
            margin=item.margin,
            margin_percent=item.margin_percent,
            discount=item.discount,
            price_ex=item.price_ex,
            price_inc=item.price_inc,
            # Priced as the source is: inc GST to the cent (S2-08).
            priced_inc=item.priced_inc,
            is_charge=item.is_charge,
            total=item.total,
            hide=item.hide,
            tax_type=item.tax_type,
            # supply and back-order are worked out against stock as it is
            # now, not as it was when the source was raised.
            supply_qty=None,
            b_ord=None,
        )
        new.items.append(copies[item.id])
    # The copy's decorations and alterations apply to the copy's garments.
    links = [
        (copies[item.id], copies[item.applies_to_item_id])
        for item in src.items
        if item.applies_to_item_id in copies
    ]
    for item in src.items:
        line = copies[item.id]
        if item.is_service:
            line.supply_qty, line.b_ord = line.order_qty or 0, 0
            continue
        data = _derive_line_split(
            {
                "supply_qty": line.supply_qty,
                "b_ord": line.b_ord,
                "order_qty": line.order_qty,
                "stock_code": line.stock_code,
            },
            db,
        )
        line.supply_qty = data["supply_qty"]
        line.b_ord = data["b_ord"]

    _total_from_lines(new)
    _recalculate_weight(new, db)
    _settle_money(new)
    # Into ORDER, a copy is an order like any other: credit-checked (it was
    # not), and reserving its own stock.
    _transition_new_job(new, body.status, db, current_user, links=links)
    db.commit()
    return _job_with_relations(db, new.id)


@router.post("/{job_id}/comments")
def add_comment(
    job_id: str,
    body: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_commenter),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    # The portal comments on the orders it booked, and on no other job — it
    # is told no other job is there.
    if not job or (
        current_user.role == "portal" and job.created_by_user_id != current_user.id
    ):
        raise HTTPException(status_code=404, detail="Job not found")
    now = datetime.now()
    comment = JobComment(
        job_id=job_id,
        date=now.strftime("%d/%m/%Y"),
        time=now.strftime("%H:%M"),
        initials=_get_initials(current_user),
        author_name=current_user.full_name or current_user.username,
        status=job.status,
        inc=body.inc,
        is_internal=body.is_internal,
        comment=body.comment,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    # The comment as written, so a caller can show it (or the portal can keep
    # its id) without reading the whole job back.
    return {
        "ok": True,
        "comment": {
            "id": comment.id,
            "date": comment.date,
            "time": comment.time,
            "initials": comment.initials,
            "author_name": comment.author_name,
            "status": comment.status,
            "is_internal": comment.is_internal,
            "comment": comment.comment,
        },
    }


class CommentPin(BaseModel):
    model_config = _KNOWN_FIELDS_ONLY

    pinned: bool


@router.post("/{job_id}/comments/{comment_id}/pin")
def pin_comment(
    job_id: str,
    comment_id: int,
    body: CommentPin,
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Pin a comment to the top of the job's trail, or let it go (Jim2 v4.6):
    the note that matters stays in sight above the system lines."""
    comment = (
        db.query(JobComment)
        .filter(JobComment.id == comment_id, JobComment.job_id == job_id)
        .first()
    )
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found on this job")
    comment.pinned_at = datetime.now(timezone.utc) if body.pinned else None
    db.commit()
    return {"id": comment.id, "pinned_at": comment.pinned_at}


@router.post("/{job_id}/lock")
def toggle_lock(
    job_id: str,
    body: LockToggle,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.locked = body.locked
    now = datetime.now()
    action = "locked" if body.locked else "unlocked"
    comment = JobComment(
        job_id=job_id,
        date=now.strftime("%d/%m/%Y"),
        time=now.strftime("%H:%M"),
        initials=_get_initials(current_user),
        author_name=current_user.full_name or current_user.username,
        status=job.status,
        is_internal=True,
        comment=f"Job {action} by {current_user.full_name or current_user.username}",
    )
    db.add(comment)
    db.commit()
    db.refresh(job)
    return job


@router.post("/{job_id}/payment")
def record_payment(
    job_id: str,
    body: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if body.amount <= 0 or body.amount > float(job.balance_due or 0):
        raise HTTPException(status_code=400, detail="Invalid payment amount")

    _take_payment(
        job,
        db,
        current_user,
        amount=body.amount,
        method=body.method,
        reference=body.reference,
        received_date=body.received_date,
        notes=body.notes,
    )
    # Recalculate live AR balance on customer
    _recalculate_customer_balance(job.customer_id, db)

    db.commit()
    db.refresh(job)
    return job


def _take_payment(
    job: "Job",
    db: Session,
    by: "User",
    *,
    amount: float,
    method: str,
    reference: Optional[str] = None,
    received_date: Optional[str] = None,
    notes: Optional[str] = None,
) -> "JobPayment":
    """Take one payment against one job: what is owed, the ledger, the trail.

    The caller has checked the amount fits what the job owes, and recalculates
    the customer's balance once it has taken all it is taking — one payment on
    a job, or a remittance spread over several (`routers/remittances.py`).
    """
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")

    job.deposit = round(float(job.deposit or 0) + amount, 2)
    job.balance_due = round(float(job.balance_due or 0) - amount, 2)
    if job.balance_due <= 0:
        job.payment_status = "paid"
        job.balance_due = 0
        if not job.payment_date:
            job.payment_date = today
    else:
        job.payment_status = "partial"

    payment = JobPayment(
        job_id=job.id,
        amount=amount,
        method=method,
        reference=reference,
        received_date=received_date or today,
        received_by=by.full_name or by.username,
        notes=notes,
    )
    db.add(payment)
    db.flush()
    try:
        sync_payment(db, payment, job, created_by=by.full_name or by.username)
    except LedgerError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    said = [f"Payment of ${amount:.2f} received via {method}"]
    if reference:
        said.append(f"Ref: {reference}")
    db.add(_system_comment(job, " — ".join(said), by=by))
    return payment


@router.delete("/{job_id}")
def delete_job(
    job_id: str, db: Session = Depends(get_db), _: User = Depends(require_staff)
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _require_mutable(job)

    # A job that has moved stock cannot simply vanish. Its movements carry a FK
    # to it with no ON DELETE, so this used to fail as a 500 from the database
    # rather than a refusal anyone could read — and deleting a committed job
    # would strand its reservation, since nothing releases it on the way out.
    # CANCEL is the supported exit: it goes through the shared transition, which
    # releases the stock and leaves the ledger explaining what happened.
    posted = db.query(StockMovement).filter(StockMovement.job_id == job_id).first()
    if posted is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "has_stock_history",
                "message": (
                    f"Job {job_id} has moved stock and cannot be deleted. "
                    "Set it to CANCEL instead — that releases what it reserved "
                    "and keeps the history."
                ),
            },
        )
    # The same rule for money. A job that has been invoiced or paid against has
    # entries in the ledger that name it; deleting the job would leave revenue
    # and cash that no document explains. CANCEL reverses the invoice properly.
    if has_posted_invoice(db, job_id) or (
        db.query(JobPayment).filter(JobPayment.job_id == job_id).first() is not None
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "error": "has_ledger_history",
                "message": (
                    f"Job {job_id} has been invoiced or paid and cannot be deleted. "
                    "Set it to CANCEL instead — that reverses the invoice in the "
                    "ledger and keeps the record."
                ),
            },
        )
    if job.status in COMMITTED_STATUSES:
        _release_job_stock(job, db)

    db.delete(job)
    db.commit()
    return {"ok": True}


# Job.connote is String(100); further consignments append to it.
_CONNOTE_MAX = 100


def _despatch_address(job: "Job") -> str:
    site = job.ship_to_address
    if site is not None:
        place = " ".join(p for p in (site.city, site.state, site.postcode) if p)
        return ", ".join(p for p in (site.name, site.address, place) if p)
    return job.shipping_address or ""


class NothingToSend(HTTPException):
    """A job with nothing left to send: the refusal a despatch batch passes
    over, naming the job, rather than refusing the whole batch (S2-20)."""


def _record_despatch(
    job: "Job",
    db: Session,
    by: "User",
    session: DispatchSession,
    *,
    ship_via: str = "",
    ship_ref: str = "",
    cartons: int = 1,
    notes: Optional[str] = None,
    advance: bool = False,
    again: bool = False,
    despatch_date: Optional[date] = None,
) -> DispatchSessionLine:
    """Send a job out: the one way, from the despatch list or the job itself.

    A packed job (Pick/Pack, Desp/Ready) becomes FINISH, because FINISH is the
    goods having gone; `advance` then invoices it, through the same transition
    and checks as the status endpoint (F05). The day, the carrier and the
    connote go on the job, and where it went goes on the despatch line, as it
    stood that day (F22). A job still in production is refused.

    A job that has gone already is refused too, unless `again` says this is a
    further consignment: FINISH and the invoiced statuses stay despatchable, so
    a second despatch used to go through and overwrite the first connote.

    What goes of each goods line is recorded on the despatch line: what it has
    ready (picked, else supplied) less what earlier consignments took (F21).
    A job whose goods have nothing left to send is refused. Returns the
    despatch line.

    It goes on `despatch_date`, today unless given (`despatch_day`): after the
    carrier's cut-off a consignment goes the next day (B1-07).
    """
    day = despatch_day(despatch_date)
    if job.status not in DESPATCHABLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Job {job.id} is {job.status} — it can be despatched once it is "
                "packed (Pick/Pack or Desp/Ready)."
            ),
        )
    if job.dispatched_at and not again:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Job {job.id} was despatched on {job.dispatched_at}"
                + (f" (connote {job.connote})" if job.connote else "")
                + ". Send it again only as a further consignment."
            ),
        )
    connote = ship_ref
    if ship_ref and job.connote and again:
        # A further consignment adds its connote; the first one still names
        # what went first.
        connote = f"{job.connote}, {ship_ref}"
        if len(connote) > _CONNOTE_MAX:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Job {job.id} has no room for another connote "
                    f"({job.connote}); record it on a new job."
                ),
            )
    # Worked out before the job moves on. A job with no goods lines (the
    # customer's own garments decorated) has nothing of ours to count.
    going = despatch_documents.still_to_send(job, db)
    if despatch_documents.goods_lines(job) and not going:
        raise NothingToSend(
            status_code=409,
            detail=(
                f"Job {job.id} has nothing left to send: no line has anything "
                "picked or supplied beyond what earlier consignments took."
            ),
        )
    status_at_despatch = job.status
    if job.status in ("Pick/Pack", "Desp/Ready"):
        _apply_status_transition(job, "FINISH", db, by=by)
    if advance and job.status in FINISHED_STATUSES:
        _apply_status_transition(job, "INVOICE", db, by=by)

    now = datetime.now()
    if not job.dispatched_at:
        job.dispatched_at = day
    if ship_via:
        job.ship_via = ship_via
    if ship_ref:
        job.connote = connote
    # The day it goes, always: compared with the server's (UTC) day, every
    # Sydney-morning despatch read as held over (B1-07).
    text = (
        f"Dispatched {day} — Ship Via: {ship_via}, Ref: {ship_ref}, "
        f"Cartons: {cartons}"
    )
    db.add(
        JobComment(
            job_id=job.id,
            date=now.strftime("%d/%m/%Y"),
            time=now.strftime("%H:%M"),
            initials=_get_initials(by),
            author_name=by.full_name or by.username,
            status=status_at_despatch,
            is_internal=True,
            comment=text + (f". {notes}" if notes else ""),
        )
    )
    line = DispatchSessionLine(
        job_id=job.id,
        customer_name=job.customer_name,
        ship_via=ship_via,
        ship_ref=ship_ref,
        cartons=cartons,
        ship_to=job.ship_to,
        address=_despatch_address(job),
        despatch_date=day,
    )
    session.lines.append(line)
    db.flush()  # the despatch line's id, which what went is recorded against
    for item, qty in going:
        line.items.append(
            DispatchLineItem(
                dispatch_session_line_id=line.id, job_item_id=item.id, qty=qty
            )
        )
    return line


def _despatched(line: DispatchSessionLine) -> list:
    """What one despatch sent of each job line, as the despatch responses say."""
    return [{"job_item_id": row.job_item_id, "qty": row.qty} for row in line.items]


@router.post("/{job_id}/dispatch")
def dispatch_job(
    job_id: str,
    body: DispatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Despatch one job: a Dispatch # of one line, the same as a batch of one."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    savepoint = db.begin_nested()
    try:
        session = DispatchSession(user_id=current_user.id)
        db.add(session)
        line = _record_despatch(
            job,
            db,
            current_user,
            session,
            ship_via=body.ship_via,
            ship_ref=body.ship_ref,
            cartons=body.cartons,
            notes=body.notes,
            advance=body.advance_status,
            again=body.again,
            despatch_date=body.despatch_date,
        )
        savepoint.commit()
    except HTTPException:
        savepoint.rollback()
        raise
    db.commit()
    db.refresh(job)
    return {**jsonable_encoder(job), "despatched": _despatched(line)}


def _pick_target(item: "JobItem") -> int:
    return item.supply_qty or item.qty or item.order_qty or 0


def _fully_picked(item: "JobItem") -> bool:
    """Picked to what it supplies, with nothing still to come on back-order."""
    t = _pick_target(item)
    return t > 0 and (item.qty_pick or 0) >= t and not (item.b_ord or 0)


def _goods_lines(job: "Job") -> list:
    return [
        i
        for i in job.items
        if (i.display_type or "product") == "product" and not i.is_service
    ]


def _pick(job: "Job", picks: dict) -> tuple[int, bool]:
    """Record picked quantities on a job's goods lines; say whether all are picked.

    Goods only. A decoration or alteration line is work done to a garment, not
    something taken off a shelf, so it is never picked and its status is never
    overwritten — picking used to mark an alteration 'Picked' and lose the
    garment it applied to (F19).
    """
    goods = {i.id: i for i in _goods_lines(job)}
    services = {i.id for i in job.items if i.is_service}
    asked = [item_id for item_id in picks if item_id in services]
    if asked:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Line(s) {', '.join(map(str, asked))} on job {job.id} are "
                "decoration or alteration work, not goods — they are not picked."
            ),
        )
    updated = 0
    for item_id, qty in picks.items():
        item = goods.get(item_id)
        if not item:
            continue
        item.qty_pick = qty
        if _fully_picked(item):
            item.item_status = "Picked"
        elif qty > 0:
            item.item_status = "Partial"
        else:
            item.item_status = ""
        updated += 1
    if updated:
        # Lines changed off the job form, so the job row is written and its
        # version moves: a form opened before the pick cannot save over it.
        job.updated_at = datetime.now(timezone.utc)
    all_picked = bool(goods) and all(_fully_picked(i) for i in goods.values())
    return updated, all_picked


@router.post("/{job_id}/pick")
def pick_job_items(
    job_id: str,
    body: PickRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Record per-line picked quantities (Jim2 Qty Pick).

    A line picked to its supply qty gets item_status 'Picked'; partly picked
    'Partial'. Returns all_picked so the UI can offer to advance the job.
    """
    job = db.query(Job).options(joinedload(Job.items)).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Locked only: correcting what was picked after the invoice went out is
    # bookkeeping, not a change to what the customer was charged.
    _require_mutable(job, allow_settled=True)

    updated, all_picked = _pick(job, {p.item_id: p.qty_pick for p in body.picks})

    now = datetime.now()
    db.add(
        JobComment(
            job_id=job_id,
            date=now.strftime("%d/%m/%Y"),
            time=now.strftime("%H:%M"),
            initials=_get_initials(current_user),
            author_name=current_user.full_name or current_user.username,
            status=job.status,
            is_internal=True,
            comment=f"Pick/Pack: {updated} line(s) updated"
            + (" — all lines picked" if all_picked else ""),
        )
    )
    db.commit()
    return {"all_picked": all_picked, "job": _job_with_relations(db, job_id)}


@router.post("/{job_id}/unprint")
def unprint_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Revert an INVOICE or PAID job back to FINISH (unprint / recall invoice)."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in ("INVOICE", "PAID"):
        raise HTTPException(
            status_code=400, detail="Can only unprint INVOICE or PAID jobs"
        )
    prev_status = job.status
    # Recalling the invoice puts the shipped stock back on hand — and FINISH is a
    # committed status, so coming back from PAID (which is not) has to re-reserve
    # it too. Doing that by hand here is what left committed understated.
    # Off the ladder: PAID to FINISH is not a step anyone picks, it is a recall.
    _apply_status_transition(job, "FINISH", db, by=current_user, ladder=False)
    now = datetime.now()
    comment = JobComment(
        job_id=job_id,
        date=now.strftime("%d/%m/%Y"),
        time=now.strftime("%H:%M"),
        initials=_get_initials(current_user),
        author_name=current_user.full_name or current_user.username,
        status="FINISH",
        is_internal=True,
        comment=f"Unprinted — status reverted from {prev_status} to FINISH",
    )
    db.add(comment)
    db.commit()
    db.refresh(job)
    return job

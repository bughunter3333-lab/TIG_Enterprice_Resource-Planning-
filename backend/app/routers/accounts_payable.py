from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from types import SimpleNamespace
from typing import Optional
from datetime import date
from decimal import Decimal

from app.database import get_db
from app.models.supplier_bill import SupplierBill
from app.models.supplier_bill_payment import SupplierBillPayment
from app.core import bill_matching
from app.core.dependencies import require_staff
from app.core.ledger import ZERO, LedgerError, money
from app.core.ledger_postings import (
    bill_outstanding,
    bill_owed,
    sync_bill,
    sync_supplier_payment,
    withdraw_bill,
    withdraw_supplier_payment,
)
from app.models.user import User

router = APIRouter(prefix="/ap", tags=["accounts_payable"])

VALID_STATUSES = {"pending", "approved", "paid"}
OPEN_STATUSES = ("pending", "approved")


class BillCreate(BaseModel):
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    po_id: Optional[str] = None
    bill_number: Optional[str] = None
    bill_date: Optional[str] = None
    due_date: Optional[str] = None
    description: Optional[str] = None
    amount_ex: float = 0
    tax: float = 0
    amount_inc: float = 0
    status: str = "pending"
    notes: Optional[str] = None
    account_id: Optional[int] = None


class BillUpdate(BaseModel):
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    po_id: Optional[str] = None
    bill_number: Optional[str] = None
    bill_date: Optional[str] = None
    due_date: Optional[str] = None
    description: Optional[str] = None
    amount_ex: Optional[float] = None
    tax: Optional[float] = None
    amount_inc: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    account_id: Optional[int] = None


class CreditApply(BaseModel):
    # The supplier's bill the credit note comes off.
    bill_id: int


class BillPay(BaseModel):
    # This payment's amount — added to what has already been paid, never in
    # place of it.
    paid_amount: float = Field(gt=0)
    paid_date: Optional[date] = None
    reference: Optional[str] = Field(None, max_length=100)


def _who(user: User) -> str:
    return user.full_name or user.username


def _post_to_ledger(db: Session, bill: SupplierBill, username: str) -> None:
    """Bring the ledger in line with the bill.

    Called after every change rather than only on the ones that obviously move
    money — the sync writes nothing when nothing changed, and deciding in each
    endpoint which fields "matter" is how a change gets missed. Payments post
    on their own, one entry each, when they are recorded.
    """
    try:
        sync_bill(db, bill, created_by=username)
    except LedgerError as exc:
        raise HTTPException(409, str(exc)) from exc


def _paid(bill: SupplierBill) -> Decimal:
    return sum((money(p.amount) for p in bill.payments), ZERO)


def _settle(bill: SupplierBill) -> None:
    """Make the bill's paid amount, paid date and status say what its payments say.

    'paid' is never set by hand: a bill is paid when its payments, and the
    credit notes applied to it, cover it; a paid bill whose total rises, or
    whose payment or credit is taken back, is open again — 'approved', since it
    was cleared for payment once. A credit note is settled once it is applied.
    """
    paid = _paid(bill)
    bill.paid_amount = paid
    bill.paid_date = max(
        (p.paid_date for p in bill.payments if p.paid_date), default=None
    )
    owed = bill_owed(bill)
    if bill.applied_to_bill_id is not None or (
        owed > ZERO and bill_outstanding(bill, paid) <= ZERO
    ):
        bill.status = "paid"
    elif bill.status == "paid":
        bill.status = "approved"


def _dollars(amount: Decimal) -> str:
    return f"${amount:,.2f}"


def _serialize(
    b: SupplierBill, with_payments: bool = False, po_match: Optional[dict] = None
) -> dict:
    out = {
        "id": b.id,
        "supplier_id": b.supplier_id,
        "supplier_name": b.supplier_name,
        "po_id": b.po_id,
        "bill_number": b.bill_number,
        "bill_date": b.bill_date,
        "due_date": b.due_date,
        "description": b.description,
        "amount_ex": float(b.amount_ex or 0),
        "tax": float(b.tax or 0),
        "amount_inc": float(b.amount_inc or 0),
        "status": b.status,
        "paid_date": b.paid_date,
        "paid_amount": float(b.paid_amount or 0),
        "outstanding": float(bill_outstanding(b)),
        "notes": b.notes,
        "account_id": b.account_id,
        "applied_to_bill_id": b.applied_to_bill_id,
        # Named as the screen names it, whatever list the bill is in.
        "applied_to_bill_number": (
            (b.applied_to.bill_number or f"#{b.applied_to.id}")
            if b.applied_to is not None
            else None
        ),
        "created_at": b.created_at.isoformat() if b.created_at else None,
        # Against a PO: what arrived against it, and whether the bills for it
        # come to that (app/core/bill_matching.py). None for any other bill.
        "po_match": po_match,
    }
    if with_payments:
        out["payments"] = [
            {
                "id": p.id,
                "amount": float(p.amount),
                "paid_date": p.paid_date,
                "reference": p.reference,
                "paid_by": p.paid_by,
            }
            for p in b.payments
        ]
    return out


def _full(db: Session, bill: SupplierBill) -> dict:
    """One bill as its own screen shows it: payments, and its PO match."""
    return _serialize(
        bill, with_payments=True, po_match=bill_matching.po_matches(db, [bill])[bill.id]
    )


def _get_bill(db: Session, bill_id: int) -> SupplierBill:
    bill = db.query(SupplierBill).filter(SupplierBill.id == bill_id).first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    return bill


@router.get("/bills")
def list_bills(
    status: Optional[str] = Query(None),
    supplier_id: Optional[str] = Query(None),
    supplier_name: Optional[str] = Query(None),
    overdue_only: bool = Query(False),
    # Still open and not a credit already applied: what a credit note can come
    # off. Asked for by the apply screen, which otherwise read the first 500
    # bills of a supplier — the oldest, all paid (S2-09).
    open_only: bool = Query(False),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    q = db.query(SupplierBill)
    if status:
        q = q.filter(SupplierBill.status == status)
    if supplier_id:
        q = q.filter(SupplierBill.supplier_id == supplier_id)
    if supplier_name:
        q = q.filter(SupplierBill.supplier_name == supplier_name)
    if open_only:
        q = q.filter(
            SupplierBill.status.in_(OPEN_STATUSES),
            SupplierBill.applied_to_bill_id.is_(None),
        )
    if overdue_only:
        today = date.today().isoformat()
        q = q.filter(
            SupplierBill.due_date < today,
            SupplierBill.status.in_(OPEN_STATUSES),
        )
    bills = (
        q.order_by(SupplierBill.due_date.asc().nullslast())
        .offset(offset)
        .limit(limit)
        .all()
    )
    matches = bill_matching.po_matches(db, bills)
    return [_serialize(b, po_match=matches[b.id]) for b in bills]


@router.post("/bills", status_code=201)
def create_bill(
    data: BillCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    if data.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status. Use: {sorted(VALID_STATUSES)}")
    if data.status == "paid":
        raise HTTPException(
            400,
            "A bill is marked paid by recording its payment: enter the bill, "
            "then record the payment against it",
        )
    bill = SupplierBill(
        supplier_id=data.supplier_id,
        supplier_name=data.supplier_name,
        po_id=data.po_id,
        bill_number=data.bill_number,
        bill_date=data.bill_date,
        due_date=data.due_date,
        description=data.description,
        amount_ex=data.amount_ex,
        tax=data.tax,
        amount_inc=data.amount_inc,
        status=data.status,
        notes=data.notes,
        account_id=data.account_id,
        paid_amount=0,
    )
    db.add(bill)
    db.flush()
    _post_to_ledger(db, bill, current_user.username)
    db.commit()
    db.refresh(bill)
    return _full(db, bill)


@router.get("/bills/{bill_id}")
def get_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    return _full(db, _get_bill(db, bill_id))


def _check_credit_edit(
    db: Session, bill: SupplierBill, changes: dict, gross: Decimal
) -> None:
    """An edit keeps what `apply_credit` checked when the credit was applied.

    Edited afterwards, an applied credit note could come to more than its bill
    had outstanding, leaving the bill 'paid' below nothing and the supplier's
    debt to TIG on no list; and either side could move to another supplier,
    so one supplier's credit paid another's bill.
    """
    linked = bool(bill.credits) or bill.applied_to_bill_id is not None
    supplier = changes.get("supplier_id", bill.supplier_id) or changes.get(
        "supplier_name", bill.supplier_name
    )
    if linked and supplier != (bill.supplier_id or bill.supplier_name):
        raise HTTPException(
            409,
            "A credit note applied to a bill stays with that bill's supplier — "
            "delete the credit note first",
        )
    if bill.applied_to_bill_id is None:
        return
    if gross >= ZERO:
        raise HTTPException(
            409,
            f"This credit note is applied to bill {bill.applied_to_bill_id}, so it "
            "stays a credit — delete it to take it off the bill",
        )
    target = _get_bill(db, bill.applied_to_bill_id)
    others = sum((bill_owed(c) for c in target.credits if c.id != bill.id), ZERO)
    if bill_owed(target) + others + gross - _paid(target) < ZERO:
        raise HTTPException(
            409,
            f"The credit would be {_dollars(-gross)}, more than bill "
            f"{target.bill_number or target.id} has outstanding",
        )


@router.patch("/bills/{bill_id}")
def update_bill(
    bill_id: int,
    data: BillUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    bill = _get_bill(db, bill_id)
    if data.status is not None and data.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status. Use: {sorted(VALID_STATUSES)}")
    changes = data.model_dump(exclude_none=True)

    # Checked against the bill as it would be, before anything is changed.
    after = SimpleNamespace(
        **{
            k: changes.get(k, getattr(bill, k))
            for k in ("amount_inc", "amount_ex", "tax")
        }
    )
    # Net of the credit notes applied to it (S2-09). A credit note itself is
    # owed below zero and has nothing paid, which this used to refuse too.
    gross = bill_owed(after)
    credited = sum((bill_owed(c) for c in bill.credits), ZERO)
    owed = gross + credited
    paid = _paid(bill)
    if (gross >= ZERO or bill.credits) and paid > owed:
        raise HTTPException(
            409,
            f"{_dollars(paid)} has been paid"
            + (f" and {_dollars(-credited)} credited" if bill.credits else "")
            + " against this bill, so its total cannot be less than that. "
            "Take a payment back first.",
        )
    _check_credit_edit(db, bill, changes, gross)
    covered = gross > ZERO and paid >= owed
    if data.status == "paid" and not covered:
        raise HTTPException(
            400, "A bill is marked paid by recording its payments, not by hand"
        )
    if data.status in OPEN_STATUSES and covered:
        raise HTTPException(
            400,
            "This bill's payments cover it, so it stays paid. Take a payment "
            "back to reopen it.",
        )

    for field, value in changes.items():
        setattr(bill, field, value)
    # Set when sent, even as null: null is how a bill goes back to "decide by
    # kind", and exclude_none above would drop it and keep the old account.
    if "account_id" in data.model_fields_set:
        bill.account_id = data.account_id
    _settle(bill)
    if bill.applied_to_bill_id is not None:
        # A credit note's new amount moves what its bill is owed.
        _settle(_get_bill(db, bill.applied_to_bill_id))
    db.flush()
    _post_to_ledger(db, bill, current_user.username)
    db.commit()
    db.refresh(bill)
    return _full(db, bill)


@router.post("/bills/{bill_id}/pay")
def pay_bill(
    bill_id: int,
    data: BillPay,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    bill = _get_bill(db, bill_id)
    if bill_owed(bill) < ZERO:
        raise HTTPException(
            409,
            "This is a credit note: apply it to one of the supplier's bills "
            "rather than paying it",
        )
    outstanding = bill_outstanding(bill, _paid(bill))
    amount = money(data.paid_amount)
    if outstanding <= ZERO:
        raise HTTPException(409, "This bill is already paid in full")
    if amount > outstanding:
        raise HTTPException(
            409,
            f"That would pay {_dollars(amount)} on a bill with "
            f"{_dollars(outstanding)} outstanding",
        )
    payment = SupplierBillPayment(
        amount=amount,
        paid_date=(data.paid_date or date.today()).isoformat(),
        reference=data.reference,
        paid_by=_who(current_user),
    )
    bill.payments.append(payment)
    db.flush()
    try:
        sync_supplier_payment(db, payment, bill, created_by=_who(current_user))
    except LedgerError as exc:
        raise HTTPException(409, str(exc)) from exc
    _settle(bill)
    db.commit()
    db.refresh(bill)
    return _full(db, bill)


@router.post("/bills/{credit_id}/apply")
def apply_credit(
    credit_id: int,
    data: CreditApply,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Take a supplier's credit note off one of its bills (S2-09).

    A short shipment, faulty goods or a rebate comes as a credit note. It was
    accepted as a negative bill and then could be neither paid (a payment is
    more than nothing) nor set against the bill, so the bill read as owed it
    for ever. Applied, the bill is owed that much less, and once its payments
    cover the rest it is paid. Nothing posts: both are in the ledger already,
    and the payable nets them.
    """
    credit = _get_bill(db, credit_id)
    amount = -bill_owed(credit)
    if amount <= ZERO:
        raise HTTPException(
            422, "Only a credit note — a bill for less than nothing — is applied"
        )
    if credit.applied_to_bill_id is not None:
        raise HTTPException(
            409, f"This credit note is applied to bill {credit.applied_to_bill_id}"
        )
    bill = _get_bill(db, data.bill_id)
    if bill_owed(bill) <= ZERO:
        raise HTTPException(422, "A credit note is applied to a bill, not to a credit")
    if (bill.supplier_id or bill.supplier_name) != (
        credit.supplier_id or credit.supplier_name
    ):
        raise HTTPException(422, "That bill is from another supplier")
    outstanding = bill_outstanding(bill, _paid(bill))
    if amount > outstanding:
        raise HTTPException(
            409,
            f"The credit is {_dollars(amount)} and the bill has "
            f"{_dollars(outstanding)} outstanding",
        )
    credit.applied_to_bill_id = bill.id
    db.flush()
    db.expire(bill, ["credits"])
    _settle(credit)
    _settle(bill)
    db.commit()
    return _full(db, bill)


@router.delete("/bills/{bill_id}/payments/{payment_id}")
def delete_bill_payment(
    bill_id: int,
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Take back a payment recorded in error. Its ledger entry is reversed."""
    bill = _get_bill(db, bill_id)
    payment = next((p for p in bill.payments if p.id == payment_id), None)
    if payment is None:
        raise HTTPException(404, "That payment is not on this bill")
    try:
        withdraw_supplier_payment(db, payment, bill, created_by=_who(current_user))
    except LedgerError as exc:
        raise HTTPException(409, str(exc)) from exc
    bill.payments.remove(payment)
    _settle(bill)
    db.commit()
    db.refresh(bill)
    return _full(db, bill)


@router.delete("/bills/{bill_id}", status_code=204)
def delete_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    bill = _get_bill(db, bill_id)
    # The bill goes; what it posted is reversed, not erased. The ledger keeps
    # the record that the bill existed and was withdrawn.
    try:
        withdraw_bill(db, bill, created_by=current_user.username)
    except LedgerError as exc:
        raise HTTPException(409, str(exc)) from exc
    # A credit note applied to it is unapplied; a bill it was applied to is
    # owed it again.
    freed = list(bill.credits)
    for credit in freed:
        credit.applied_to_bill_id = None
    target = (
        _get_bill(db, bill.applied_to_bill_id)
        if bill.applied_to_bill_id is not None
        else None
    )
    db.delete(bill)
    db.flush()
    for credit in freed:
        _settle(credit)
    if target is not None:
        db.expire(target, ["credits"])
        _settle(target)
    db.commit()


@router.get("/summary")
def ap_summary(
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    today = date.today().isoformat()
    all_open = (
        db.query(SupplierBill).filter(SupplierBill.status.in_(OPEN_STATUSES)).all()
    )
    # A credit note not yet applied nets into what is open, but is never a
    # bill overdue or falling due (S2-09): the list says so of none.
    bills = [b for b in all_open if bill_owed(b) > ZERO]
    overdue = [b for b in bills if b.due_date and b.due_date < today]
    due_this_week = [
        b for b in bills if b.due_date and today <= b.due_date <= _week_end(today)
    ]

    def owing(bills):
        # What is still owed, not the bill's total: a part-paid bill is open for
        # its balance.
        return round(float(sum((bill_outstanding(b) for b in bills), ZERO)), 2)

    return {
        "total_open_count": len(all_open),
        "total_open_amount": owing(all_open),
        "overdue_count": len(overdue),
        "overdue_amount": owing(overdue),
        "due_this_week_count": len(due_this_week),
        "due_this_week_amount": owing(due_this_week),
    }


def _week_end(today_iso: str) -> str:
    from datetime import timedelta

    d = date.fromisoformat(today_iso)
    days_until_sunday = 6 - d.weekday()
    return (d + timedelta(days=days_until_sunday)).isoformat()

"""A customer remittance: one payment, several invoices (finding F35).

Portal clients pay many small per-employee invoices in one EFT. It had to be
recorded as a payment per job, each typed by the caller with the remittance's
reference retyped. Now it is recorded once, allocated as given or to the
customer's oldest invoices first, and comes out as one payment per job —
taken, posted and commented on exactly as a single job's payment is
(`_take_payment` in routers/jobs.py).

All or nothing, and allocated in full: a remittance for more than the customer
owes is refused rather than held as unapplied cash, which would be a credit on
the ledger that no invoice explains.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.dependencies import require_staff
from app.core.ledger import ZERO, money
from app.core.ledger_postings import INVOICED_STATUSES
from app.database import get_db
from app.models.customer import Customer
from app.models.job import Job
from app.models.user import User
from app.routers.jobs import _recalculate_customer_balance, _take_payment

router = APIRouter(prefix="/customers", tags=["customers"])


class Allocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: str
    amount: float = Field(gt=0)


class RemittanceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: float = Field(gt=0)
    method: str = Field("EFT", max_length=50)
    reference: Optional[str] = Field(None, max_length=100)
    received_date: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=500)
    # Omitted: the customer's invoices, oldest first, until it is used up.
    allocations: Optional[List[Allocation]] = None


def _dollars(amount) -> str:
    return f"${amount:,.2f}"


def _oldest_first(db: Session, customer_id: str, amount) -> list:
    owing = (
        db.query(Job)
        .filter(
            Job.customer_id == customer_id,
            Job.status.in_(list(INVOICED_STATUSES)),
            Job.balance_due > 0,
        )
        .order_by(Job.invoice_date.asc().nullslast(), Job.id.asc())
        .all()
    )
    owed = sum((money(j.balance_due) for j in owing), ZERO)
    if amount > owed:
        raise HTTPException(
            status_code=422,
            detail=(
                f"The remittance is {_dollars(amount)} but the customer owes "
                f"{_dollars(owed)} on their invoices"
            ),
        )
    plan, left = [], amount
    for job in owing:
        if left <= ZERO:
            break
        take = min(money(job.balance_due), left)
        plan.append((job, take))
        left -= take
    return plan


def _as_given(db: Session, customer_id: str, amount, allocations: list) -> list:
    total = sum((money(a.amount) for a in allocations), ZERO)
    if total != amount:
        raise HTTPException(
            status_code=422,
            detail=(
                f"The allocations come to {_dollars(total)}; the remittance is "
                f"{_dollars(amount)}. Allocate all of it."
            ),
        )
    # One share per job. Each allocation used to be checked against the job's
    # whole balance, so naming an invoice twice paid it twice over.
    shares: dict = {}
    for allocation in allocations:
        shares[allocation.job_id] = shares.get(allocation.job_id, ZERO) + money(
            allocation.amount
        )
    plan = []
    for job_id, share in shares.items():
        job = db.get(Job, job_id)
        if job is None or job.customer_id != customer_id:
            raise HTTPException(
                status_code=422,
                detail=f"{job_id} is not a job of this customer",
            )
        # Invoices only, as oldest-first pays. Cash on a quote or a cancelled
        # job credited receivables against no invoice the customer owes.
        if job.status not in INVOICED_STATUSES:
            raise HTTPException(
                status_code=422,
                detail=f"{job.id} is not an invoice ({job.status}); a remittance pays invoices",
            )
        if share > money(job.balance_due):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"{job.id} owes {_dollars(money(job.balance_due))}; "
                    f"{_dollars(share)} was allocated to it"
                ),
            )
        plan.append((job, share))
    return plan


@router.post("/{customer_id}/remittances")
def record_remittance(
    customer_id: str,
    body: RemittanceIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    if db.get(Customer, customer_id) is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    amount = money(body.amount)
    plan = (
        _as_given(db, customer_id, amount, body.allocations)
        if body.allocations is not None
        else _oldest_first(db, customer_id, amount)
    )

    savepoint = db.begin_nested()
    try:
        payments = [
            (
                job,
                _take_payment(
                    job,
                    db,
                    current_user,
                    amount=float(share),
                    method=body.method,
                    reference=body.reference,
                    received_date=body.received_date,
                    notes=body.notes,
                ),
            )
            for job, share in plan
        ]
        _recalculate_customer_balance(customer_id, db)
        savepoint.commit()
    except HTTPException:
        savepoint.rollback()
        raise
    db.commit()
    customer = db.get(Customer, customer_id)
    db.refresh(customer)
    return {
        "customer_id": customer_id,
        "reference": body.reference,
        "amount": float(amount),
        "payments": [
            {
                "job_id": job.id,
                "amount": float(payment.amount),
                "payment_id": payment.id,
            }
            for job, payment in payments
        ],
        "customer_balance": float(customer.balance or 0),
    }

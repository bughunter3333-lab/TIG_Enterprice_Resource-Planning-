"""Row locks, always taken in one order, so two requests never deadlock.

Two requests that lock the same rows in opposite orders each wait for the
other, and Postgres aborts one — a server error for whoever loses. It happened
here between invoicing (stock, then the customer) and confirming an order for
the same customer (the customer, then the stock), and between remittances
that took a customer's invoices by date and by number.

The order. A request takes each lock only after those above it; taking a row
it already holds again is free.

1. The document-number sequence (`invoice_numbers._lock_sequence`), when the
   request may issue an invoice or credit-note number.
2. The one document the request is about: a purchase order or goods receipt,
   a credit note.
3. Jobs, by id.
4. Customers, by id.
5. Stock, by SKU: the item, then its positions by branch.

Rows are locked FOR NO KEY UPDATE: it stops another writer, but not the KEY
SHARE lock Postgres takes on a row when a row referring to it is inserted (a
job line, a comment, a payment, a movement) — FOR UPDATE would make each such
insert wait. A lock taken inside a savepoint that is rolled back is let go, so
a batch takes what it needs before its first savepoint.

SQLite ignores all of it; `tests/postgres` checks the order on real Postgres.
"""

from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.inventory import InventoryItem
from app.models.job import Job
from app.models.stock_location import StockLocation


def _ids(values: Iterable[Optional[str]]) -> list[str]:
    return sorted({v for v in values if v})


def lock_jobs(db: Session, ids: Iterable[Optional[str]]) -> None:
    """Lock these jobs, by id: the rows only, leaving loaded objects as they are."""
    for job_id in _ids(ids):
        db.query(Job.id).filter(Job.id == job_id).with_for_update(
            key_share=True
        ).first()


def locked_job(db: Session, job_id: str) -> Optional[Job]:
    """A job read under its lock, as it is now — for a request about to change it.

    Read first and locked later, a request writes over whatever was committed in
    between: the job's version catches that, but only as an error.
    """
    return (
        db.query(Job)
        .filter(Job.id == job_id)
        .with_for_update(key_share=True)
        .populate_existing()
        .first()
    )


def lock_customers(db: Session, ids: Iterable[Optional[str]]) -> None:
    """Lock these customers, by id — after any jobs, before any stock."""
    for customer_id in _ids(ids):
        db.query(Customer.id).filter(Customer.id == customer_id).with_for_update(
            key_share=True
        ).first()


def lock_stock(db: Session, skus: Iterable[Optional[str]]) -> None:
    """Lock these SKUs' items and positions, by SKU, before any is written.

    For a request that moves several SKUs in an order of its own — a batch of
    jobs, a delivery of several lines — so its writes cannot cross another's.
    """
    for sku in _ids(skus):
        db.query(InventoryItem.sku).filter(InventoryItem.sku == sku).with_for_update(
            key_share=True
        ).first()
        db.query(StockLocation.id).filter(StockLocation.sku == sku).order_by(
            StockLocation.branch
        ).with_for_update(key_share=True).all()

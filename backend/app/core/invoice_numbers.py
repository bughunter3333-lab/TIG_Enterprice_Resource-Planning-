"""Tax invoice numbers: issued in sequence, never used twice (finding F24).

A number used to be whatever someone typed into the job before invoicing. The
company's invoice prefix was stored and read by nothing, nothing issued the
next number, and nothing stopped two jobs carrying the same one — a portal or a
despatch run had no way to number an invoice at all.

Now invoicing a job with no number issues one: the company prefix followed by
the next number in the sequence. The sequence is `invoice_next_number` on the
company settings, so the shop can carry on from where Jim2 stopped; left empty,
it carries on from the highest number already used under the prefix. A number
someone has typed by hand is never issued again, and no number may sit on two
jobs.
"""

import re
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.job import Job
from app.models.settings import CompanySettings

DEFAULT_PREFIX = "INV"


def _normal(number: str) -> str:
    return number.strip().lower()


def holder_of(db: Session, number: Optional[str], except_job_id=None) -> Optional[str]:
    """The id of another job already carrying this invoice number, if any.

    Compared without case or surrounding space: "inv-77 " and "INV-77" are the
    same number on a customer's statement.
    """
    if not number or not number.strip():
        return None
    q = db.query(Job.id).filter(func.lower(func.trim(Job.invoice)) == _normal(number))
    if except_job_id is not None:
        q = q.filter(Job.id != except_job_id)
    row = q.first()
    return row[0] if row else None


def _highest_used(db: Session, prefix: str) -> int:
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$", re.IGNORECASE)
    highest = 0
    for (invoice,) in db.query(Job.invoice).filter(Job.invoice.isnot(None)):
        found = pattern.match(invoice.strip())
        if found:
            highest = max(highest, int(found.group(1)))
    return highest


def _lock_sequence(db: Session) -> Optional[CompanySettings]:
    """The company settings row, locked until the transaction ends.

    Every way a number reaches a job takes this lock first — issued or typed —
    so one cannot be checked free while the other is putting it on a job.
    """
    return db.query(CompanySettings).with_for_update().first()


def typed_holder(
    db: Session, number: Optional[str], except_job_id=None
) -> Optional[str]:
    """`holder_of` for a number typed by hand, checked under the sequence lock.

    Unlocked, the check read before either write committed: a typed INV105
    and an INV105 being issued at the same moment both went on (F24).
    """
    if number and number.strip():
        _lock_sequence(db)
    return holder_of(db, number, except_job_id=except_job_id)


def issue(db: Session) -> str:
    """The next invoice number, reserved: the sequence moves past it.

    The settings row is locked for the length of the transaction, so two
    invoices issued at the same moment cannot be handed the same number.
    """
    settings = _lock_sequence(db)
    if settings is None:
        settings = CompanySettings(id=1)
        db.add(settings)
    prefix = (settings.invoice_prefix or DEFAULT_PREFIX).strip()
    number = max(settings.invoice_next_number or 1, _highest_used(db, prefix) + 1)
    while holder_of(db, f"{prefix}{number}") is not None:
        number += 1
    settings.invoice_next_number = number + 1
    return f"{prefix}{number}"

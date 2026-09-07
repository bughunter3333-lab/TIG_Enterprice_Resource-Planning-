"""Recording who changed a stock record, and to what.

The trail is written from the router rather than from a SQLAlchemy event hook.
An event hook would catch every write including the ones the system makes for
itself — a commit from a job status change, a receipt posting stock — and bury
the handful of deliberate edits a person made under thousands of machine ones.
This table answers "who typed this", so only the endpoints a person drives
write to it.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.stock_audit import StockAuditEntry

# Quantities are here as well as bins: the endpoint accepts them, so a person
# can type one, so it has to be answerable for.
AUDITED_LOCATION_FIELDS = (
    "zone",
    "primary_bin_1",
    "max_qty_bin_1",
    "primary_bin_2",
    "max_qty_bin_2",
    "qty_on_hand",
    "committed_qty",
    "backorder_qty",
    "on_po_qty",
)


def _text(value) -> Optional[str]:
    """Empty string and null are the same absence once a bin is cleared."""
    if value is None or value == "":
        return None
    return str(value)


def snapshot_location(loc) -> dict:
    return {field: getattr(loc, field, None) for field in AUDITED_LOCATION_FIELDS}


def record_location_change(
    db: Session,
    *,
    sku: str,
    branch: str,
    action: str,
    before: dict,
    after: dict,
    username: str,
) -> int:
    """Write one row per field that actually moved. Returns how many."""
    written = 0
    for field in AUDITED_LOCATION_FIELDS:
        old = _text(before.get(field))
        new = _text(after.get(field))
        if old == new:
            continue
        db.add(
            StockAuditEntry(
                sku=sku,
                branch=branch,
                action=action,
                field=field,
                old_value=old,
                new_value=new,
                changed_by=username,
                changed_at=datetime.now(timezone.utc),
            )
        )
        written += 1
    return written


def record_location_deleted(
    db: Session, *, sku: str, branch: str, username: str
) -> None:
    """A removed position is one event, not a field-by-field unset."""
    db.add(
        StockAuditEntry(
            sku=sku,
            branch=branch,
            action="deleted",
            field="location",
            old_value=branch,
            new_value=None,
            changed_by=username,
            changed_at=datetime.now(timezone.utc),
        )
    )

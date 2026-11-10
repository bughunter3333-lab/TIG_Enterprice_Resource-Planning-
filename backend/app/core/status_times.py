"""How long a job may sit at each status (roadmap Phase 1, item 1).

docs/superpowers/specs/2026-11-09-status-times.md. An allowance is whole
working days at a status; 0 means no limit. The defaults are TIG's starting
point; an admin changes them. The days themselves are counted on the screen,
in the person's own (Sydney) day, from `Job.status_changed_at`.
"""

import json
from typing import Mapping

from sqlalchemy.orm import Session

from app.models.admin_setting import AdminSetting

SETTING_KEY = "status_allowances"
MAX_DAYS = 60

# Open statuses only: a quote has its validity date, an invoice its terms.
DEFAULT_ALLOWANCES = {
    "New": 1,  # Booked: released within a day
    "ORDER": 1,  # Confirmed
    "In Progress": 3,
    "PROOF": 3,  # with the customer
    "Picked": 1,
    "Inco/Pick": 5,  # waiting on stock
    "PRINT": 2,
    "ProdExt": 7,  # at an outside decorator
    "Pick/Pack": 1,
    "Desp/Ready": 1,
    "FINISH": 2,  # gone, to be checked
    "Ready": 2,  # checked, to be invoiced
}


def allowances(db: Session) -> dict[str, int]:
    """Every status's allowance: the admin's where set, else the default."""
    row = db.get(AdminSetting, SETTING_KEY)
    stored: Mapping = {}
    if row and row.value:
        try:
            stored = json.loads(row.value)
        except ValueError:
            stored = {}  # an unreadable setting falls back, never breaks a screen
    if not isinstance(stored, Mapping):
        stored = {}  # valid JSON that is not a table (the generic settings PUT)
    return {
        status: (stored[status] if _a_day_count(stored.get(status)) else days)
        for status, days in DEFAULT_ALLOWANCES.items()
    }


def _a_day_count(value) -> bool:
    """A whole number of working days in range — bools are not numbers here."""
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and 0 <= value <= MAX_DAYS
    )


def save(db: Session, changes: Mapping[str, int]) -> dict[str, int]:
    """Store the allowances given, over the current ones."""
    merged = {**allowances(db), **changes}
    row = db.get(AdminSetting, SETTING_KEY)
    if row is None:
        row = AdminSetting(key=SETTING_KEY)
        db.add(row)
    row.value = json.dumps(merged, sort_keys=True)
    db.commit()
    return merged

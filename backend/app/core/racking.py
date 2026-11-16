"""The racking a branch has, read on the server the way the map reads it.

A bin on a stock position has to be a real box: an aisle the branch has, a bay
and a level inside it, a box number the level holds. Which boxes exist is the
branch's racking layout — an admin setting, `warehouse_layout:<branch>`, that
the 3D warehouse map validates before drawing (frontend
`modules/warehouse/layout.js`). The server reads the same setting by the same
rules, so the two agree on what a real box is: a stored layout that does not
pass is not used, and the default racking stands in for it, exactly as on the
map. `tests/unit/test_racking.py` pins the default against the frontend's.

It was not checked before. Any text was accepted as a bin, so a mistyped code
was a stock position nothing could find: not on the map, and printed on a
picking slip as a place that is not there.
"""

import json
import re
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.bin_codes import parse_box_code, same_bin, tidy
from app.models.admin_setting import AdminSetting

LEVEL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

# The HQ racking as the owner drew it. Mirrors DEFAULT_LAYOUT in layout.js.
DEFAULT_LAYOUT = {
    "aisles": ["E", "D", "C", "B", "A"],
    "baysPerAisle": 10,
    "beams": [3, 3, 3, 3],
    "excessShelf": True,
    "positions": 6,
    "oddSide": "right",
}


# An aisle's name, once tidied: letters, and no longer than a rack section's
# aisle column holds. The map's validateLayout holds the same two limits.
_AISLE = re.compile(r"[A-Z]{1,10}")


def _whole(value: Any, low: int, high: int) -> bool:
    """A whole number in range. JSON may spell 10 as 10.0; true is not 1."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return low <= value <= high
    # Not float(value): an integer too long for a float raises, and this has
    # to answer "no", not fail.
    return isinstance(value, float) and value.is_integer() and low <= value <= high


def _not_json(constant: str):
    # NaN and Infinity are Python's extension; the map's JSON.parse refuses them.
    raise ValueError(constant)


def read_layout(raw: Optional[str]) -> dict:
    """A stored layout, checked as the map checks it; the default if it fails."""
    if raw is None or raw == "":
        return DEFAULT_LAYOUT
    try:
        value = json.loads(raw, parse_constant=_not_json)
    except (TypeError, ValueError, RecursionError):
        # Anything that cannot be read is no layout: nesting too deep to parse
        # included, which is not a ValueError.
        return DEFAULT_LAYOUT
    if not isinstance(value, dict):
        return DEFAULT_LAYOUT

    listed = value.get("aisles")
    # Names only: a number or a null among them is not an aisle (and the two
    # sides would spell it differently — "None" here, "null" on the map).
    named = isinstance(listed, list) and all(isinstance(a, str) for a in listed)
    aisles = [tidy(a).upper() for a in listed] if named else []
    beams = value.get("beams") if isinstance(value.get("beams"), list) else []
    sound = (
        1 <= len(aisles) <= 26
        and all(_AISLE.fullmatch(a) for a in aisles)
        and len(set(aisles)) == len(aisles)
        and _whole(value.get("baysPerAisle"), 1, 60)
        and len(beams) >= 1
        and all(_whole(rows, 1, 26) for rows in beams)
        and sum(beams) <= 26
        and _whole(value.get("positions"), 1, 20)
        and isinstance(value.get("excessShelf"), bool)
        and value.get("oddSide") in ("left", "right")
    )
    if not sound:
        return DEFAULT_LAYOUT
    return {
        "aisles": aisles,
        "baysPerAisle": int(value["baysPerAisle"]),
        "beams": [int(rows) for rows in beams],
        "excessShelf": value["excessShelf"],
        "positions": int(value["positions"]),
        "oddSide": value["oddSide"],
    }


def layout_for(db: Session, branch: str) -> dict:
    """The racking at a branch: its saved layout, or the default."""
    row = (
        db.query(AdminSetting)
        .filter(AdminSetting.key == f"warehouse_layout:{branch}")
        .first()
    )
    return read_layout(row.value if row else None)


def box_problem(layout: dict, box: tuple[str, int, str, int]) -> Optional[str]:
    """Why a box is not in this racking, in words — None when it is."""
    aisle, bay, level, position = box
    levels = sum(layout["beams"])
    if aisle not in layout["aisles"]:
        return f"there is no aisle {aisle} (aisles {', '.join(layout['aisles'])})"
    if bay > layout["baysPerAisle"]:
        return f"there is no bay {bay} (bays 1 to {layout['baysPerAisle']})"
    if len(level) != 1 or LEVEL_LETTERS.index(level) >= levels:
        return f"there is no level {level} (levels A to {LEVEL_LETTERS[levels - 1]})"
    if position > layout["positions"]:
        return (
            f"there is no box {position} on a level (boxes 1 to {layout['positions']})"
        )
    return None


def checked_bin(
    db: Session,
    branch: str,
    value: Optional[str],
    what: str,
    current: Optional[str] = None,
) -> Optional[str]:
    """`value` as the bin to store, or a 400 saying exactly what is wrong.

    Nothing is None. A box in the branch's racking comes back under its plain
    spelling. Anything else is refused — unless it is what the position
    already holds (`current`): a code from before this was checked stays until
    it is re-slotted, so a row with an old bin can still have its other fields
    saved.
    """
    text = tidy(value)
    if not text:
        return None
    unchanged = bool(current) and same_bin(current, text)
    box = parse_box_code(text)
    if box is None:
        if unchanged:
            return current
        raise HTTPException(
            status_code=400,
            detail=(
                f"{what} '{text}' is not an aisle.bay.level.box code, e.g. B.3.H.1"
            ),
        )
    problem = box_problem(layout_for(db, branch), box)
    if problem:
        if unchanged:
            return current
        raise HTTPException(
            status_code=400,
            detail=f"{what} '{text}' is not in the racking at {branch}: {problem}",
        )
    aisle, bay, level, position = box
    return f"{aisle}.{bay}.{level}.{position}"

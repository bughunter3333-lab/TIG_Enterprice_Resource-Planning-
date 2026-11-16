"""How a bin code is read, defined once.

A box in the racking is labelled aisle.bay.level.box — ``B.3.H.1``. Put-away
slots stock into one and a rack section is the stretch between two of them, so
both have to agree on which box a piece of text means. They read it here.
"""

import re
from typing import Optional

# What JavaScript's String.trim() removes. The map and the forms tidy a code
# with it before reading it, so the server tidies with exactly the same set —
# Python's own strip() takes a few characters trim() leaves (and leaves a few
# it takes), and on those the two sides read one piece of text differently.
TRIMMED = (
    "\t\n\x0b\x0c\r \xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006"
    "\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)


def tidy(value: Optional[str]) -> str:
    """Text as the screen would hand it over: trimmed the way it trims."""
    return (value or "").strip(TRIMMED)


# aisle . bay . level . box, as the warehouse labels read: B.3.H.1
_BIN_CODE = re.compile(r"^([A-Za-z]+)\.([0-9]+)\.([A-Za-z]+)\.([0-9]+)$")


def parse_box_code(value: Optional[str]) -> Optional[tuple[str, int, str, int]]:
    """The parts of a box code as (aisle, bay, level, box), or None.

    ``b.03.h.01`` and ``B.3.H.1`` are the same box: letters come back upper
    case and numbers as numbers. None when the text is not a box code at all —
    bays and boxes are numbered from 1.

    Letters are matched as plain A-Z before any case change. Upper-casing first
    let other alphabets through and could lengthen the text (one "\ufb03"
    becomes "FFI"), past what the column holds.
    """
    match = _BIN_CODE.fullmatch(tidy(value))
    if not match:
        return None
    aisle, bay, level, box = match.groups()
    if int(bay) < 1 or int(box) < 1:
        return None
    return aisle.upper(), int(bay), level.upper(), int(box)


def same_bin(a: str, b: str) -> bool:
    """Two codes on file for one bin: the same box, or the same legacy text."""
    return (box_code(a) or tidy(a).upper()) == (box_code(b) or tidy(b).upper())


def box_code(value: Optional[str]) -> Optional[str]:
    """The one spelling of a box: ``b.03.h.01`` and ``B.3.H.1`` are the same box.

    None when the text is not a box code at all. The map reads codes the same
    way (frontend ``parseBin``), so the two agree on which box a stored code
    means — compared as typed, a zero-padded code looked like a different box
    and one box became both of a SKU's bins.
    """
    parts = parse_box_code(value)
    if parts is None:
        return None
    aisle, bay, level, box = parts
    return f"{aisle}.{bay}.{level}.{box}"

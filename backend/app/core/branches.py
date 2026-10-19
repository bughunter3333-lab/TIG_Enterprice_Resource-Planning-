"""The branches stock can sit at, named once.

Branch is the axis every stock position is keyed on — `stock_locations` is one
row per (sku, branch) — and it was an unconstrained string. The job form offered
one set of labels, the seed wrote another, and two screens sent none at all and
took the server's default. Any of those disagreeing does not raise; it silently
opens a second position under a name nobody else uses, and the stock at the
branch people mean is never touched.

So the vocabulary lives here, the frontend mirrors it in `src/branches.js`, and
a test asserts the two lists match. Adding a branch means editing both, which is
the point: a value that keys every position should not be typeable.
"""

from typing import Optional

# These are the real ten, read off the live system's stock Locations tab, and
# they are locations in the operational sense rather than cities: BULK is
# overflow storage, QUA is quarantine, RET is returns, SAMP is samples, 3PLP is
# the third-party logistics provider, QING is the Qingdao sourcing office. AF
# and GS are the live system's own abbreviations and have not been decoded here
# — they are carried verbatim rather than renamed to a guess.
#
# The six that were here before (Warehouse, Sydney, Brisbane, Perth and the long
# spellings of HQ and Melbourne) were invented. Only HQ and MELB were ever
# written to a row, and both survive the change unaltered, so nothing moved.
#
# Order is display order. The first entry is the default for anything that does
# not say otherwise, which is why HQ leads the alphabetical remainder.
BRANCHES = (
    "HQ",
    "3PLP",
    "AF",
    "BULK",
    "GS",
    "MELB",
    "QING",
    "QUA",
    "RET",
    "SAMP",
)

DEFAULT_BRANCH = BRANCHES[0]


def normalize_branch(value: Optional[str]) -> str:
    """Tidy a branch name without ever moving stock to a different one.

    Whitespace and casing are corrected against the known list, because "hq"
    and "HQ" are plainly the same shelf. Anything else passes through unchanged.

    It is tempting to go further and map a spelling nobody uses onto a current
    label — "Sydney" onto "HQ", say. Do not. Positions may already exist under
    the old spelling, so aliasing on read silently points every lookup at a
    different row and the stock at the real one becomes invisible. An
    unrecognised branch is a branch we have stock at and no label for; the fix
    for that is a rename someone decides on, applied as a migration, not a
    quiet redirect at read time.
    """
    if not value:
        return DEFAULT_BRANCH
    cleaned = value.strip()
    if cleaned in BRANCHES:
        return cleaned
    for branch in BRANCHES:
        if branch.upper() == cleaned.upper():
            return branch
    return cleaned

"""
Australian Business Number (ABN) validation.

The ATO weighted-checksum algorithm:
  1. Subtract 1 from the first digit
  2. Multiply each digit by its weighting factor
  3. Sum the products — must be divisible by 89
"""

_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]


def validate_abn(abn: str) -> bool:
    """Return True if abn passes the ATO checksum, False otherwise."""
    digits = abn.replace(" ", "").replace("-", "")
    if not digits.isdigit() or len(digits) != 11:
        return False
    d = [int(c) for c in digits]
    d[0] -= 1
    total = sum(w * v for w, v in zip(_WEIGHTS, d))
    return total % 89 == 0


def format_abn(abn: str) -> str:
    """Return ABN in standard display format: XX XXX XXX XXX."""
    digits = abn.replace(" ", "").replace("-", "")
    if len(digits) == 11:
        return f"{digits[:2]} {digits[2:5]} {digits[5:8]} {digits[8:]}"
    return abn


def clean_abn(abn: str | None) -> str | None:
    """Strip spaces/hyphens; return None if blank."""
    if not abn:
        return None
    cleaned = abn.replace(" ", "").replace("-", "")
    return cleaned if cleaned else None

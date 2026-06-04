import calendar
from datetime import date


def get_fiscal_year_bounds(d: date, start_month: int = 7) -> tuple[date, date]:
    """Return (start, end) dates for the fiscal year containing *d*.

    Australia default: July–June (start_month=7).
    """
    fy_start_year = d.year if d.month >= start_month else d.year - 1
    start = date(fy_start_year, start_month, 1)
    end_month = (start_month - 1) or 12
    end_year = fy_start_year + (1 if end_month < start_month else 0)
    _, last_day = calendar.monthrange(end_year, end_month)
    return start, date(end_year, end_month, last_day)


def fiscal_year_label(d: date, start_month: int = 7) -> str:
    """Return a label like 'FY2025-26' for the fiscal year containing *d*."""
    fy_start_year = d.year if d.month >= start_month else d.year - 1
    return f"FY{fy_start_year}-{str(fy_start_year + 1)[2:]}"


def current_fiscal_year(start_month: int = 7) -> tuple[date, date]:
    return get_fiscal_year_bounds(date.today(), start_month)

"""What a job's goods lines are, and when one is picked in full.

One rule, read by the pick endpoints (`app/routers/jobs.py`) and the
production board (`app/core/production_board.py`), so the board never shows a
garment as picked that the pick panel would call short.
"""

from app.models.job import Job, JobItem


def pick_target(item: JobItem) -> int:
    """What a line is picked to: what it supplies, else what it is for."""
    return item.supply_qty or item.qty or item.order_qty or 0


def fully_picked(item: JobItem) -> bool:
    """Picked to what it supplies, with nothing still to come on back-order."""
    t = pick_target(item)
    return t > 0 and (item.qty_pick or 0) >= t and not (item.b_ord or 0)


def goods_lines(job: Job) -> list[JobItem]:
    """The lines taken off a shelf: products that are not decoration,
    alteration or a charge (`JobItem.is_service`)."""
    return [
        i
        for i in job.items
        if (i.display_type or "product") == "product" and not i.is_service
    ]

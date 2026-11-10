"""Moving lines to another job of the same customer.

docs/superpowers/specs/2026-11-08-move-lines.md. The reservation, totals, lock
and trail rules are the jobs router's own, used as they are.
"""

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.branches import DEFAULT_BRANCH
from app.core.dependencies import require_staff
from app.core.reservations import COMMITTED_STATUSES, FINISHED_STATUSES
from app.database import get_db
from app.models.job import Job, JobItem
from app.models.user import User
from app.routers.jobs import (
    _cap_supply_at_free,
    _check_credit_limit,
    _is_stock_line,
    _post_reservation,
    _recalculate_weight,
    _require_mutable,
    _reserved_by_sku,
    _settle_money,
    _system_comment,
    _total_from_lines,
)

router = APIRouter(prefix="/jobs", tags=["jobs"])

# Open: a quote, a booked order, or one in work — not gone, invoiced or cancelled.
_NOT_OPEN = FINISHED_STATUSES | {"INVOICE", "PAID", "CANCEL"}


class MoveLines(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_ids: List[int] = Field(min_length=1, max_length=500)
    to_job_id: str = Field(min_length=1, max_length=20)


def _open_job(db: Session, job_id: str) -> Job:
    job = (
        db.query(Job)
        .filter(Job.id == job_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    if job.status in _NOT_OPEN:
        raise HTTPException(
            status_code=409,
            detail=f"Job {job.id} is {job.status} — lines move only between open jobs.",
        )
    _require_mutable(job)
    return job


def _numbers(job: Job) -> dict[int, int]:
    return {item.id: n for n, item in enumerate(job.items, 1)}


def _said(numbers: list[int]) -> str:
    return (
        f"Line {numbers[0]}"
        if len(numbers) == 1
        else "Lines " + ", ".join(map(str, numbers))
    )


def _lines_to_move(job: Job, asked: set[int]) -> list[JobItem]:
    """The asked lines and every line applying to one of them, in line order."""
    by_id = {item.id: item for item in job.items}
    strangers = sorted(asked - by_id.keys())
    if strangers:
        raise HTTPException(
            status_code=422,
            detail=f"Line(s) {', '.join(map(str, strangers))} are not on job {job.id}.",
        )
    moving = set(asked)
    for item in job.items:
        if item.applies_to_item_id in asked:
            moving.add(item.id)
    numbers = _numbers(job)
    for item_id in moving:
        item = by_id[item_id]
        target = item.applies_to_item_id
        if target is not None and target not in moving:
            # An older row may point at a line on another job (before F19).
            where = (
                f"line {numbers[target]}, which stays"
                if target in numbers
                else "a line that is not on this job"
            )
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Line {numbers[item_id]} applies to {where} — move the garment "
                    "and its decoration goes with it."
                ),
            )
        if item.po_no and (item.b_ord or 0) > 0:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Line {numbers[item_id]} is on order ({item.po_no}) for job "
                    f"{job.id} — receive it before moving it."
                ),
            )
        if (item.qty_delivered or 0) > 0:
            raise HTTPException(
                status_code=422,
                detail=f"Line {numbers[item_id]} has gone out on a despatch.",
            )
    return [item for item in job.items if item.id in moving]


def _reserved(lines: list[JobItem]) -> dict[str, int]:
    held: dict[str, int] = {}
    for item in lines:
        if _is_stock_line(item) and (item.supply_qty or 0) > 0:
            held[item.stock_code] = held.get(item.stock_code, 0) + int(item.supply_qty)
    return held


@router.post("/{job_id}/move-lines")
def move_lines(
    job_id: str,
    body: MoveLines,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Move lines to another open job of the same customer; the stock they
    reserve goes with them."""
    if body.to_job_id == job_id:
        raise HTTPException(
            status_code=422, detail="Choose another job to move the lines to."
        )
    # Locked in one order, whichever way lines move, so two moves between the
    # same jobs never wait on each other.
    first, second = sorted((job_id, body.to_job_id))
    locked = {first: _open_job(db, first), second: _open_job(db, second)}
    source, target = locked[job_id], locked[body.to_job_id]
    if source.customer_id != target.customer_id:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Job {target.id} is {target.customer_name or target.customer_id}'s — "
                "lines move only between one customer's jobs."
            ),
        )
    moving = _lines_to_move(source, set(body.item_ids))
    from_numbers = [_numbers(source)[i.id] for i in moving]
    held = _reserved(moving)

    # Released where it was held, reserved where it goes, each at its own
    # branch — posted only when the reservation actually changes hands. A
    # blank branch is HQ, as `post_movement` reads it.
    source_holds = source.status in COMMITTED_STATUSES
    target_holds = target.status in COMMITTED_STATUSES
    same_place = (source.branch or DEFAULT_BRANCH) == (target.branch or DEFAULT_BRANCH)
    handed_over = source_holds and target_holds and same_place
    if source_holds and not handed_over:
        _post_reservation(source, db, {sku: -qty for sku, qty in held.items()})
    target_before = _reserved_by_sku(target) if target_holds else None

    last = max((item.sort or 0 for item in target.items), default=-1)
    for n, item in enumerate(moving, 1):
        source.items.remove(item)
        item.sort = last + n
        target.items.append(item)
    db.flush()
    if target_holds and not handed_over:
        # Lines arriving with a quote's supply hold only what is free to the
        # order now — the rest back-ordered, as a save or a confirmation would
        # split them (S2-03); then reserved. Lines an order already held (from
        # another branch) keep what they hold: they were counted, and may be
        # picked already.
        allowed = dict(target_before)
        if source_holds:
            for sku, qty in held.items():
                allowed[sku] = allowed.get(sku, 0) + qty
        _cap_supply_at_free(target, db, allowed)
        now_held = _reserved_by_sku(target)
        _post_reservation(
            target,
            db,
            {
                sku: now_held.get(sku, 0) - target_before.get(sku, 0)
                for sku in {*target_before, *now_held}
            },
        )

    now = datetime.now(timezone.utc)
    for job in (source, target):
        _total_from_lines(job, emptied=not job.items)
        _settle_money(job)
        _recalculate_weight(job, db)
        job.updated_at = now
    if target_holds and not source_holds:
        # An open order made bigger by lines no order held asks for more
        # credit, as a save does (F27).
        _check_credit_limit(target, db)
    to_numbers = [_numbers(target)[i.id] for i in moving]
    db.add(
        _system_comment(
            source, f"{_said(from_numbers)} moved to job {target.id}", by=current_user
        )
    )
    db.add(
        _system_comment(
            target,
            f"{_said(to_numbers)} moved here from job {source.id}",
            by=current_user,
        )
    )
    db.commit()
    return {
        "from_job_id": source.id,
        "to_job_id": target.id,
        "moved": [item.id for item in moving],
    }

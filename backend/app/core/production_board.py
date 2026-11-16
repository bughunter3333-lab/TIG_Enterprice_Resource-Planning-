"""The production board: who has which work on the floor, by lane.

docs/superpowers/specs/2026-11-07-production-board.md. Lanes run Picking ·
Embroidery · Print · a lane per outside decorator · Packing. What moves is a
garment — a goods line (`picking.goods_lines`) — and a card is a job at a lane.

A garment handed off is where it was handed (`JobItem.station`). One not handed
off yet is placed where its work is: at Picking until picked in full, then at
its first decoration's lane, else at Packing — so the board is right from the
first order and moves on by itself as picking is recorded. Nothing here
changes a job's status, stock or money (owner decision 2026-11-07).
"""

from collections.abc import Iterable
from typing import Optional

from app.core import picking
from app.core.reservations import COMMITTED_STATUSES, FINISHED_STATUSES
from app.models.job import Job, JobItem
from app.models.logo import Logo

PICKING = "picking"
EMBROIDERY = "embroidery"
PRINT = "print"
PACKING = "packing"
DECORATOR = "decorator:"

FIXED_LANES = {
    PICKING: "Picking",
    EMBROIDERY: "Embroidery",
    PRINT: "Print",
    PACKING: "Packing",
}

# In work: reserved and not yet gone — Confirmed through Desp/Ready.
IN_WORK = COMMITTED_STATUSES - FINISHED_STATUSES


def decorator_lane(supplier_id: str) -> str:
    return f"{DECORATOR}{supplier_id}"


def supplier_of(lane: str) -> Optional[str]:
    """The decorator a lane is for; None for a fixed lane."""
    return lane[len(DECORATOR) :] if lane.startswith(DECORATOR) else None


def lane_label(lane: str, supplier_names: dict[str, str]) -> str:
    supplier_id = supplier_of(lane)
    if supplier_id is None:
        return FIXED_LANES.get(lane, lane)
    # A supplier with a blank name, or one since removed, still names its lane.
    return supplier_names.get(supplier_id) or supplier_id


def _in_house_lane(decoration_type: Optional[str]) -> str:
    return EMBROIDERY if decoration_type == "EMB" else PRINT


def _line_order(item: JobItem) -> tuple[int, int]:
    return (item.sort or 0, item.id or 0)


def decorations(
    job: Job, garment: JobItem, logos: dict[int, Logo]
) -> list[tuple[str, str]]:
    """What is done to a garment, in line order, as (label, lane).

    A logo line applies to the garment it names, or to every garment when it
    names none; a decoration line that is itself the unit (`units`) is its own
    decoration. A logo made by a decorator goes to that decorator's lane; any
    other is in-house. A garment's own decoration type, with no logo record,
    has no decorator, so it is in-house too.
    """
    found = []
    lines = (
        [garment] if garment.logo_id is not None else sorted(job.items, key=_line_order)
    )
    for line in lines:
        if line.logo_id is None:
            continue
        if line is not garment and line.applies_to_item_id not in (None, garment.id):
            continue
        logo = logos.get(line.logo_id)
        label = line.logo_code or line.stock_code or f"logo {line.logo_id}"
        if logo is not None and logo.made_by == "subcontract" and logo.supplier_id:
            found.append((label, decorator_lane(logo.supplier_id)))
        else:
            kind = logo.decoration_type if logo is not None else line.decoration_type
            found.append((label, _in_house_lane(kind)))
    own = garment.decoration_type
    if garment.logo_id is None and own and own != "None":
        found.append((own, _in_house_lane(own)))
    return found


def lane_of(garment: JobItem, done_to_it: list[tuple[str, str]]) -> str:
    """Where a unit of work is: where it was handed, else where its work is.

    A garment of ours waits at Picking until picked in full. A decoration line
    standing in for the customer's own garments (`units`) has nothing to pick:
    it is at its decoration's lane.
    """
    if garment.station:
        return garment.station
    if garment.logo_id is None and not picking.fully_picked(garment):
        return PICKING
    return done_to_it[0][1] if done_to_it else PACKING


def units(job: Job) -> list[JobItem]:
    """What moves on the floor for a job, in line order.

    Its garments — goods lines with something to supply; a line for nothing
    has nothing to move. A job with none decorates the customer's own
    garments: then its decoration lines are what moves.
    """
    goods = [g for g in picking.goods_lines(job) if picking.pick_target(g) > 0]
    if not goods:
        goods = [i for i in job.items if i.logo_id is not None]
    return sorted(goods, key=_line_order)


def line_numbers(job: Job) -> dict[int, int]:
    """Each line's number: its place among the job's lines, from 1, in the
    order the job record shows them (`Job.items`, by sort)."""
    return {item.id: n for n, item in enumerate(sorted(job.items, key=_line_order), 1)}


def cards(jobs: Iterable[Job], logos: dict[int, Logo]) -> list[dict]:
    """A card per job per lane, its garments in line order."""
    out: dict[tuple[str, str], dict] = {}
    for job in jobs:
        numbers = line_numbers(job)
        for garment in units(job):
            done_to_it = decorations(job, garment, logos)
            lane = lane_of(garment, done_to_it)
            card = out.setdefault(
                (job.id, lane),
                {
                    "job_id": job.id,
                    "lane": lane,
                    "customer_name": job.customer_name,
                    "cust_ref": job.cust_ref,
                    "due": job.due,
                    "priority": job.priority,
                    "order_category": job.order_category,
                    "status": job.status,
                    "lines": [],
                },
            )
            card["lines"].append(
                {
                    "item_id": garment.id,
                    "line": numbers[garment.id],
                    "stock_code": garment.stock_code,
                    "description": garment.description,
                    "sizes": garment.sizes,
                    "qty": picking.pick_target(garment),
                    "decoration": [label for label, _ in done_to_it],
                    "holder": garment.station_holder if garment.station else None,
                    "since": garment.station_at if garment.station else None,
                }
            )
    for card in out.values():
        holders = {line["holder"] for line in card["lines"]}
        card["holder"] = holders.pop() if len(holders) == 1 else None
        times = [line["since"] for line in card["lines"] if line["since"]]
        card["since"] = max(times) if times else None
    return list(out.values())


def lanes(decorator_ids: Iterable[str], supplier_names: dict[str, str]) -> list[dict]:
    """The lanes in floor order: the decorators, by name, between Print and
    Packing."""
    decorators = sorted(
        {decorator_lane(s) for s in decorator_ids if s},
        key=lambda lane: lane_label(lane, supplier_names).lower(),
    )
    order = [PICKING, EMBROIDERY, PRINT, *decorators, PACKING]
    return [{"key": lane, "label": lane_label(lane, supplier_names)} for lane in order]


def hand_off_text(
    numbers: list[int], lane_name: str, holder: Optional[str], *, decorator: bool
) -> str:
    """The printed trail, as Jim2 wrote it: "Line 1 given to Lina for EMB"."""
    what = (
        f"Line {numbers[0]}"
        if len(numbers) == 1
        else "Lines " + ", ".join(map(str, numbers))
    )
    if holder is None:
        return f"{what} given to {lane_name}"
    if decorator:
        return f"{what} given to {lane_name} ({holder})"
    return f"{what} given to {holder} for {lane_name}"

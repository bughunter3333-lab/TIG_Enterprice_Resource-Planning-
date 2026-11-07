"""Despatch paperwork, printed by the server (finding F21).

The delivery note, the satchel/carton label and the job label existed only as
templates in the browser, so a portal intake, a script or the freight
integration could not produce them, and nothing printed across a list — Jim2
prints 'Job List - TIG Delivery Note' for a whole filtered list (JIM15). Each
builder here returns the flowables for one job; `render` lays any number of
jobs out in one PDF, a page (or a label) each.

No prices on any of them: they travel with the goods.
"""

import io
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import func
from sqlalchemy.orm import object_session

from app.core.pdf_text import para
from app.models.dispatch_session import DispatchLineItem, DispatchSessionLine

DARK = colors.HexColor("#1e293b")
ACCENT = colors.HexColor("#2563eb")
LIGHT_BG = colors.HexColor("#f8fafc")
BORDER = colors.HexColor("#e2e8f0")
MUTED = colors.HexColor("#64748b")

# Page sizes: A4 for the note, 100 x 150 mm for a carton label (the usual
# thermal label), 100 x 50 mm for the job label stuck on a tote.
DELIVERY_NOTE = A4
SHIP_LABEL = (100 * mm, 150 * mm)
JOB_LABEL = (100 * mm, 50 * mm)

_text = ParagraphStyle("dd_text", fontSize=9, textColor=DARK, leading=12)
_small = ParagraphStyle("dd_small", fontSize=8, textColor=MUTED, leading=10)
_bold = ParagraphStyle("dd_bold", parent=_text, fontName="Helvetica-Bold")
_title = ParagraphStyle(
    "dd_title", fontSize=18, textColor=ACCENT, fontName="Helvetica-Bold", leading=22
)
_big = ParagraphStyle(
    "dd_big", fontSize=26, textColor=DARK, fontName="Helvetica-Bold", leading=30
)
_to = ParagraphStyle("dd_to", fontSize=13, textColor=DARK, leading=16)


def _p(text: Optional[str], style=_text) -> Paragraph:
    """Data as a Paragraph: read as text, never as markup."""
    return Paragraph(para(text), style)


def _rich(markup: str, style=_text) -> Paragraph:
    """The builder's own markup ("<b>…</b>"); any data in it went through para."""
    return Paragraph(markup, style)


def goods_lines(job) -> list:
    """What travels: goods lines a customer sees — no decoration or alteration
    work (it is on the garment), no hidden lines, no section or note markers."""
    return [
        it
        for it in (job.items or [])
        if it.display_type not in ("section", "note")
        and not it.hide
        and not it.is_service
    ]


def ready(item) -> int:
    """What a line has ready to go, all consignments together: picked, else
    supplied."""
    return int(item.qty_pick if (item.qty_pick or 0) > 0 else (item.supply_qty or 0))


def _sent(db, job_item_ids: list, up_to_line_id: Optional[int] = None) -> dict:
    """{job line id: quantity} the job's recorded despatches have sent of each,
    through despatch line `up_to_line_id` when given."""
    if not job_item_ids:
        return {}
    query = db.query(
        DispatchLineItem.job_item_id, func.sum(DispatchLineItem.qty)
    ).filter(DispatchLineItem.job_item_id.in_(job_item_ids))
    if up_to_line_id is not None:
        query = query.filter(DispatchLineItem.dispatch_session_line_id <= up_to_line_id)
    return {
        item_id: int(qty or 0)
        for item_id, qty in query.group_by(DispatchLineItem.job_item_id)
    }


def still_to_send(job, db) -> list:
    """[(line, qty)] for each goods line this despatch sends: what it has ready
    less what earlier consignments of it took. Lines with nothing new are left
    out (F21)."""
    lines = goods_lines(job)
    sent = _sent(db, [it.id for it in lines])
    out = []
    for it in lines:
        qty = ready(it) - sent.get(it.id, 0)
        if qty > 0:
            out.append((it, qty))
    return out


def _latest_consignment(job) -> Optional[DispatchSessionLine]:
    # The same despatch line the paperwork reads its connote and cartons from.
    db = object_session(job)
    if db is None:
        return None
    return (
        db.query(DispatchSessionLine)
        .filter(DispatchSessionLine.job_id == job.id)
        .order_by(DispatchSessionLine.id.desc())
        .first()
    )


def delivery_lines(job) -> list:
    """[(line, going, back-ordered)] for each goods line.

    Once a job has gone, going is what its latest consignment recorded for the
    line, and back-ordered is the order less everything sent up to and with it:
    the line's picked and supplied quantities run on across consignments, so a
    further consignment's note printed everything sent so far (F21). A job not
    yet despatched (or despatched before consignments were recorded) prints
    what would go: picked, else supplied. Never the order quantity, which
    printed a line with nothing supplied as sent in full.

    A line an earlier consignment finished — nothing in this carton, nothing
    still to come — is left off: the site read garments named on the note
    that were not in the satchel (S2-20).
    """
    lines = goods_lines(job)
    latest = _latest_consignment(job)
    if latest is None or not latest.items:
        out = []
        for it in lines:
            going = ready(it)
            out.append((it, going, max(0, int(it.order_qty or 0) - going)))
        return out
    going = {row.job_item_id: row.qty for row in latest.items}
    sent = _sent(object_session(job), [it.id for it in lines], latest.id)
    out = []
    for it in lines:
        back_ordered = max(0, int(it.order_qty or 0) - sent.get(it.id, 0))
        if going.get(it.id, 0) or back_ordered:
            out.append((it, going.get(it.id, 0), back_ordered))
    return out


def delivery_note(job, company, despatch: Optional[dict] = None) -> list:
    despatch = despatch or {}
    story = [
        Table(
            [
                [
                    _p(company.company_name or "Total Image", _bold),
                    _p("DELIVERY NOTE", _title),
                ]
            ],
            colWidths=["60%", "40%"],
        ),
        HRFlowable(width="100%", thickness=2, color=ACCENT, spaceAfter=6),
    ]
    # The day this consignment went; the job's own date is its first one's.
    # Its own despatch date when it has one: after the cut-off, tomorrow.
    latest = _latest_consignment(job)
    went = latest.session.created_at if latest is not None else None
    when = (latest.despatch_date if latest is not None else None) or (
        went.strftime("%Y-%m-%d") if went else job.dispatched_at
    )
    details = [
        f"Job: <b>{para(job.id)}</b>",
        f"Your ref: <b>{para(job.cust_ref or '—')}</b>",
        f"Despatched: <b>{para(when or '—')}</b>",
    ]
    if despatch.get("ship_via") or job.ship_via:
        details.append(f"Via: <b>{para(despatch.get('ship_via') or job.ship_via)}</b>")
    if despatch.get("ship_ref") or job.connote:
        details.append(
            f"Connote: <b>{para(despatch.get('ship_ref') or job.connote)}</b>"
        )
    deliver_to = [
        _p("DELIVER TO", ParagraphStyle("dd_dt", parent=_small, textColor=ACCENT)),
        _rich(f"<b>{para(job.customer_name)}</b>"),
        _p(despatch.get("address") or job.shipping_address or job.ship_to or ""),
    ]
    story.append(
        Table(
            [[deliver_to, [_rich(line) for line in details]]],
            colWidths=["55%", "45%"],
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]),
        )
    )
    story.append(Spacer(1, 5 * mm))

    rows = [
        [
            _rich("<b>Code</b>"),
            _rich("<b>Description</b>"),
            _rich("<b>Size</b>"),
            _rich("<b>Qty</b>"),
            _rich("<b>Back-ordered</b>"),
        ]
    ]
    for it, going, back_ordered in delivery_lines(job):
        # A line with nothing going is listed as back-ordered only.
        rows.append(
            [
                _p(it.stock_code),
                _p(it.description),
                _p(it.sizes),
                _p(str(going) if going else ""),
                _p(str(back_ordered) if back_ordered else ""),
            ]
        )
    table = Table(
        rows, colWidths=[35 * mm, 75 * mm, 25 * mm, 20 * mm, 25 * mm], repeatRows=1
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), LIGHT_BG),
                ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story += [table, Spacer(1, 12 * mm)]
    story.append(
        Table(
            [[_p("Received by"), _p("Signature"), _p("Date")], ["", "", ""]],
            colWidths=["40%", "40%", "20%"],
            rowHeights=[None, 14 * mm],
            style=TableStyle(
                [
                    ("BOX", (0, 1), (-1, 1), 0.5, BORDER),
                    ("INNERGRID", (0, 1), (-1, 1), 0.5, BORDER),
                ]
            ),
        )
    )
    return story


def ship_labels(job, company, despatch: Optional[dict] = None) -> list:
    """One label per carton, 'Carton n of N'."""
    despatch = despatch or {}
    cartons = max(1, int(despatch.get("cartons") or 1))
    # As Jim2's label reads (JIM28): which of the customer's sites, for whom,
    # and how it goes. The consignment being sent wins over the job's last.
    ship_via = despatch.get("ship_via") or job.ship_via
    story = []
    for n in range(1, cartons + 1):
        if n > 1:
            story.append(PageBreak())
        to = [_p("TO", _small)]
        if job.ship_to:
            to.append(_rich(f"Ship Code <b>{para(job.ship_to)}</b>", _bold))
        to.append(_rich(f"<b>{para(job.customer_name)}</b>", _to))
        if job.name_contact:
            to.append(_p(f"Attn {job.name_contact}"))
        to.append(
            _p(
                despatch.get("address") or job.shipping_address or job.ship_to or "",
                _to,
            )
        )
        going = [
            _rich(
                f"Job <b>{para(job.id)}</b>    "
                f"Sender Ref {para(job.cust_ref or '—')}"
            )
        ]
        if ship_via:
            going.append(_rich(f"Ship Via <b>{para(ship_via)}</b>"))
        story += [
            *to,
            Spacer(1, 6 * mm),
            HRFlowable(width="100%", thickness=1, color=DARK, spaceAfter=4),
            *going,
            _p(f"Connote {despatch.get('ship_ref') or job.connote or '—'}"),
            _rich(f"<b>Carton {n} of {cartons}</b>", _bold),
            Spacer(1, 6 * mm),
            _p("FROM", _small),
            _p(company.company_name or "Total Image"),
            _p(company.address or "", _small),
        ]
    return story


def job_label(job, company) -> list:
    return [
        _p(job.id, ParagraphStyle("dd_jl", parent=_big, alignment=TA_CENTER)),
        _p(
            job.customer_name or "",
            ParagraphStyle("dd_jc", parent=_bold, alignment=TA_CENTER),
        ),
        _p(
            f"Ref {job.cust_ref or '—'}  ·  Due {job.due or '—'}  ·  "
            f"{sum(int(i.order_qty or 0) for i in goods_lines(job))} items",
            ParagraphStyle("dd_jm", parent=_small, alignment=TA_CENTER),
        ),
    ]


def render(stories: list, pagesize, margin: float = 6 * mm) -> bytes:
    """Lay out one story per job in a single PDF, each starting a fresh page."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=pagesize,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
    )
    flowables = []
    for n, story in enumerate(stories):
        if n:
            flowables.append(PageBreak())
        flowables += story
    doc.build(flowables)
    return buf.getvalue()

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
    return Paragraph((text or "").replace("\n", "<br/>"), style)


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
    details = [
        f"Job: <b>{job.id}</b>",
        f"Your ref: <b>{job.cust_ref or '—'}</b>",
        f"Despatched: <b>{job.dispatched_at or '—'}</b>",
    ]
    if despatch.get("ship_via") or job.ship_via:
        details.append(f"Via: <b>{despatch.get('ship_via') or job.ship_via}</b>")
    if despatch.get("ship_ref") or job.connote:
        details.append(f"Connote: <b>{despatch.get('ship_ref') or job.connote}</b>")
    deliver_to = [
        _p("DELIVER TO", ParagraphStyle("dd_dt", parent=_small, textColor=ACCENT)),
        _p(f"<b>{job.customer_name or ''}</b>"),
        _p(despatch.get("address") or job.shipping_address or job.ship_to or ""),
    ]
    story.append(
        Table(
            [[deliver_to, [_p(line) for line in details]]],
            colWidths=["55%", "45%"],
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]),
        )
    )
    story.append(Spacer(1, 5 * mm))

    rows = [
        [
            _p("<b>Code</b>"),
            _p("<b>Description</b>"),
            _p("<b>Size</b>"),
            _p("<b>Qty</b>"),
        ]
    ]
    for it in goods_lines(job):
        sent = int(it.qty_pick or it.supply_qty or it.order_qty or 0)
        rows.append(
            [_p(it.stock_code), _p(it.description), _p(it.sizes), _p(str(sent))]
        )
    table = Table(rows, colWidths=[35 * mm, 95 * mm, 25 * mm, 20 * mm], repeatRows=1)
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
    story = []
    for n in range(1, cartons + 1):
        if n > 1:
            story.append(PageBreak())
        story += [
            _p("TO", _small),
            _p(f"<b>{job.customer_name or ''}</b>", _to),
            _p(
                despatch.get("address") or job.shipping_address or job.ship_to or "",
                _to,
            ),
            Spacer(1, 6 * mm),
            HRFlowable(width="100%", thickness=1, color=DARK, spaceAfter=4),
            _p(f"Job <b>{job.id}</b>    Ref {job.cust_ref or '—'}"),
            _p(f"Connote {despatch.get('ship_ref') or job.connote or '—'}"),
            _p(f"<b>Carton {n} of {cartons}</b>", _bold),
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

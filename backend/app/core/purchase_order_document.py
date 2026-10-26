"""The purchase order a supplier is sent (finding F17).

There was none: "Sent" was a status somebody set, and the order went to the
supplier, if it went, from outside the system. The document says what is
ordered and for which job — a PO consolidated across jobs still has to say
which units are whose — what it costs, where it is delivered, and the standing
instruction TIG gives every supplier.
"""

import io

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
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

# What every supplier is asked, on every order.
STANDING_INSTRUCTION = (
    "Please confirm this order. Supply it in full, or back-order the balance and "
    "tell us when it will follow. Quote our purchase order number on your "
    "invoice and delivery paperwork."
)

_text = ParagraphStyle("po_text", fontSize=9, textColor=DARK, leading=12)
_small = ParagraphStyle(
    "po_small", fontSize=8, textColor=colors.HexColor("#64748b"), leading=10
)
_right = ParagraphStyle("po_right", parent=_text, alignment=TA_RIGHT)
_title = ParagraphStyle(
    "po_title",
    fontSize=20,
    textColor=ACCENT,
    fontName="Helvetica-Bold",
    alignment=TA_RIGHT,
)
_name = ParagraphStyle(
    "po_name", fontSize=16, textColor=DARK, fontName="Helvetica-Bold"
)


def _p(text, style=_text) -> Paragraph:
    return Paragraph(str(text or "").replace("\n", "<br/>"), style)


def _money(value) -> str:
    return f"${float(value or 0):,.2f}"


def build(po, supplier, company) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
    )
    story = [
        Table(
            [
                [
                    _p(company.company_name or "Total Image", _name),
                    _p("PURCHASE ORDER", _title),
                ]
            ],
            colWidths=["60%", "40%"],
        ),
        HRFlowable(width="100%", thickness=2, color=ACCENT, spaceAfter=6),
    ]

    to_lines = [f"<b>{po.supplier_name or (supplier.name if supplier else '')}</b>"]
    if supplier is not None:
        to_lines += [
            s for s in (supplier.contact, supplier.address, supplier.email) if s
        ]
    ours = [
        f"PO No: <b>{po.id}</b>",
        f"Date: <b>{po.order_date or '—'}</b>",
        f"Wanted by: <b>{po.expected_date or '—'}</b>",
    ]
    deliver = [f"<b>Deliver to</b> {company.company_name or ''}"]
    if company.address:
        deliver.append(company.address)
    story.append(
        Table(
            [[[_p(line) for line in to_lines], [_p(line) for line in ours + deliver]]],
            colWidths=["55%", "45%"],
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]),
        )
    )
    story.append(Spacer(1, 5 * mm))

    rows = [
        [
            _p(f"<b>{h}</b>")
            for h in ("Code", "Description", "For job", "Qty", "Unit ex", "Total ex")
        ]
    ]
    for line in po.items:
        rows.append(
            [
                _p(line.sku),
                _p(line.description),
                _p(line.job_id or "Stock"),
                _p(line.qty_ordered, _right),
                _p(_money(line.unit_cost), _right),
                _p(_money(line.total), _right),
            ]
        )
    lines = Table(
        rows,
        colWidths=[30 * mm, 62 * mm, 22 * mm, 14 * mm, 25 * mm, 27 * mm],
        repeatRows=1,
    )
    lines.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), LIGHT_BG),
                ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story += [lines, Spacer(1, 3 * mm)]
    story.append(
        Table(
            [
                ["", _p("Subtotal (ex GST)", _right), _p(_money(po.total_ex), _right)],
                ["", _p("GST", _right), _p(_money(po.tax_total), _right)],
                [
                    "",
                    _p("<b>Total (inc GST)</b>", _right),
                    _p(f"<b>{_money(po.total_inc)}</b>", _right),
                ],
            ],
            colWidths=["55%", "30%", "15%"],
        )
    )
    story.append(Spacer(1, 6 * mm))
    story.append(_p(STANDING_INSTRUCTION))
    if po.notes:
        story += [Spacer(1, 3 * mm), _p(f"<b>Notes:</b> {po.notes}", _small)]
    doc.build(story)
    return buf.getvalue()

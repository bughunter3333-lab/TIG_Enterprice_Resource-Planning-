"""The adjustment note a customer is given for a credit note.

The ATO's name for a GST credit note. It says it is an adjustment note, who
issues it (name and ABN) and to whom, when, which invoice it adjusts and why,
what is credited and how much of it is GST
(docs/superpowers/specs/2026-11-09-returns-credit-notes.md). Laid out as the
purchase order is (`core/purchase_order_document.py`).
"""

import io

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.orm import Session

from app.core.pdf_text import para
from app.core.purchase_order_document import (
    ACCENT,
    BORDER,
    LIGHT_BG,
    _money,
    _name,
    _p,
    _rich,
    _right,
    _small,
    _title,
)
from app.models.customer import Customer
from app.models.settings import CompanySettings


def adjustment_note_pdf(db: Session, note, job) -> bytes:
    company = db.query(CompanySettings).first() or CompanySettings()
    customer = db.query(Customer).filter(Customer.id == note.customer_id).first()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
    )
    ours = [f"<b>{para(company.company_name or 'Total Image')}</b>"]
    if company.abn:
        ours.append(f"ABN {para(company.abn)}")
    ours += [para(s) for s in (company.address, company.phone, company.email) if s]

    theirs = [f"<b>{para(customer.name if customer else note.customer_id)}</b>"]
    if customer is not None:
        if customer.abn:
            theirs.append(f"ABN {para(customer.abn)}")
        if customer.address:
            theirs.append(para(customer.address))
    invoice = (job.invoice if job else None) or note.job_id
    refs = [
        f"Number: <b>{para(note.id)}</b>",
        f"Date: <b>{para(note.credit_date)}</b>",
        f"Adjusts invoice: <b>{para(invoice)}</b>",
        f"Invoice date: <b>{para((job.invoice_date if job else None) or '—')}</b>",
        f"Job: <b>{para(note.job_id)}</b>",
    ]

    story = [
        Table(
            [
                [
                    _p(company.company_name or "Total Image", _name),
                    _p("ADJUSTMENT NOTE", _title),
                ]
            ],
            colWidths=["60%", "40%"],
        ),
        HRFlowable(width="100%", thickness=2, color=ACCENT, spaceAfter=6),
        Table(
            [
                [
                    [_rich(line) for line in ours],
                    [_rich(line) for line in refs],
                ]
            ],
            colWidths=["55%", "45%"],
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]),
        ),
        Spacer(1, 4 * mm),
        _rich("<b>To</b>"),
        *[_rich(line) for line in theirs],
        Spacer(1, 4 * mm),
        _rich(f"<b>Reason:</b> {para(note.reason or '—')}"),
        Spacer(1, 4 * mm),
    ]

    rows = [
        [
            _rich(f"<b>{h}</b>")
            for h in ("Code", "Description", "Qty", "GST", "Credit ex")
        ]
    ]
    for line in note.lines:
        rows.append(
            [
                _p(line.stock_code),
                _p(line.description),
                _p(line.qty, _right),
                _p(_money(line.tax), _right),
                _p(_money(line.total_ex), _right),
            ]
        )
    if not note.lines:
        # An amount credited, not lines: one row says what it is for.
        rows.append(
            [
                _p("—"),
                _p(f"Adjustment — {note.reason or ''}"),
                _p("", _right),
                _p(_money(note.tax), _right),
                _p(_money(note.total_ex), _right),
            ]
        )
    lines = Table(
        rows, colWidths=[32 * mm, 80 * mm, 16 * mm, 24 * mm, 28 * mm], repeatRows=1
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
    # The note's own totals, not the lines re-added: the note that credits what
    # is left of an invoice takes the invoice's remainder to the cent.
    story.append(
        Table(
            [
                ["", _p("Credit (ex GST)", _right), _p(_money(note.total_ex), _right)],
                ["", _p("GST adjusted", _right), _p(_money(note.tax), _right)],
                [
                    "",
                    _rich("<b>Total credit (inc GST)</b>", _right),
                    _rich(f"<b>{_money(note.total_inc)}</b>", _right),
                ],
            ],
            colWidths=["50%", "35%", "15%"],
        )
    )
    applied = [a for a in note.applications]
    if applied:
        story.append(Spacer(1, 5 * mm))
        for a in applied:
            story.append(
                _p(
                    f"{_money(a.amount)} applied to job {a.job_id} on {a.applied_on}",
                    _small,
                )
            )
    left = float(note.total_inc or 0) - sum(float(a.amount or 0) for a in applied)
    if left > 0.004:
        story.append(_p(f"{_money(left)} is credit on your account.", _small))
    doc.build(story)
    return buf.getvalue()

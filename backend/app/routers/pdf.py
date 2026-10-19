"""
PDF generation for jobs — tax invoices and quote documents.

GET /jobs/{job_id}/pdf?type=invoice   →  ATO-compliant tax invoice
GET /jobs/{job_id}/pdf?type=quote     →  Quote document
"""

import io
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    HRFlowable,
)
from reportlab.lib.enums import TA_RIGHT, TA_CENTER

from app.database import get_db
from app.core.dependencies import require_any
from app.models.job import Job
from app.models.customer import Customer
from app.models.settings import CompanySettings
from app.models.user import User

router = APIRouter(tags=["pdf"])

# Brand colours
DARK = colors.HexColor("#1e293b")
ACCENT = colors.HexColor("#2563eb")
LIGHT_BG = colors.HexColor("#f8fafc")
BORDER = colors.HexColor("#e2e8f0")
WHITE = colors.white


def _build_pdf(job: Job, company: CompanySettings, doc_type: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=20 * mm,
    )
    styles = getSampleStyleSheet()

    def S(name, **kw):
        base = styles["Normal"] if name not in styles else styles[name]
        return ParagraphStyle(name + "_c", parent=base, **kw)

    h1 = S("h1", fontSize=22, textColor=DARK, leading=26, fontName="Helvetica-Bold")
    normal = S("n", fontSize=9, textColor=DARK, leading=13)
    small = S("s", fontSize=8, textColor=colors.HexColor("#64748b"), leading=11)
    right = S("r", fontSize=9, textColor=DARK, alignment=TA_RIGHT)
    right_bold = S(
        "rb", fontSize=9, textColor=DARK, alignment=TA_RIGHT, fontName="Helvetica-Bold"
    )

    is_invoice = doc_type == "invoice"
    title = "TAX INVOICE" if is_invoice else "QUOTE"
    doc_no = job.invoice if is_invoice else job.quote
    doc_date = job.invoice_date or job.date_in or date.today().isoformat()

    story = []

    # ── Header ────────────────────────────────────────────────────────────────
    header_data = [
        [
            Paragraph(company.company_name or "Total Image", h1),
            Paragraph(
                title,
                ParagraphStyle(
                    "title",
                    fontSize=20,
                    textColor=ACCENT,
                    fontName="Helvetica-Bold",
                    alignment=TA_RIGHT,
                ),
            ),
        ]
    ]
    header_table = Table(header_data, colWidths=["60%", "40%"])
    header_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=2, color=ACCENT, spaceAfter=6))

    # ── Company info + doc details ────────────────────────────────────────────
    co_lines = []
    if company.address:
        co_lines.append(company.address)
    if company.phone:
        co_lines.append(f"Ph: {company.phone}")
    if company.email:
        co_lines.append(company.email)
    if company.abn:
        co_lines.append(f"ABN: {company.abn}")

    doc_lines = [
        f"{'Invoice' if is_invoice else 'Quote'} No: <b>{doc_no or 'N/A'}</b>",
        f"Date: <b>{doc_date}</b>",
        f"Job No: <b>{job.id}</b>",
    ]
    if not is_invoice and job.validity_date:
        doc_lines.append(f"Valid Until: <b>{job.validity_date}</b>")
    if is_invoice and job.due:
        doc_lines.append(f"Due Date: <b>{job.due}</b>")

    # Render as paragraphs
    co_cell = [Paragraph(l, small) for l in co_lines]
    doc_cell = [Paragraph(l, normal) for l in doc_lines]

    info_table = Table([[co_cell, doc_cell]], colWidths=["55%", "45%"])
    info_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("RIGHTPADDING", (0, 0), (0, -1), 10),
            ]
        )
    )
    story.append(Spacer(1, 4 * mm))
    story.append(info_table)
    story.append(Spacer(1, 4 * mm))

    # ── Bill To ───────────────────────────────────────────────────────────────
    bill_to_data = [
        [
            Paragraph(
                "BILL TO",
                S("bt", fontSize=8, textColor=ACCENT, fontName="Helvetica-Bold"),
            )
        ],
        [Paragraph(f"<b>{job.customer_name or ''}</b>", normal)],
    ]
    if job.cust_ref:
        bill_to_data.append([Paragraph(f"Ref: {job.cust_ref}", small)])
    if job.shipping_address:
        bill_to_data.append(
            [Paragraph(job.shipping_address.replace("\n", "<br/>"), small)]
        )
    bill_table = Table(bill_to_data, colWidths=["100%"])
    bill_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (0, 0), 2),
            ]
        )
    )
    story.append(bill_table)
    story.append(Spacer(1, 5 * mm))

    # ── Line items ────────────────────────────────────────────────────────────
    col_widths = [60 * mm, 20 * mm, 18 * mm, 25 * mm, 27 * mm, 27 * mm]
    item_header = [
        "Description",
        "Qty",
        "Unit Price",
        "Discount",
        "Total Ex",
        "Total Inc",
    ]

    th = ParagraphStyle("th", fontSize=8, textColor=WHITE, fontName="Helvetica-Bold")
    td = ParagraphStyle("td", fontSize=8, textColor=DARK, leading=11)
    td_r = ParagraphStyle("tdr", fontSize=8, textColor=DARK, alignment=TA_RIGHT)

    rows = [[Paragraph(h, th) for h in item_header]]
    product_items = [
        it for it in (job.items or []) if it.display_type not in ("section", "note")
    ]

    for it in product_items:
        qty = int(it.order_qty or 0)
        price_ex = float(it.price_ex or 0)
        discount = float(it.discount or 0)
        total = float(it.total or 0)
        total_inc = round(total * 1.1, 2)
        desc = it.description or it.stock_code or ""
        if it.stock_code and it.description:
            desc = f"{it.stock_code} — {it.description}"
        rows.append(
            [
                Paragraph(desc, td),
                Paragraph(str(qty), td_r),
                Paragraph(f"${price_ex:.2f}", td_r),
                Paragraph(f"{discount:.1f}%" if discount else "—", td_r),
                Paragraph(f"${total:.2f}", td_r),
                Paragraph(f"${total_inc:.2f}", td_r),
            ]
        )

    items_table = Table(rows, colWidths=col_widths, repeatRows=1)
    items_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), DARK),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
                ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(items_table)
    story.append(Spacer(1, 4 * mm))

    # ── Totals ────────────────────────────────────────────────────────────────
    total_ex = float(job.total_ex or 0)
    gst = float(job.tax or 0)
    total_inc = float(job.total_inc or 0)
    deposit = float(job.deposit or 0)
    balance = float(job.balance_due or 0)

    gst_rate = 10
    totals_rows = [
        ["", "Subtotal (ex GST)", f"${total_ex:.2f}"],
        ["", f"GST ({gst_rate}%)", f"${gst:.2f}"],
        ["", "Total (inc GST)", f"${total_inc:.2f}"],
    ]
    if is_invoice and deposit > 0:
        totals_rows.append(["", "Less Deposit Paid", f"(${deposit:.2f})"])
        totals_rows.append(["", "BALANCE DUE", f"${balance:.2f}"])

    ts_rows = []
    for i, (_, label, amount) in enumerate(totals_rows):
        is_grand = label in ("Total (inc GST)", "BALANCE DUE")
        label_style = right_bold if is_grand else right
        amount_style = right_bold if is_grand else right
        ts_rows.append(
            ["", Paragraph(label, label_style), Paragraph(amount, amount_style)]
        )

    totals_table = Table(ts_rows, colWidths=["55%", "30%", "15%"])
    totals_style = [
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEABOVE", (1, 0), (-1, 0), 0.5, BORDER),
    ]
    grand_idx = next(
        (
            i
            for i, r in enumerate(ts_rows)
            if "BALANCE DUE" in str(r[1]) or "Total (inc GST)" in str(r[1])
        ),
        None,
    )
    if grand_idx is not None:
        totals_style += [
            ("LINEABOVE", (1, grand_idx), (-1, grand_idx), 1, ACCENT),
            ("BACKGROUND", (1, grand_idx), (-1, grand_idx), LIGHT_BG),
        ]
    totals_table.setStyle(TableStyle(totals_style))
    story.append(totals_table)
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=4))

    # ── Bank details (invoice only) ───────────────────────────────────────────
    if is_invoice and company.bank_account:
        bank_lines = ["<b>Payment Details</b>"]
        if company.bank_name:
            bank_lines.append(f"Bank: {company.bank_name}")
        if company.bank_bsb:
            bank_lines.append(f"BSB: {company.bank_bsb}")
        if company.bank_account:
            bank_lines.append(f"Account: {company.bank_account}")
        if company.bank_account_name:
            bank_lines.append(f"Account Name: {company.bank_account_name}")
        if company.payment_terms_default:
            bank_lines.append(f"Terms: {company.payment_terms_default}")
        for line in bank_lines:
            story.append(Paragraph(line, small))
        story.append(Spacer(1, 3 * mm))

    # ── Notes ─────────────────────────────────────────────────────────────────
    if job.notes:
        story.append(Paragraph("<b>Notes:</b>", small))
        story.append(Paragraph(job.notes.replace("\n", "<br/>"), small))
        story.append(Spacer(1, 3 * mm))

    # ── Footer ────────────────────────────────────────────────────────────────
    footer_text = f"{company.company_name or 'Total Image'}"
    if company.abn:
        footer_text += f"  |  ABN {company.abn}"
    if company.website:
        footer_text += f"  |  {company.website}"
    story.append(
        Paragraph(
            footer_text,
            S(
                "ft",
                fontSize=7,
                textColor=colors.HexColor("#94a3b8"),
                alignment=TA_CENTER,
            ),
        )
    )

    doc.build(story)
    return buf.getvalue()


def _build_picking_slip(job: Job, company: CompanySettings) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=20 * mm,
    )
    styles = getSampleStyleSheet()

    def S(name, **kw):
        return ParagraphStyle(name + "_ps", parent=styles["Normal"], **kw)

    h1 = S("h1", fontSize=20, textColor=DARK, fontName="Helvetica-Bold")
    label = S("lbl", fontSize=8, textColor=colors.HexColor("#64748b"))
    normal = S("n", fontSize=9, textColor=DARK, leading=13)
    bold = S("b", fontSize=9, textColor=DARK, fontName="Helvetica-Bold", leading=13)
    th = ParagraphStyle("th_ps", fontSize=8, textColor=WHITE, fontName="Helvetica-Bold")
    td = ParagraphStyle("td_ps", fontSize=9, textColor=DARK, leading=12)
    td_r = ParagraphStyle("tdr_ps", fontSize=9, textColor=DARK, alignment=TA_RIGHT)

    story = []

    # Header
    hdr = Table(
        [
            [
                Paragraph(company.company_name or "Total Image", h1),
                Paragraph(
                    "PICKING SLIP",
                    ParagraphStyle(
                        "ps_title",
                        fontSize=20,
                        textColor=ACCENT,
                        fontName="Helvetica-Bold",
                        alignment=TA_RIGHT,
                    ),
                ),
            ]
        ],
        colWidths=["60%", "40%"],
    )
    hdr.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story.append(hdr)
    story.append(HRFlowable(width="100%", thickness=2, color=ACCENT, spaceAfter=4))

    # Job meta grid
    meta = Table(
        [
            [
                Paragraph("JOB #", label),
                Paragraph(job.id, bold),
                Paragraph("CUSTOMER", label),
                Paragraph(job.customer_name or "", bold),
            ],
            [
                Paragraph("DUE", label),
                Paragraph(job.due or "—", normal),
                Paragraph("CUST REF", label),
                Paragraph(job.cust_ref or "—", normal),
            ],
            [
                Paragraph("BRANCH", label),
                Paragraph(getattr(job, "branch", "") or "HQ", normal),
                Paragraph("ASSIGNED", label),
                Paragraph(job.assigned_to or "—", normal),
            ],
        ],
        colWidths=["12%", "28%", "12%", "48%"],
    )
    meta.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
                ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(meta)
    story.append(
        HRFlowable(
            width="100%", thickness=0.5, color=BORDER, spaceBefore=4, spaceAfter=4
        )
    )

    # Ship-to address block
    if job.shipping_address or job.ship_to:
        ship_label = job.ship_to or ""
        ship_addr = (job.shipping_address or "").replace("\n", "<br/>")
        story.append(
            Paragraph(
                "<b>SHIP TO:</b>",
                S("stl", fontSize=8, textColor=ACCENT, fontName="Helvetica-Bold"),
            )
        )
        if ship_label:
            story.append(Paragraph(ship_label, bold))
        if ship_addr:
            story.append(
                Paragraph(ship_addr, S("sa", fontSize=8, textColor=DARK, leading=11))
            )
        story.append(
            HRFlowable(
                width="100%", thickness=0.5, color=BORDER, spaceBefore=3, spaceAfter=4
            )
        )

    # Items table
    product_items = [
        it for it in (job.items or []) if it.display_type not in ("section", "note")
    ]
    col_widths = [22 * mm, 65 * mm, 22 * mm, 22 * mm, 22 * mm, 22 * mm]
    rows = [
        [
            Paragraph(h, th)
            for h in ["SKU", "Description", "Location", "Ordered", "Picked", "Status"]
        ]
    ]
    for it in product_items:
        rows.append(
            [
                Paragraph(it.stock_code or "—", td),
                Paragraph(it.description or "", td),
                Paragraph("", td),  # location — filled in at warehouse
                Paragraph(str(it.qty or it.order_qty or 0), td_r),
                Paragraph("", td),  # blank for warehouse to fill
                Paragraph(it.item_status or "", td),
            ]
        )
    # Empty pick rows to give warehouse room to write
    if len(rows) < 5:
        for _ in range(5 - len(rows)):
            rows.append([""] * 6)

    tbl = Table(rows, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), DARK),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
                ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(tbl)
    story.append(
        HRFlowable(
            width="100%", thickness=0.5, color=BORDER, spaceBefore=4, spaceAfter=4
        )
    )

    # Weight and notes footer
    weight = float(getattr(job, "weight_total", 0) or 0)
    zero_weight = sum(
        1
        for it in product_items
        if it.stock_code and not float(getattr(it, "weight_kg", 0) or 0)
    )
    footer_rows = []
    if weight > 0 or zero_weight:
        weight_text = f"Order Weight: {weight:.2f} kg"
        if zero_weight:
            weight_text += f"  ({zero_weight} item(s) have 0 weight)"
        footer_rows.append([Paragraph(weight_text, bold), ""])
    if job.notes:
        footer_rows.append(
            [
                Paragraph("<b>Notes:</b>", normal),
                Paragraph(
                    job.notes.replace("\n", "<br/>"),
                    S("fnotes", fontSize=8, textColor=DARK),
                ),
            ]
        )
    if footer_rows:
        ft = Table(footer_rows, colWidths=["40%", "60%"])
        ft.setStyle(
            TableStyle(
                [
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story.append(ft)

    # Sign-off row
    signoff = Table(
        [
            [
                Paragraph("Picked by: ____________________", normal),
                Paragraph("Date: ____________________", normal),
                Paragraph("Checked by: ____________________", normal),
            ]
        ],
        colWidths=["33%", "33%", "34%"],
    )
    signoff.setStyle(
        TableStyle(
            [
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(signoff)

    doc.build(story)
    return buf.getvalue()


def _build_job_sheet(job: Job, company: CompanySettings) -> bytes:
    """Production job sheet — shows decoration details for the print/emb team."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=20 * mm,
    )
    styles = getSampleStyleSheet()

    def S(name, **kw):
        return ParagraphStyle(name + "_js", parent=styles["Normal"], **kw)

    h1 = S("h1", fontSize=20, textColor=DARK, fontName="Helvetica-Bold")
    label = S("lbl", fontSize=8, textColor=colors.HexColor("#64748b"))
    normal = S("n", fontSize=9, textColor=DARK, leading=13)
    bold = S("b", fontSize=9, textColor=DARK, fontName="Helvetica-Bold", leading=13)
    th = ParagraphStyle("th_js", fontSize=8, textColor=WHITE, fontName="Helvetica-Bold")
    td = ParagraphStyle("td_js", fontSize=9, textColor=DARK, leading=12)
    td_r = ParagraphStyle("tdr_js", fontSize=9, textColor=DARK, alignment=TA_RIGHT)
    small = S("sm", fontSize=8, textColor=DARK, leading=11)

    story = []

    hdr = Table(
        [
            [
                Paragraph(company.company_name or "Total Image", h1),
                Paragraph(
                    "JOB SHEET",
                    ParagraphStyle(
                        "js_title",
                        fontSize=20,
                        textColor=colors.HexColor("#dc2626"),
                        fontName="Helvetica-Bold",
                        alignment=TA_RIGHT,
                    ),
                ),
            ]
        ],
        colWidths=["60%", "40%"],
    )
    hdr.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story.append(hdr)
    story.append(
        HRFlowable(
            width="100%", thickness=2, color=colors.HexColor("#dc2626"), spaceAfter=4
        )
    )

    meta = Table(
        [
            [
                Paragraph("JOB #", label),
                Paragraph(job.id, bold),
                Paragraph("CUSTOMER", label),
                Paragraph(job.customer_name or "", bold),
            ],
            [
                Paragraph("DUE", label),
                Paragraph(job.due or "—", normal),
                Paragraph("TYPE", label),
                Paragraph(job.type or "Normal", normal),
            ],
            [
                Paragraph("BRANCH", label),
                Paragraph(getattr(job, "branch", "") or "HQ", normal),
                Paragraph("ASSIGNED TO", label),
                Paragraph(job.assigned_to or "—", normal),
            ],
            [
                Paragraph("DESCRIPTION", label),
                Paragraph(job.description or "—", normal),
                Paragraph("CUST REF", label),
                Paragraph(job.cust_ref or "—", normal),
            ],
        ],
        colWidths=["12%", "28%", "15%", "45%"],
    )
    meta.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
                ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(meta)
    story.append(
        HRFlowable(
            width="100%", thickness=0.5, color=BORDER, spaceBefore=4, spaceAfter=4
        )
    )

    # Items with decoration
    col_widths = [50 * mm, 18 * mm, 25 * mm, 30 * mm, 54 * mm]
    rows = [
        [
            Paragraph(h, th)
            for h in [
                "Description / SKU",
                "Qty",
                "Decoration",
                "Code",
                "Notes / Placement",
            ]
        ]
    ]
    for it in job.items or []:
        if it.display_type == "section":
            # Section header spanning all columns
            rows.append(
                [
                    Paragraph(
                        f"<b>{it.description or ''}</b>",
                        ParagraphStyle(
                            "sec_js",
                            fontSize=9,
                            textColor=ACCENT,
                            fontName="Helvetica-Bold",
                        ),
                    ),
                    "",
                    "",
                    "",
                    "",
                ]
            )
        elif it.display_type == "note":
            rows.append([Paragraph(it.description or "", small), "", "", "", ""])
        else:
            dec = it.decoration_type or "None"
            dec_code = (it.emb_code if dec == "EMB" else it.trs_code) or "—"
            desc = it.description or it.stock_code or "—"
            if it.stock_code and it.description:
                desc = f"<b>{it.stock_code}</b><br/>{it.description}"
            rows.append(
                [
                    Paragraph(desc, td),
                    Paragraph(str(it.qty or it.order_qty or 0), td_r),
                    Paragraph(dec, td),
                    Paragraph(dec_code, td),
                    Paragraph("", td),  # placement notes — filled by production
                ]
            )

    tbl = Table(rows, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dc2626")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
                ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                (
                    ("SPAN", (0, 1), (-1, 1))
                    if any(it.display_type == "section" for it in (job.items or []))
                    else ("", (0, 0), (0, 0))
                ),
            ]
        )
    )
    story.append(tbl)
    story.append(
        HRFlowable(
            width="100%", thickness=0.5, color=BORDER, spaceBefore=4, spaceAfter=4
        )
    )

    # Proof / artwork notes
    if job.proof_notes:
        story.append(Paragraph("<b>Proof / Artwork Notes:</b>", bold))
        story.append(
            Paragraph(
                job.proof_notes.replace("\n", "<br/>"),
                S("pn", fontSize=8, textColor=DARK, leading=11),
            )
        )
        story.append(
            HRFlowable(
                width="100%", thickness=0.5, color=BORDER, spaceBefore=4, spaceAfter=4
            )
        )

    if job.notes:
        story.append(Paragraph("<b>General Notes:</b>", bold))
        story.append(Paragraph(job.notes.replace("\n", "<br/>"), small))
        story.append(
            HRFlowable(
                width="100%", thickness=0.5, color=BORDER, spaceBefore=4, spaceAfter=4
            )
        )

    # Sign-off
    signoff = Table(
        [
            [
                Paragraph("Completed by: ____________________", normal),
                Paragraph("Date: ____________________", normal),
                Paragraph("QC by: ____________________", normal),
            ]
        ],
        colWidths=["33%", "33%", "34%"],
    )
    signoff.setStyle(
        TableStyle(
            [
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(signoff)

    doc.build(story)
    return buf.getvalue()


def _build_statement(
    customer: Customer,
    lines: list,
    totals: dict,
    company: CompanySettings,
    date_from: str | None,
    date_to: str | None,
) -> bytes:
    """Statement of Account PDF — standard Australian accounting document."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=20 * mm,
    )
    styles = getSampleStyleSheet()

    def S(name, **kw):
        return ParagraphStyle(name + "_st", parent=styles["Normal"], **kw)

    h1 = S("h1", fontSize=20, textColor=DARK, fontName="Helvetica-Bold")
    normal = S("n", fontSize=9, textColor=DARK, leading=13)
    small = S("sm", fontSize=8, textColor=colors.HexColor("#64748b"), leading=11)
    bold = S("b", fontSize=9, textColor=DARK, fontName="Helvetica-Bold", leading=13)
    right = S("r", fontSize=9, textColor=DARK, alignment=TA_RIGHT)
    right_bold = S(
        "rb", fontSize=9, textColor=DARK, fontName="Helvetica-Bold", alignment=TA_RIGHT
    )
    th = ParagraphStyle(
        "th_st", fontSize=8, textColor=colors.white, fontName="Helvetica-Bold"
    )

    story = []

    hdr = Table(
        [
            [
                Paragraph(company.company_name or "Total Image", h1),
                Paragraph(
                    "STATEMENT OF ACCOUNT",
                    ParagraphStyle(
                        "soa_title",
                        fontSize=16,
                        textColor=ACCENT,
                        fontName="Helvetica-Bold",
                        alignment=TA_RIGHT,
                    ),
                ),
            ]
        ],
        colWidths=["55%", "45%"],
    )
    hdr.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story.append(hdr)
    story.append(HRFlowable(width="100%", thickness=2, color=ACCENT, spaceAfter=6))

    # Two-column: bill-to + statement meta
    bill_lines = [Paragraph(f"<b>{customer.name}</b>", bold)]
    if customer.address:
        bill_lines.append(Paragraph(customer.address.replace("\n", "<br/>"), small))
    if customer.email:
        bill_lines.append(Paragraph(customer.email, small))
    if customer.abn:
        bill_lines.append(Paragraph(f"ABN: {customer.abn}", small))

    meta_lines = [
        Paragraph(
            f"Statement Date: <b>{date.today().strftime('%d/%m/%Y')}</b>", normal
        ),
    ]
    if date_from or date_to:
        period = f"{date_from or ''} – {date_to or 'present'}"
        meta_lines.append(Paragraph(f"Period: <b>{period}</b>", normal))
    if customer.payment_terms:
        meta_lines.append(
            Paragraph(f"Payment Terms: <b>{customer.payment_terms}</b>", normal)
        )
    if company.abn:
        meta_lines.append(Paragraph(f"ABN: {company.abn}", small))

    info_tbl = Table([[bill_lines, meta_lines]], colWidths=["55%", "45%"])
    info_tbl.setStyle(
        TableStyle(
            [("VALIGN", (0, 0), (-1, -1), "TOP"), ("RIGHTPADDING", (0, 0), (0, -1), 10)]
        )
    )
    story.append(info_tbl)
    story.append(
        HRFlowable(
            width="100%", thickness=0.5, color=BORDER, spaceBefore=6, spaceAfter=5
        )
    )

    # Transactions table
    col_widths = [22 * mm, 22 * mm, 22 * mm, 65 * mm, 22 * mm, 22 * mm, 22 * mm]
    rows = [
        [
            Paragraph(h, th)
            for h in [
                "Date",
                "Due Date",
                "Invoice #",
                "Description",
                "Amount",
                "Paid",
                "Balance",
            ]
        ]
    ]
    running = 0.0
    for line in lines:
        amount = float(line.get("total_inc", 0))
        paid = float(line.get("paid", 0))
        balance = float(line.get("balance", 0))
        running += balance
        bal_style = right_bold if balance > 0 else right
        rows.append(
            [
                Paragraph(line.get("date") or "—", S("td", fontSize=8, textColor=DARK)),
                Paragraph(line.get("due") or "—", S("td2", fontSize=8, textColor=DARK)),
                Paragraph(
                    line.get("invoice_no") or line.get("job_id") or "—",
                    S("td3", fontSize=8, textColor=DARK, fontName="Helvetica-Bold"),
                ),
                Paragraph(
                    line.get("description") or "", S("td4", fontSize=8, textColor=DARK)
                ),
                Paragraph(f"${amount:,.2f}", right),
                Paragraph(f"${paid:,.2f}", right),
                Paragraph(f"${balance:,.2f}", bal_style),
            ]
        )

    if not lines:
        rows.append(
            [Paragraph("No transactions in this period", small), "", "", "", "", "", ""]
        )

    tbl = Table(rows, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), DARK),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
                ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(tbl)
    story.append(
        HRFlowable(
            width="100%", thickness=0.5, color=BORDER, spaceBefore=4, spaceAfter=4
        )
    )

    # Summary box
    outstanding = float(totals.get("outstanding", 0))
    summary_rows = [
        [
            "",
            Paragraph("Total Invoiced:", right),
            Paragraph(f"${float(totals.get('invoiced', 0)):,.2f}", right),
        ],
        [
            "",
            Paragraph("Total Paid:", right),
            Paragraph(f"${float(totals.get('paid', 0)):,.2f}", right),
        ],
        [
            "",
            Paragraph("<b>AMOUNT DUE:</b>", right_bold),
            Paragraph(
                f"<b>${outstanding:,.2f}</b>",
                S(
                    "due",
                    fontSize=10,
                    textColor=colors.HexColor("#dc2626") if outstanding > 0 else DARK,
                    fontName="Helvetica-Bold",
                    alignment=TA_RIGHT,
                ),
            ),
        ],
    ]
    summary_tbl = Table(summary_rows, colWidths=["55%", "25%", "20%"])
    summary_tbl.setStyle(
        TableStyle(
            [
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LINEABOVE", (1, 2), (-1, 2), 1.5, ACCENT),
                ("BACKGROUND", (1, 2), (-1, 2), LIGHT_BG),
            ]
        )
    )
    story.append(summary_tbl)
    story.append(
        HRFlowable(
            width="100%", thickness=0.5, color=BORDER, spaceBefore=6, spaceAfter=4
        )
    )

    # Payment details
    if company.bank_account:
        pay_lines = ["<b>Remittance Details</b>"]
        if company.bank_name:
            pay_lines.append(f"Bank: {company.bank_name}")
        if company.bank_bsb:
            pay_lines.append(f"BSB: {company.bank_bsb}")
        pay_lines.append(f"Account: {company.bank_account}")
        if company.bank_account_name:
            pay_lines.append(f"Account Name: {company.bank_account_name}")
        for pl in pay_lines:
            story.append(Paragraph(pl, small))
        story.append(Spacer(1, 3 * mm))

    footer_text = f"{company.company_name or 'Total Image'}"
    if company.abn:
        footer_text += f"  |  ABN {company.abn}"
    story.append(
        Paragraph(
            footer_text,
            S(
                "ft",
                fontSize=7,
                textColor=colors.HexColor("#94a3b8"),
                alignment=TA_CENTER,
            ),
        )
    )

    doc.build(story)
    return buf.getvalue()


@router.get("/customers/{customer_id}/statement.pdf")
def customer_statement_pdf(
    customer_id: str,
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Statement of Account PDF for a customer."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    q = db.query(Job).filter(
        Job.customer_id == customer_id,
        Job.status.in_(["INVOICE", "PAID", "FINISH"]),
    )
    if date_from:
        q = q.filter((Job.invoice_date >= date_from) | (Job.date_in >= date_from))
    if date_to:
        q = q.filter((Job.invoice_date <= date_to) | (Job.date_in <= date_to))
    jobs = q.order_by(Job.invoice_date, Job.date_in).all()

    lines = []
    for j in jobs:
        lines.append(
            {
                "job_id": j.id,
                "invoice_no": j.invoice,
                "date": j.invoice_date or j.date_in,
                "due": j.due,
                "description": j.description or "",
                "total_inc": float(j.total_inc or 0),
                "paid": float(j.deposit or 0),
                "balance": float(j.balance_due or 0),
                "status": j.status,
            }
        )

    totals = {
        "invoiced": round(sum(l["total_inc"] for l in lines), 2),
        "paid": round(sum(l["paid"] for l in lines), 2),
        "outstanding": round(sum(l["balance"] for l in lines), 2),
    }

    company = db.query(CompanySettings).first() or CompanySettings(
        company_name="Total Image"
    )
    pdf_bytes = _build_statement(customer, lines, totals, company, date_from, date_to)

    filename = f"statement_{customer_id}_{date.today().isoformat()}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/jobs/{job_id}/pdf")
def job_pdf(
    job_id: str,
    type: str = Query("invoice", pattern="^(invoice|quote|picking-slip|job-sheet)$"),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Stream a PDF for the given job: invoice, quote, picking-slip, or job-sheet."""
    job = db.query(Job).options(joinedload(Job.items)).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    company = db.query(CompanySettings).first() or CompanySettings(
        company_name="Total Image"
    )

    if type == "picking-slip":
        pdf_bytes = _build_picking_slip(job, company)
        filename = f"picking_slip_{job_id}.pdf"
    elif type == "job-sheet":
        pdf_bytes = _build_job_sheet(job, company)
        filename = f"job_sheet_{job_id}.pdf"
    else:
        pdf_bytes = _build_pdf(job, company, type)
        filename = f"{type}_{job.invoice or job_id}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )

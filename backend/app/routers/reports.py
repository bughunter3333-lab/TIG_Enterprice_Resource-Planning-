from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date, timedelta
from app.database import get_db
from app.models.job import Job, JobItem
from app.models.inventory import InventoryItem
from app.models.customer import Customer
from app.models.purchase_order import PurchaseOrder
from app.core.dependencies import require_any
from app.core.fiscal import current_fiscal_year
from app.models.user import User

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/sales-summary")
def sales_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    customer_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Sales summary report - revenue by customer for a period."""
    q = db.query(Job).filter(Job.status.in_(["INVOICE", "PAID"]))
    if date_from:
        q = q.filter(Job.invoice_date >= date_from)
    if date_to:
        q = q.filter(Job.invoice_date <= date_to)
    if customer_id:
        q = q.filter(Job.customer_id == customer_id)
    jobs = q.all()

    # Aggregate by customer
    by_customer = {}
    for j in jobs:
        cid = j.customer_id or "UNKNOWN"
        if cid not in by_customer:
            by_customer[cid] = {
                "customer_id": cid,
                "customer_name": j.customer_name or "Unknown",
                "job_count": 0,
                "revenue_ex": 0.0,
                "gst": 0.0,
                "revenue_inc": 0.0,
                "paid": 0.0,
                "outstanding": 0.0,
            }
        by_customer[cid]["job_count"] += 1
        by_customer[cid]["revenue_ex"] += float(j.total_ex or 0)
        by_customer[cid]["gst"] += float(j.tax or 0)
        by_customer[cid]["revenue_inc"] += float(j.total_inc or 0)
        by_customer[cid]["paid"] += float(j.deposit or 0)
        by_customer[cid]["outstanding"] += float(j.balance_due or 0)

    rows = sorted(by_customer.values(), key=lambda x: -x["revenue_inc"])
    totals = {
        "job_count": sum(r["job_count"] for r in rows),
        "revenue_ex": round(sum(r["revenue_ex"] for r in rows), 2),
        "gst": round(sum(r["gst"] for r in rows), 2),
        "revenue_inc": round(sum(r["revenue_inc"] for r in rows), 2),
        "paid": round(sum(r["paid"] for r in rows), 2),
        "outstanding": round(sum(r["outstanding"] for r in rows), 2),
    }
    for r in rows:
        for k in ("revenue_ex", "gst", "revenue_inc", "paid", "outstanding"):
            r[k] = round(r[k], 2)
    return {"rows": rows, "totals": totals, "date_from": date_from, "date_to": date_to}


@router.get("/gst")
def gst_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """GST report for BAS lodgement — summarises G1/G2 sales and 1A/1B credits.

    Uses invoice_date (the date the invoice was raised) for period filtering,
    which is correct for both cash and accruals GST accounting.
    """
    q = db.query(Job).filter(Job.status.in_(["INVOICE", "PAID"]))
    if date_from:
        q = q.filter(Job.invoice_date >= date_from)
    if date_to:
        q = q.filter(Job.invoice_date <= date_to)
    jobs = q.all()

    total_sales_inc = sum(float(j.total_inc or 0) for j in jobs)
    total_sales_ex = sum(float(j.total_ex or 0) for j in jobs)
    gst_collected = sum(float(j.tax or 0) for j in jobs)
    invoice_count = len(jobs)

    # Month-by-month breakdown keyed on invoice_date (fall back to date_in for old records)
    monthly = {}
    for j in jobs:
        month = (j.invoice_date or j.date_in or "")[:7] or "Unknown"
        if month not in monthly:
            monthly[month] = {
                "month": month,
                "invoices": 0,
                "sales_inc": 0.0,
                "sales_ex": 0.0,
                "gst": 0.0,
            }
        monthly[month]["invoices"] += 1
        monthly[month]["sales_inc"] += float(j.total_inc or 0)
        monthly[month]["sales_ex"] += float(j.total_ex or 0)
        monthly[month]["gst"] += float(j.tax or 0)

    rows = sorted(monthly.values(), key=lambda x: x["month"])
    for r in rows:
        r["sales_inc"] = round(r["sales_inc"], 2)
        r["sales_ex"] = round(r["sales_ex"], 2)
        r["gst"] = round(r["gst"], 2)

    return {
        "summary": {
            "G1_total_sales_inc_gst": round(total_sales_inc, 2),
            "G1_total_sales_ex_gst": round(total_sales_ex, 2),
            "1A_gst_collected": round(gst_collected, 2),
            "invoice_count": invoice_count,
        },
        "monthly_breakdown": rows,
        "date_from": date_from,
        "date_to": date_to,
    }


def _parse_date(date_str: str, fallback: date) -> date:
    """Parse YYYY-MM-DD or DD/MM/YYYY string to date, returning fallback on failure."""
    if not date_str:
        return fallback
    try:
        s = date_str.strip().split(" ")[0]
        if "/" in s:
            d, m, y = s.split("/")
            return date(int(y), int(m), int(d))
        return date.fromisoformat(s[:10])
    except Exception:
        return fallback


@router.get("/aged-receivables")
def aged_receivables(
    as_at: Optional[str] = Query(None, description="ISO date, defaults to today"),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Aged receivables — outstanding balance bucketed by 0-30, 31-60, 61-90, 90+ days.

    Aging is calculated from the payment due date (job.due), falling back to
    invoice_date + 30 days then date_in + 30 days. Using due date is the
    correct basis for credit control (days overdue, not days since invoiced).
    """
    as_at_date = date.fromisoformat(as_at) if as_at else date.today()
    jobs = (
        db.query(Job)
        .filter(
            Job.balance_due > 0,
            Job.status.in_(["INVOICE", "PAID"]),
        )
        .all()
    )

    by_customer: dict = {}
    for j in jobs:
        cid = j.customer_id or "UNKNOWN"
        if cid not in by_customer:
            by_customer[cid] = {
                "customer_id": cid,
                "customer_name": j.customer_name or "Unknown",
                "current": 0.0,
                "days_31_60": 0.0,
                "days_61_90": 0.0,
                "over_90": 0.0,
                "total": 0.0,
                "oldest_due": None,
                "lines": [],
            }
        # Use due date for aging; fall back to invoice_date+30 then date_in+30
        if j.due:
            due_dt = _parse_date(j.due, as_at_date)
        elif j.invoice_date:
            due_dt = _parse_date(j.invoice_date, as_at_date) + timedelta(days=30)
        else:
            due_dt = _parse_date(j.date_in or "", as_at_date) + timedelta(days=30)

        days_overdue = (as_at_date - due_dt).days
        bal = float(j.balance_due or 0)
        row = by_customer[cid]
        row["total"] += bal
        if days_overdue <= 0:
            row["current"] += bal
        elif days_overdue <= 30:
            row["days_31_60"] += bal
        elif days_overdue <= 60:
            row["days_61_90"] += bal
        else:
            row["over_90"] += bal
        if row["oldest_due"] is None or due_dt < row["oldest_due"]:
            row["oldest_due"] = due_dt
        row["lines"].append(
            {
                "job_id": j.id,
                "invoice": j.invoice,
                "invoice_date": j.invoice_date or j.date_in,
                "due_date": str(due_dt),
                "days_overdue": max(0, days_overdue),
                "total_inc": float(j.total_inc or 0),
                "balance_due": bal,
            }
        )

    rows = sorted(by_customer.values(), key=lambda x: -x["total"])
    for r in rows:
        for k in ("current", "days_31_60", "days_61_90", "over_90", "total"):
            r[k] = round(r[k], 2)
        if r["oldest_due"]:
            r["oldest_due"] = str(r["oldest_due"])

    totals = {
        "current": round(sum(r["current"] for r in rows), 2),
        "days_31_60": round(sum(r["days_31_60"] for r in rows), 2),
        "days_61_90": round(sum(r["days_61_90"] for r in rows), 2),
        "over_90": round(sum(r["over_90"] for r in rows), 2),
        "total": round(sum(r["total"] for r in rows), 2),
    }
    return {"rows": rows, "totals": totals, "as_at": str(as_at_date)}


@router.get("/aged-payables")
def aged_payables(
    as_at: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Aged payables — outstanding PO balances owed to suppliers, bucketed by age."""
    as_at_date = date.fromisoformat(as_at) if as_at else date.today()
    pos = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.status.notin_(["Cancelled", "Received"]),
            PurchaseOrder.total_inc > 0,
        )
        .all()
    )

    by_supplier: dict = {}
    for po in pos:
        sid = po.supplier_id or "UNKNOWN"
        if sid not in by_supplier:
            by_supplier[sid] = {
                "supplier_id": sid,
                "supplier_name": getattr(po, "supplier_name", None) or sid,
                "current": 0.0,
                "days_31_60": 0.0,
                "days_61_90": 0.0,
                "over_90": 0.0,
                "total": 0.0,
                "lines": [],
            }
        due_dt = _parse_date(
            getattr(po, "due_date", None) or po.order_date or "", as_at_date
        )
        if due_dt == as_at_date and po.order_date:
            due_dt = _parse_date(po.order_date, as_at_date) + timedelta(days=30)
        days_overdue = (as_at_date - due_dt).days
        amt = float(po.total_inc or 0)
        row = by_supplier[sid]
        row["total"] += amt
        if days_overdue <= 0:
            row["current"] += amt
        elif days_overdue <= 30:
            row["days_31_60"] += amt
        elif days_overdue <= 60:
            row["days_61_90"] += amt
        else:
            row["over_90"] += amt
        row["lines"].append(
            {
                "po_id": po.id,
                "po_number": po.po_number,
                "order_date": po.order_date,
                "due_date": str(due_dt),
                "days_overdue": max(0, days_overdue),
                "total_inc": amt,
                "status": po.status,
            }
        )

    rows = sorted(by_supplier.values(), key=lambda x: -x["total"])
    for r in rows:
        for k in (
            "current",
            "days_31_60",
            "days_61_60",
            "days_61_90",
            "over_90",
            "total",
        ):
            if k in r:
                r[k] = round(r[k], 2)

    totals = {
        "current": round(sum(r["current"] for r in rows), 2),
        "days_31_60": round(sum(r["days_31_60"] for r in rows), 2),
        "days_61_90": round(sum(r["days_61_90"] for r in rows), 2),
        "over_90": round(sum(r["over_90"] for r in rows), 2),
        "total": round(sum(r["total"] for r in rows), 2),
    }
    return {"rows": rows, "totals": totals, "as_at": str(as_at_date)}


@router.get("/customers/{customer_id}/statement")
def customer_statement(
    customer_id: str,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Statement of account for a customer — all invoices, payments, running balance."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        from fastapi import HTTPException

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
    running_balance = 0.0
    for j in jobs:
        total_inc = float(j.total_inc or 0)
        paid = float(j.deposit or 0)
        balance = float(j.balance_due or 0)
        running_balance += total_inc - paid
        lines.append(
            {
                "job_id": j.id,
                "invoice_no": j.invoice,
                "date": j.invoice_date or j.date_in,
                "due": j.due,
                "description": j.description or j.customer_name or "",
                "total_inc": round(total_inc, 2),
                "paid": round(paid, 2),
                "balance": round(balance, 2),
                "status": j.status,
            }
        )

    total_invoiced = sum(l["total_inc"] for l in lines)
    total_paid = sum(l["paid"] for l in lines)
    total_outstanding = sum(l["balance"] for l in lines)

    return {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "email": customer.email,
            "address": customer.address,
            "abn": customer.abn,
            "payment_terms": customer.payment_terms,
        },
        "lines": lines,
        "totals": {
            "invoiced": round(total_invoiced, 2),
            "paid": round(total_paid, 2),
            "outstanding": round(total_outstanding, 2),
        },
        "as_at": str(date.today()),
        "date_from": date_from,
        "date_to": date_to,
    }


@router.get("/inventory-valuation")
def inventory_valuation(
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Inventory valuation — stock on hand x unit cost, grouped by category."""
    items = db.query(InventoryItem).all()
    by_category = {}
    for i in items:
        cat = i.category or "Uncategorised"
        if cat not in by_category:
            by_category[cat] = {
                "category": cat,
                "sku_count": 0,
                "total_units": 0,
                "value": 0.0,
            }
        by_category[cat]["sku_count"] += 1
        by_category[cat]["total_units"] += int(i.stock or 0)
        by_category[cat]["value"] += float(i.stock or 0) * float(i.unit_cost or 0)

    rows = sorted(by_category.values(), key=lambda x: -x["value"])
    for r in rows:
        r["value"] = round(r["value"], 2)
    grand_total = round(sum(r["value"] for r in rows), 2)
    grand_units = sum(r["total_units"] for r in rows)
    grand_skus = sum(r["sku_count"] for r in rows)
    return {
        "rows": rows,
        "totals": {
            "sku_count": grand_skus,
            "total_units": grand_units,
            "value": grand_total,
        },
    }


@router.get("/job-profitability")
def job_profitability(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Job profitability — revenue vs cost per job."""
    from sqlalchemy.orm import joinedload

    q = (
        db.query(Job)
        .options(joinedload(Job.items))
        .filter(Job.status.in_(["INVOICE", "PAID", "FINISH"]))
    )
    if date_from:
        q = q.filter(Job.date_in >= date_from)
    if date_to:
        q = q.filter(Job.date_in <= date_to)
    jobs = q.all()

    rows = []
    for j in jobs:
        product_items = [it for it in j.items if it.display_type == "product"]
        cost = sum(
            float(it.purchase_price or 0) * int(it.order_qty or 0)
            for it in product_items
        )
        revenue = float(j.total_ex or 0)
        margin = revenue - cost
        margin_pct = (margin / revenue * 100) if revenue > 0 else 0
        rows.append(
            {
                "job_id": j.id,
                "customer": j.customer_name or "",
                "date_in": j.date_in or "",
                "status": j.status,
                "revenue_ex": round(revenue, 2),
                "cost": round(cost, 2),
                "margin": round(margin, 2),
                "margin_pct": round(margin_pct, 1),
            }
        )

    rows.sort(key=lambda x: -x["margin_pct"])
    totals = {
        "revenue_ex": round(sum(r["revenue_ex"] for r in rows), 2),
        "cost": round(sum(r["cost"] for r in rows), 2),
        "margin": round(sum(r["margin"] for r in rows), 2),
        "margin_pct": round(
            (
                sum(r["margin"] for r in rows)
                / sum(r["revenue_ex"] for r in rows)
                * 100
                if sum(r["revenue_ex"] for r in rows) > 0
                else 0
            ),
            1,
        ),
    }
    return {"rows": rows, "totals": totals}


@router.get("/on-time-delivery")
def on_time_delivery(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """On-time delivery rate — % of completed jobs dispatched on or before due date."""
    q = db.query(Job).filter(Job.status.in_(["FINISH", "INVOICE", "PAID"]))
    if date_from:
        q = q.filter(Job.date_in >= date_from)
    if date_to:
        q = q.filter(Job.date_in <= date_to)
    jobs = q.all()

    def parse_date(s):
        if not s:
            return None
        try:
            s = s.split(" ")[0]
            if "/" in s:
                parts = s.split("/")
                return date(int(parts[2]), int(parts[1]), int(parts[0]))
            return date.fromisoformat(s[:10])
        except Exception:
            return None

    total = len(jobs)
    on_time = 0
    late = 0
    no_due_date = 0

    by_customer: dict = {}
    for j in jobs:
        due = parse_date(j.due)
        out = parse_date(j.out)
        cid = j.customer_id or "UNKNOWN"
        if cid not in by_customer:
            by_customer[cid] = {
                "customer_id": cid,
                "customer_name": j.customer_name or "Unknown",
                "total": 0,
                "on_time": 0,
                "late": 0,
                "no_due_date": 0,
            }
        by_customer[cid]["total"] += 1
        if not due:
            no_due_date += 1
            by_customer[cid]["no_due_date"] += 1
        else:
            compare_date = out or date.today()
            if compare_date <= due:
                on_time += 1
                by_customer[cid]["on_time"] += 1
            else:
                late += 1
                by_customer[cid]["late"] += 1

    eligible = total - no_due_date
    rate = round((on_time / eligible * 100) if eligible > 0 else 0, 1)

    rows = sorted(by_customer.values(), key=lambda x: -(x["total"]))
    for r in rows:
        eligible_r = r["total"] - r["no_due_date"]
        r["rate"] = round((r["on_time"] / eligible_r * 100) if eligible_r > 0 else 0, 1)

    return {
        "summary": {
            "total": total,
            "on_time": on_time,
            "late": late,
            "no_due_date": no_due_date,
            "rate": rate,
        },
        "by_customer": rows,
        "date_from": date_from,
        "date_to": date_to,
    }


@router.get("/back-orders")
def back_orders(
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Back order report — job items with b_ord > 0 aggregated by SKU."""

    EXCLUDE_STATUSES = ["CANCEL", "PAID", "QUOTE"]
    rows_raw = (
        db.query(JobItem, Job)
        .join(Job, JobItem.job_id == Job.id)
        .filter(~Job.status.in_(EXCLUDE_STATUSES), JobItem.b_ord > 0)
        .all()
    )

    skus = list({item.stock_code for item, _ in rows_raw if item.stock_code})
    inv_map = (
        {
            inv.sku: inv
            for inv in db.query(InventoryItem).filter(InventoryItem.sku.in_(skus)).all()
        }
        if skus
        else {}
    )

    grouped: dict = {}
    for item, job in rows_raw:
        key = item.stock_code or f"NO-SKU-{item.id}"
        if key not in grouped:
            inv = inv_map.get(key)
            grouped[key] = {
                "sku": key,
                "description": item.description or (inv.name if inv else ""),
                "category": inv.category if inv else "",
                "supplier": inv.supplier if inv else "",
                "unit_cost": (
                    float(inv.unit_cost) if inv else float(item.purchase_price or 0)
                ),
                "stock_on_hand": int(inv.stock) if inv else 0,
                "total_b_ord": 0,
                "total_value": 0.0,
                "job_count": 0,
                "jobs": [],
            }
        b_ord = item.b_ord or 0
        grouped[key]["total_b_ord"] += b_ord
        grouped[key]["total_value"] += b_ord * grouped[key]["unit_cost"]
        grouped[key]["job_count"] += 1
        grouped[key]["jobs"].append(
            {
                "job_id": job.id,
                "customer_name": job.customer_name or "",
                "job_status": job.status,
                "due": job.due or "",
                "b_ord": b_ord,
                "po_no": item.po_no or "",
            }
        )

    result = sorted(grouped.values(), key=lambda x: -x["total_b_ord"])
    for r in result:
        r["total_value"] = round(r["total_value"], 2)

    totals = {
        "sku_count": len(result),
        "total_b_ord": sum(r["total_b_ord"] for r in result),
        "total_value": round(sum(r["total_value"] for r in result), 2),
    }
    return {"rows": result, "totals": totals}


@router.get("/decoration-performance")
def decoration_performance(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """Revenue and margin breakdown by decoration type."""
    from sqlalchemy.orm import joinedload

    q = (
        db.query(Job)
        .options(joinedload(Job.items))
        .filter(Job.status.in_(["INVOICE", "PAID", "FINISH"]))
    )
    if date_from:
        q = q.filter(Job.date_in >= date_from)
    if date_to:
        q = q.filter(Job.date_in <= date_to)
    jobs = q.all()

    by_dec: dict = {}
    for j in jobs:
        for item in j.items:
            if item.display_type in ("section", "note"):
                continue
            dec = item.decoration_type or "None"
            if dec not in by_dec:
                by_dec[dec] = {
                    "decoration_type": dec,
                    "item_count": 0,
                    "qty": 0,
                    "revenue": 0.0,
                    "cost": 0.0,
                }
            by_dec[dec]["item_count"] += 1
            by_dec[dec]["qty"] += int(item.order_qty or 0)
            by_dec[dec]["revenue"] += float(item.total or 0)
            by_dec[dec]["cost"] += float(item.purchase_price or 0) * int(
                item.order_qty or 0
            )

    rows = sorted(by_dec.values(), key=lambda x: -x["revenue"])
    for r in rows:
        r["revenue"] = round(r["revenue"], 2)
        r["cost"] = round(r["cost"], 2)
        r["margin"] = round(r["revenue"] - r["cost"], 2)
        r["margin_pct"] = round(
            (r["margin"] / r["revenue"] * 100) if r["revenue"] > 0 else 0, 1
        )

    return {"rows": rows}


@router.get("/bas-summary")
def bas_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    """BAS summary — G1 (total sales inc GST), 1A (GST collected), 1B (GST on purchases)."""
    if not date_from or not date_to:
        fy_start, fy_end = current_fiscal_year()
        date_from = date_from or fy_start.isoformat()
        date_to = date_to or fy_end.isoformat()

    jobs = (
        db.query(Job)
        .filter(
            Job.status.in_(["INVOICE", "PAID"]),
            Job.invoice_date >= date_from,
            Job.invoice_date <= date_to,
        )
        .all()
    )

    G1 = round(sum(float(j.total_inc or 0) for j in jobs), 2)
    one_A = round(sum(float(j.tax or 0) for j in jobs), 2)

    pos = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.order_date >= date_from,
            PurchaseOrder.order_date <= date_to,
        )
        .all()
    )
    one_B = round(sum(float(po.tax_total or 0) for po in pos), 2)

    return {
        "G1": G1,
        "1A": one_A,
        "1B": one_B,
        "period": {"date_from": date_from, "date_to": date_to},
    }

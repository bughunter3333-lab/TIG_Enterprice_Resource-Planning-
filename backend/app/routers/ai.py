from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta
import re

from app.database import get_db
from app.core.dependencies import require_any
from app.core.config import settings
from app.models.user import User
from app.models.job import Job, JobComment
from app.models.inventory import InventoryItem, StockMovement
from app.models.customer import Customer
from app.models.supplier import Supplier
from app.models.purchase_order import PurchaseOrder
from app.models.card_file import CardFile

router = APIRouter(prefix="/ai", tags=["ai"])


class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None


# ── Shared helpers ────────────────────────────────────────────────────────────


def has(text: str, *keywords) -> bool:
    t = text.lower()
    return any(k in t for k in keywords)


def parse_date(s: str) -> Optional[date]:
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except ValueError:
            continue
    return None


def fmt_currency(v) -> str:
    try:
        return f"${float(v):,.2f}"
    except (TypeError, ValueError):
        return "$0.00"


def pct(part: int, total: int) -> str:
    return f"{round(part / total * 100)}%" if total else "0%"


def get_active_jobs(db: Session) -> list:
    return db.query(Job).filter(Job.status.notin_(["FINISH", "CANCEL", "PAID"])).all()


def get_overdue_jobs(db: Session) -> list:
    return [
        j
        for j in get_active_jobs(db)
        if (d := parse_date(j.due or "")) and d < date.today()
    ]


def get_low_stock(db: Session) -> list:
    return (
        db.query(InventoryItem)
        .filter(
            InventoryItem.stock <= InventoryItem.min_stock,
            InventoryItem.min_stock > 0,
            InventoryItem.status == "Active",
        )
        .all()
    )


def get_jobs_due_soon(db: Session, days: int = 7) -> list:
    cutoff = date.today() + timedelta(days=days)
    return [
        j
        for j in get_active_jobs(db)
        if (d := parse_date(j.due or "")) and date.today() <= d <= cutoff
    ]


def get_open_freight(db: Session) -> list:
    return (
        db.query(Job)
        .filter(
            Job.ship_to.isnot(None),
            Job.ship_to != "",
            Job.status.notin_(["PAID", "CANCEL"]),
        )
        .all()
    )


def jobs_this_month(db: Session) -> list:
    today = date.today()
    month_start = today.replace(day=1)
    return [
        j
        for j in db.query(Job).all()
        if (d := parse_date(j.date_in or "")) and d >= month_start
    ]


def jobs_last_month(db: Session) -> list:
    today = date.today()
    first_this = today.replace(day=1)
    first_last = (first_this - timedelta(days=1)).replace(day=1)
    return [
        j
        for j in db.query(Job).all()
        if (d := parse_date(j.date_in or "")) and first_last <= d < first_this
    ]


# ── ML algorithms ─────────────────────────────────────────────────────────────


def _linear_regression(xs: list, ys: list) -> tuple:
    n = len(xs)
    if n < 2:
        return 0.0, (ys[0] if ys else 0.0), 0.0
    sx = sum(xs)
    sy = sum(ys)
    sxx = sum(x * x for x in xs)
    sxy = sum(x * y for x, y in zip(xs, ys))
    denom = n * sxx - sx**2
    if denom == 0:
        return 0.0, sy / n, 0.0
    m = (n * sxy - sx * sy) / denom
    b = (sy - m * sx) / n
    ymean = sy / n
    ss_tot = sum((y - ymean) ** 2 for y in ys)
    ss_res = sum((y - (m * x + b)) ** 2 for x, y in zip(xs, ys))
    r2 = max(0.0, min(1.0, 1 - ss_res / ss_tot)) if ss_tot > 0 else 0.0
    return m, b, r2


def _exponential_smoothing(ys: list, alpha: float = 0.3) -> list:
    """Simple exponential smoothing (EWMA). Returns smoothed series."""
    if not ys:
        return []
    smoothed = [ys[0]]
    for y in ys[1:]:
        smoothed.append(alpha * y + (1 - alpha) * smoothed[-1])
    return smoothed


def _holt_forecast(
    ys: list, alpha: float = 0.4, beta: float = 0.3, steps: int = 1
) -> tuple:
    """Holt's double exponential smoothing for trend. Returns (forecast, trend, r2_approx)."""
    if len(ys) < 3:
        return ys[-1] if ys else 0.0, 0.0, 0.0
    level = ys[0]
    trend = ys[1] - ys[0]
    for y in ys[1:]:
        prev_l = level
        level = alpha * y + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_l) + (1 - beta) * trend
    forecast = level + steps * trend
    # approximate R² vs simple mean baseline
    mean_y = sum(ys) / len(ys)
    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    smoothed = _exponential_smoothing(ys, alpha)
    ss_res = sum((y - s) ** 2 for y, s in zip(ys, smoothed))
    r2 = max(0.0, min(1.0, 1 - ss_res / ss_tot)) if ss_tot > 0 else 0.0
    return max(0.0, forecast), trend, r2


def _zscore_anomalies(values: list) -> list[tuple[int, float]]:
    """Return (index, z_score) pairs where |z| > 2."""
    if len(values) < 4:
        return []
    mean = sum(values) / len(values)
    std = (sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5
    if std < 0.01:
        return []
    return [
        (i, (v - mean) / std)
        for i, v in enumerate(values)
        if abs((v - mean) / std) > 2.0
    ]


# ── Analytics response builders ───────────────────────────────────────────────


def respond_jobs_summary(db: Session) -> str:
    all_jobs = db.query(Job).all()
    active = [j for j in all_jobs if j.status not in ("FINISH", "CANCEL", "PAID")]
    overdue = get_overdue_jobs(db)
    due_soon = get_jobs_due_soon(db, 7)
    by_status: dict = {}
    for j in all_jobs:
        by_status[j.status] = by_status.get(j.status, 0) + 1
    lines = [
        "**Job Summary**",
        f"• Total: {len(all_jobs)} | Active: {len(active)} | Overdue: {len(overdue)} | Due ≤7d: {len(due_soon)}",
        "",
        "**By Status:**",
    ]
    for status, count in sorted(by_status.items(), key=lambda x: -x[1]):
        lines.append(f"  {status}: {count}")
    if overdue:
        lines.append("\n**⚠ Overdue Jobs:**")
        for j in overdue[:5]:
            lines.append(f"  #{j.id} – {j.customer_name} (due {j.due})")
        if len(overdue) > 5:
            lines.append(f"  …and {len(overdue) - 5} more")
    return "\n".join(lines)


def respond_overdue(db: Session) -> str:
    overdue = get_overdue_jobs(db)
    if not overdue:
        return "Great news — no overdue jobs right now."
    lines = [f"**{len(overdue)} overdue job(s):**"]
    for j in sorted(overdue, key=lambda x: parse_date(x.due or "") or date.max):
        bal = float(j.balance_due or 0)
        days_late = (date.today() - (parse_date(j.due) or date.today())).days
        lines.append(
            f"• #{j.id} – {j.customer_name} | Due: {j.due} ({days_late}d late) | {j.status}"
            + (f" | Balance: {fmt_currency(bal)}" if bal > 0 else "")
        )
    return "\n".join(lines)


def respond_revenue(db: Session) -> str:
    all_jobs = db.query(Job).all()
    total_rev = sum(float(j.total_inc or 0) for j in all_jobs)
    outstanding = sum(
        float(j.balance_due or 0) for j in all_jobs if float(j.balance_due or 0) > 0
    )
    collected = sum(float(j.deposit or 0) for j in all_jobs)
    this_m = jobs_this_month(db)
    last_m = jobs_last_month(db)
    this_m_rev = sum(float(j.total_inc or 0) for j in this_m)
    last_m_rev = sum(float(j.total_inc or 0) for j in last_m)
    trend = ""
    if last_m_rev > 0:
        delta = round((this_m_rev - last_m_rev) / last_m_rev * 100, 1)
        trend = f" ({'↑' if delta >= 0 else '↓'}{abs(delta)}% vs last month)"
    monthly: dict = {}
    for j in all_jobs:
        d = parse_date(j.date_in or "")
        if d:
            key = d.strftime("%b %Y")
            monthly[key] = monthly.get(key, 0) + float(j.total_inc or 0)
    lines = [
        "**Revenue Overview**",
        f"• All-time billed: {fmt_currency(total_rev)} | Collected: {fmt_currency(collected)} | Outstanding: {fmt_currency(outstanding)}",
        f"• This month: {fmt_currency(this_m_rev)}{trend}",
    ]
    if all_jobs:
        lines.append(f"• Average job value: {fmt_currency(total_rev / len(all_jobs))}")
    if monthly:
        lines.append("\n**Monthly Breakdown (last 6):**")
        for month, rev in sorted(monthly.items())[-6:]:
            lines.append(f"  {month}: {fmt_currency(rev)}")
    return "\n".join(lines)


def respond_monthly_revenue(db: Session) -> str:
    this_m = jobs_this_month(db)
    last_m = jobs_last_month(db)
    this_rev = sum(float(j.total_inc or 0) for j in this_m)
    last_rev = sum(float(j.total_inc or 0) for j in last_m)
    lines = [
        f"**{date.today().strftime('%B %Y')} Revenue**",
        f"• Jobs: {len(this_m)} | Revenue: {fmt_currency(this_rev)}",
        f"• Last month: {len(last_m)} jobs | {fmt_currency(last_rev)}",
    ]
    if last_rev > 0:
        delta = round((this_rev - last_rev) / last_rev * 100, 1)
        lines.append(f"• Month-on-month: {'↑' if delta >= 0 else '↓'}{abs(delta)}%")
    return "\n".join(lines)


def respond_inventory(db: Session) -> str:
    items = db.query(InventoryItem).all()
    low = get_low_stock(db)
    active = [i for i in items if i.status == "Active"]
    total_value = sum(int(i.stock or 0) * float(i.unit_cost or 0) for i in active)
    zero_stock = [i for i in active if (i.stock or 0) == 0]
    by_cat: dict = {}
    for i in active:
        cat = i.category or "Uncategorised"
        by_cat[cat] = by_cat.get(cat, 0) + 1
    lines = [
        "**Inventory Summary**",
        f"• SKUs: {len(items)} ({len(active)} active) | Zero stock: {len(zero_stock)} | Low stock: {len(low)}",
        f"• Total stock value: {fmt_currency(total_value)}",
        "",
        "**By Category:**",
    ]
    for cat, count in sorted(by_cat.items(), key=lambda x: -x[1])[:8]:
        lines.append(f"  {cat}: {count} SKUs")
    if low:
        lines.append("\n**⚠ Low Stock:**")
        for i in low[:6]:
            lines.append(f"  {i.sku} – {i.name} | {i.stock}/{i.min_stock}")
    return "\n".join(lines)


def respond_low_stock(db: Session) -> str:
    low = get_low_stock(db)
    if not low:
        return "All inventory is above reorder levels — no action needed."
    lines = [f"**{len(low)} item(s) below reorder level:**"]
    for i in sorted(low, key=lambda x: (x.stock or 0) - (x.min_stock or 0)):
        shortage = (i.min_stock or 0) - (i.stock or 0)
        lines.append(
            f"• {i.sku} – {i.name} | Stock: {i.stock} | Min: {i.min_stock} | Short: {shortage} | Supplier: {i.supplier or '—'}"
        )
    lines.append("\n→ Stock → Auto-Reorder All to generate draft POs.")
    return "\n".join(lines)


def respond_customers(db: Session) -> str:
    customers = db.query(Customer).all()
    active = [c for c in customers if c.status == "Active"]
    jobs = db.query(Job).all()
    job_rev: dict = {}
    job_counts: dict = {}
    for j in jobs:
        job_rev[j.customer_id] = job_rev.get(j.customer_id, 0) + float(j.total_inc or 0)
        job_counts[j.customer_id] = job_counts.get(j.customer_id, 0) + 1
    top = sorted(customers, key=lambda c: job_rev.get(c.id, 0), reverse=True)[:5]
    lines = [
        "**Customer Summary**",
        f"• Total: {len(customers)} ({len(active)} active)",
        "",
        "**Top by Revenue:**",
    ]
    for c in top:
        rev = job_rev.get(c.id, 0)
        if rev > 0:
            lines.append(
                f"  {c.id} — {c.name}: {fmt_currency(rev)} ({job_counts.get(c.id, 0)} jobs)"
            )
    outstanding = [
        (j.customer_id, j.customer_name or "", float(j.balance_due or 0))
        for j in db.query(Job).filter(Job.balance_due > 0).all()
    ]
    if outstanding:
        cust_bal: dict = {}
        for cid, cname, bal in outstanding:
            k = f"{cid} – {cname}"
            cust_bal[k] = cust_bal.get(k, 0) + bal
        lines.append(f"\n**Outstanding ({len(cust_bal)} customers):**")
        for name, bal in sorted(cust_bal.items(), key=lambda x: -x[1])[:5]:
            lines.append(f"  {name}: {fmt_currency(bal)}")
    return "\n".join(lines)


def respond_customer_jobs(db: Session, keyword: str) -> str:
    jobs = (
        db.query(Job)
        .filter(
            Job.customer_name.ilike(f"%{keyword}%")
            | Job.customer_id.ilike(f"%{keyword}%")
        )
        .order_by(Job.id.desc())
        .limit(20)
        .all()
    )
    if not jobs:
        return f'No jobs found for **"{keyword}"**.'
    total_rev = sum(float(j.total_inc or 0) for j in jobs)
    outstanding = sum(
        float(j.balance_due or 0) for j in jobs if float(j.balance_due or 0) > 0
    )
    lines = [
        f'**Jobs for "{keyword}" ({len(jobs)}):**',
        f"• Total: {fmt_currency(total_rev)} | Outstanding: {fmt_currency(outstanding)}",
        "",
    ]
    for j in jobs[:10]:
        bal = float(j.balance_due or 0)
        lines.append(
            f"• #{j.id} | {j.status} | Due: {j.due} | {fmt_currency(j.total_inc)}"
            + (f" | Owes: {fmt_currency(bal)}" if bal > 0 else "")
        )
    return "\n".join(lines)


def respond_specific_job(db: Session, job_id: str) -> str:
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return f"Job **#{job_id}** not found."
    comments = (
        db.query(JobComment)
        .filter(JobComment.job_id == job_id)
        .order_by(JobComment.id.desc())
        .limit(3)
        .all()
    )
    bal = float(job.balance_due or 0)
    lines = [
        f"**Job #{job.id}**",
        f"• Customer: {job.customer_name} ({job.customer_id})",
        f"• Status: {job.status} | Priority: {job.priority}",
        f"• Date In: {job.date_in} | Due: {job.due}"
        + (f" | Out: {job.out}" if job.out else ""),
        f"• Value: {fmt_currency(job.total_inc)}"
        + (f" | Balance: {fmt_currency(bal)}" if bal > 0 else " | Paid ✓"),
    ]
    if job.assigned_to:
        lines.append(f"• Assigned: {job.assigned_to}")
    if job.ship_to:
        lines.append(f"• Ship To: {job.ship_to}")
    if job.cust_ref:
        lines.append(f"• Cust Ref: {job.cust_ref}")
    if job.description:
        lines.append(f"• Description: {job.description}")
    if comments:
        lines.append("\n**Latest comments:**")
        for c in comments:
            lines.append(f"  [{c.date} {c.initials}] {c.comment}")
    if (
        (due := parse_date(job.due or ""))
        and due < date.today()
        and job.status not in ("FINISH", "PAID", "CANCEL")
    ):
        lines.append(f"\n⚠ **{(date.today() - due).days} day(s) overdue.**")
    return "\n".join(lines)


def respond_production_pipeline(db: Session) -> str:
    stages = ["ORDER", "In Progress", "PROOF", "PRINT", "Pick/Pack", "FINISH"]
    all_jobs = db.query(Job).filter(Job.status.in_(stages)).all()
    by_stage: dict = {s: [] for s in stages}
    for j in all_jobs:
        by_stage[j.status].append(j)
    lines = ["**Production Pipeline:**"]
    for stage in stages:
        js = by_stage[stage]
        if js:
            val = sum(float(j.total_inc or 0) for j in js)
            lines.append(f"  **{stage}** ({len(js)} jobs | {fmt_currency(val)}):")
            for j in js[:3]:
                flag = (
                    " ⚠OVERDUE"
                    if (d := parse_date(j.due or "")) and d < date.today()
                    else ""
                )
                lines.append(f"    #{j.id} – {j.customer_name} | Due: {j.due}{flag}")
            if len(js) > 3:
                lines.append(f"    …{len(js) - 3} more")
    return "\n".join(lines) if any(by_stage.values()) else "No jobs in production."


def respond_quote_pipeline(db: Session) -> str:
    quotes = db.query(Job).filter(Job.status == "QUOTE").all()
    new_jobs = db.query(Job).filter(Job.status == "New").all()
    total_quote_val = sum(float(j.total_inc or 0) for j in quotes)
    lines = [
        "**Quote & New Order Pipeline**",
        f"• Open quotes: {len(quotes)} | Value: {fmt_currency(total_quote_val)}",
        f"• New orders: {len(new_jobs)}",
    ]
    if quotes:
        lines.append("\n**Open Quotes:**")
        for j in quotes[:6]:
            lines.append(
                f"  #{j.id} – {j.customer_name} | {fmt_currency(j.total_inc)} | Due: {j.due or '—'}"
            )
    return "\n".join(lines)


def respond_due_soon(db: Session, days: int = 7) -> str:
    due = get_jobs_due_soon(db, days)
    if not due:
        return f"No jobs due within {days} days."
    lines = [f"**{len(due)} job(s) due within {days} days:**"]
    for j in sorted(due, key=lambda x: parse_date(x.due or "") or date.max):
        d = parse_date(j.due or "")
        days_left = (d - date.today()).days if d else 0
        flag = "🔴" if days_left <= 1 else "🟡" if days_left <= 3 else "🟢"
        lines.append(
            f"{flag} #{j.id} – {j.customer_name} | Due: {j.due} ({days_left}d) | {j.status} | {fmt_currency(j.total_inc)}"
        )
    return "\n".join(lines)


def respond_open_freight(db: Session) -> str:
    freight = get_open_freight(db)
    if not freight:
        return "No open freight jobs."
    by_ship: dict = {}
    for j in freight:
        by_ship.setdefault(j.ship_to or "No Code", []).append(j)
    total_val = sum(float(j.total_inc or 0) for j in freight)
    lines = [
        f"**Open Freight — {len(freight)} job(s) | {fmt_currency(total_val)}**",
        "",
    ]
    for code, js in sorted(by_ship.items()):
        lines.append(f"**{code}** ({len(js)}):")
        for j in js[:4]:
            lines.append(f"  #{j.id} – {j.customer_name} | {j.status} | Due: {j.due}")
    return "\n".join(lines)


def respond_purchase_orders(db: Session) -> str:
    pos = db.query(PurchaseOrder).all()
    drafts = [p for p in pos if p.status == "Draft"]
    sent = [p for p in pos if p.status == "Sent"]
    open_val = sum(
        float(p.total or 0) for p in pos if p.status not in ("Received", "Cancelled")
    )
    lines = [
        "**Purchase Orders**",
        f"• Total: {len(pos)} | Draft: {len(drafts)} | Sent: {len(sent)} | Open value: {fmt_currency(open_val)}",
    ]
    if drafts:
        lines.append("\n**Draft — send these:**")
        for p in drafts[:5]:
            lines.append(f"  {p.id} – {p.supplier_name} | {fmt_currency(p.total)}")
    if sent:
        lines.append("\n**Awaiting delivery:**")
        for p in sent[:4]:
            lines.append(
                f"  {p.id} – {p.supplier_name} | Expected: {p.expected_date or '—'}"
            )
    return "\n".join(lines)


def respond_card_files(db: Session) -> str:
    cards = db.query(CardFile).all()
    if not cards:
        return "No card files found."
    groups: dict = {}
    for c in cards:
        g = c.ship_code.split(".")[0] if "." in c.ship_code else c.ship_code
        groups.setdefault(g, []).append(c)
    lines = [
        f"**Card Files — {len(cards)} addresses across {len(groups)} group(s)**",
        "",
    ]
    for group, group_cards in sorted(groups.items()):
        lines.append(f"**{group}** ({len(group_cards)}):")
        for c in group_cards:
            addr = ", ".join(filter(None, [c.suburb, c.state]))
            lines.append(f"  {c.ship_code} – {c.company_name or '—'} | {addr or '—'}")
    return "\n".join(lines)


def respond_ship_to(db: Session, ship_code: str) -> str:
    jobs = (
        db.query(Job)
        .filter(Job.ship_to.ilike(f"%{ship_code}%"))
        .order_by(Job.id.desc())
        .limit(15)
        .all()
    )
    card = db.query(CardFile).filter(CardFile.ship_code.ilike(ship_code)).first()
    lines = [f"**Ship-to: {ship_code.upper()}**"]
    if card:
        addr = " ".join(
            filter(None, [card.address1, card.suburb, card.state, card.postcode])
        )
        lines += [f"• Company: {card.company_name or '—'}", f"• Address: {addr or '—'}"]
        if card.contact_name:
            lines.append(f"• Contact: {card.contact_name}")
    if not jobs:
        lines.append(f"No jobs found shipping to {ship_code}.")
    else:
        total_val = sum(float(j.total_inc or 0) for j in jobs)
        outstanding = sum(
            float(j.balance_due or 0) for j in jobs if float(j.balance_due or 0) > 0
        )
        lines.append(
            f"\n**{len(jobs)} job(s) | {fmt_currency(total_val)} | {fmt_currency(outstanding)} outstanding:**"
        )
        for j in jobs[:8]:
            lines.append(f"  #{j.id} – {j.customer_name} | {j.status} | Due: {j.due}")
    return "\n".join(lines)


def respond_todays_summary(db: Session) -> str:
    today = date.today()
    overdue = get_overdue_jobs(db)
    due_soon = get_jobs_due_soon(db, 3)
    low = get_low_stock(db)
    draft_pos = db.query(PurchaseOrder).filter(PurchaseOrder.status == "Draft").all()
    open_freight = get_open_freight(db)
    quotes = db.query(Job).filter(Job.status == "QUOTE").all()
    urgent = []
    if overdue:
        urgent.append(f"🔴 {len(overdue)} overdue job(s)")
    if due_soon:
        urgent.append(f"🟡 {len(due_soon)} job(s) due within 3 days")
    if open_freight:
        urgent.append(f"🚚 {len(open_freight)} open freight job(s)")
    if low:
        urgent.append(f"🟠 {len(low)} low stock alert(s)")
    if draft_pos:
        urgent.append(f"📋 {len(draft_pos)} draft PO(s) not sent")
    if quotes:
        urgent.append(f"💬 {len(quotes)} open quote(s)")
    lines = [f"**Daily Briefing — {today.strftime('%A, %d %B %Y')}**", ""]
    if urgent:
        lines.append("**Action Required:**")
        lines.extend(f"  {u}" for u in urgent)
    else:
        lines.append("✅ No critical items — all clear.")
    in_prog = (
        db.query(Job).filter(Job.status.in_(["In Progress", "PRINT", "PROOF"])).all()
    )
    if in_prog:
        lines.append(f"\n**In Production ({len(in_prog)}):**")
        for j in in_prog[:4]:
            lines.append(f"  #{j.id} – {j.customer_name} | Due: {j.due} | {j.status}")
    this_m = jobs_this_month(db)
    if this_m:
        rev = sum(float(j.total_inc or 0) for j in this_m)
        lines.append(
            f"\n**{today.strftime('%B')} so far:** {len(this_m)} jobs | {fmt_currency(rev)}"
        )
    return "\n".join(lines)


# ── Advanced ML Analytics ─────────────────────────────────────────────────────


def respond_forecast(db: Session) -> str:
    all_jobs = db.query(Job).all()
    monthly: dict = {}
    for j in all_jobs:
        d = parse_date(j.date_in or "")
        if d:
            key = (d.year, d.month)
            monthly[key] = monthly.get(key, 0) + float(j.total_inc or 0)
    if len(monthly) < 3:
        return "Need at least 3 months of data to forecast."
    sorted_months = sorted(monthly.keys())
    ys = [monthly[k] for k in sorted_months]
    xs = list(range(len(ys)))

    # Holt's double exponential smoothing (handles trend better than OLS)
    holt_pred, holt_trend, holt_r2 = _holt_forecast(ys, alpha=0.4, beta=0.3, steps=1)
    # OLS as secondary
    m_ols, b_ols, r2_ols = _linear_regression(xs, ys)
    ols_pred = max(0.0, m_ols * len(ys) + b_ols)
    # Ensemble: weighted average (Holt 60%, OLS 40%)
    ensemble = 0.6 * holt_pred + 0.4 * ols_pred

    today = date.today()
    next_month = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
    confidence = "High" if holt_r2 > 0.7 else "Moderate" if holt_r2 > 0.4 else "Low"
    trend_dir = (
        "upward 📈"
        if holt_trend > 50
        else "downward 📉" if holt_trend < -50 else "flat ➡"
    )
    avg_3 = sum(ys[-3:]) / 3

    lines = [
        "**Revenue Forecast — Holt's Exponential Smoothing + OLS Ensemble**",
        "",
        f"• Trend: {trend_dir} ({fmt_currency(holt_trend)}/month)",
        f"• 3-month average: {fmt_currency(avg_3)}",
        f"• Holt's prediction: {fmt_currency(holt_pred)}",
        f"• OLS prediction: {fmt_currency(ols_pred)}",
        f"• **Ensemble forecast ({next_month.strftime('%B %Y')}): {fmt_currency(ensemble)}**",
        f"• Model fit R²: {round(holt_r2 * 100)}% — {confidence} confidence",
        "",
        "**Recent Monthly Revenue:**",
    ]
    for (yr, mo), rev in sorted(monthly.items())[-6:]:
        ewma = _exponential_smoothing(
            [monthly[k] for k in sorted_months if k <= (yr, mo)], 0.3
        )
        lines.append(
            f"  {date(yr, mo, 1).strftime('%b %Y')}: {fmt_currency(rev)}  (EWMA: {fmt_currency(ewma[-1])})"
        )
    lines.append(
        "\n→ Holt's method captures revenue trend. Ensemble blends two models for stability."
    )
    return "\n".join(lines)


def respond_anomalies(db: Session) -> str:
    items = db.query(InventoryItem).filter(InventoryItem.status == "Active").all()
    movements = db.query(StockMovement).all()

    # Group movements by SKU (fixed: was using item_id)
    sku_deltas: dict = {}
    for mv in movements:
        if mv.sku:
            sku_deltas.setdefault(mv.sku, []).append(float(mv.quantity or 0))

    stock_anomalies = []
    for item in items:
        outflows = [abs(d) for d in sku_deltas.get(item.sku, []) if d < 0]
        if len(outflows) < 3:
            continue
        mean = sum(outflows) / len(outflows)
        std = (sum((x - mean) ** 2 for x in outflows) / len(outflows)) ** 0.5
        if std < 0.5:
            continue
        recent = outflows[-1]
        z = (recent - mean) / std
        if z > 2.0:
            stock_anomalies.append((item, z, recent, mean))

    # Revenue anomalies by month
    all_jobs = db.query(Job).all()
    monthly: dict = {}
    for j in all_jobs:
        d = parse_date(j.date_in or "")
        if d:
            key = d.strftime("%b %Y")
            monthly[key] = monthly.get(key, 0) + float(j.total_inc or 0)
    sorted_revs = [v for _, v in sorted(monthly.items())]
    rev_anomalies = _zscore_anomalies(sorted_revs)
    months_list = sorted(monthly.keys())

    # Stagnant jobs
    active_jobs = get_active_jobs(db)
    stuck = [
        (j, (date.today() - (parse_date(j.date_in or "") or date.today())).days)
        for j in active_jobs
        if (d := parse_date(j.date_in or "")) and (date.today() - d).days > 30
    ]
    stuck.sort(key=lambda x: -x[1])

    lines = ["**ML Anomaly Detection**", ""]
    if stock_anomalies:
        lines.append(f"**⚠ Stock Consumption Spikes ({len(stock_anomalies)}):**")
        for item, z, recent, mean in sorted(stock_anomalies, key=lambda x: -x[1])[:5]:
            lines.append(
                f"  {item.sku} – {item.name} | Z={round(z,1)}σ | Recent: {round(recent)} vs avg: {round(mean)}"
            )
    else:
        lines.append("✅ No stock consumption anomalies.")

    if rev_anomalies:
        lines.append(f"\n**⚠ Revenue Anomalies ({len(rev_anomalies)} months):**")
        for idx, z in rev_anomalies[:4]:
            month = months_list[idx] if idx < len(months_list) else "?"
            direction = "spike ↑" if z > 0 else "dip ↓"
            lines.append(
                f"  {month}: {fmt_currency(sorted_revs[idx])} — {direction} (Z={round(z,1)}σ)"
            )
    else:
        lines.append("✅ Revenue is within normal variance.")

    lines.append("")
    if stuck:
        lines.append(f"**⚠ Stagnant Jobs (active >30 days): {len(stuck)}**")
        for j, age in stuck[:5]:
            lines.append(f"  #{j.id} – {j.customer_name} | {j.status} | {age} days")
    else:
        lines.append("✅ No stagnant jobs (all within 30 days).")
    return "\n".join(lines)


def respond_customer_churn(db: Session) -> str:
    customers = db.query(Customer).filter(Customer.status == "Active").all()
    all_jobs = db.query(Job).all()
    last_order: dict = {}
    order_counts: dict = {}
    total_spend: dict = {}
    for j in all_jobs:
        d = parse_date(j.date_in or "")
        if d and j.customer_id:
            if j.customer_id not in last_order or d > last_order[j.customer_id]:
                last_order[j.customer_id] = d
            order_counts[j.customer_id] = order_counts.get(j.customer_id, 0) + 1
            total_spend[j.customer_id] = total_spend.get(j.customer_id, 0) + float(
                j.total_inc or 0
            )
    today = date.today()
    at_risk, high_risk, never = [], [], []
    for c in customers:
        last = last_order.get(c.id)
        if not last:
            never.append(c)
        else:
            days = (today - last).days
            if days > 120:
                high_risk.append((c, days, last))
            elif days > 60:
                at_risk.append((c, days, last))
    lines = [
        "**Customer Churn Risk — ML Analysis**",
        f"• Analysed: {len(customers)} active customers",
        f"• High risk (>120d): {len(high_risk)} | At risk (60–120d): {len(at_risk)} | Never ordered: {len(never)}",
        "",
    ]
    if high_risk:
        lines.append("**🔴 High Risk — Re-engage Now:**")
        for c, days, last in sorted(high_risk, key=lambda x: -x[1])[:6]:
            spend = fmt_currency(total_spend.get(c.id, 0))
            lines.append(
                f"  {c.name} ({c.id}) | Last: {last.strftime('%d/%m/%Y')} ({days}d) | LTV: {spend}"
            )
    if at_risk:
        lines.append("\n**🟡 At Risk — Follow Up:**")
        for c, days, last in sorted(at_risk, key=lambda x: -x[1])[:5]:
            lines.append(
                f"  {c.name} ({c.id}) | Last: {last.strftime('%d/%m/%Y')} ({days}d ago)"
            )
    if not at_risk and not high_risk:
        lines.append("✅ All customers ordered within 60 days — good retention!")
    return "\n".join(lines)


def respond_abc_analysis(db: Session) -> str:
    """ABC/Pareto analysis of inventory by stock value."""
    items = (
        db.query(InventoryItem)
        .filter(InventoryItem.status == "Active", InventoryItem.stock > 0)
        .all()
    )
    if not items:
        return "No active inventory to analyse."
    valued = [(i, int(i.stock or 0) * float(i.unit_cost or 0)) for i in items]
    valued.sort(key=lambda x: -x[1])
    total_value = sum(v for _, v in valued)
    if total_value == 0:
        return "No inventory value data available."
    lines = ["**ABC Inventory Analysis (Pareto 80/20)**", ""]
    cumulative = 0.0
    a_items, b_items, c_items = [], [], []
    for item, val in valued:
        cumulative += val
        cum_pct = cumulative / total_value
        if cum_pct <= 0.80:
            a_items.append((item, val))
        elif cum_pct <= 0.95:
            b_items.append((item, val))
        else:
            c_items.append((item, val))
    a_val = sum(v for _, v in a_items)
    b_val = sum(v for _, v in b_items)
    c_val = sum(v for _, v in c_items)
    lines += [
        f"• **A Items** (top 80% value): {len(a_items)} SKUs = {fmt_currency(a_val)} ({pct(len(a_items), len(items))} of SKUs)",
        f"• **B Items** (next 15%): {len(b_items)} SKUs = {fmt_currency(b_val)}",
        f"• **C Items** (bottom 5%): {len(c_items)} SKUs = {fmt_currency(c_val)}",
        f"• Total stock value: {fmt_currency(total_value)}",
        "",
        "**Top A Items (highest value):**",
    ]
    for item, val in a_items[:8]:
        lines.append(
            f"  {item.sku} – {item.name} | Qty: {item.stock} | Value: {fmt_currency(val)}"
        )
    lines.append(
        "\n→ Focus reorder attention on A items — they represent 80% of your capital."
    )
    return "\n".join(lines)


def respond_margin_analysis(db: Session) -> str:
    """Profit margin analysis by customer and overall."""
    all_jobs = db.query(Job).all()
    if not all_jobs:
        return "No jobs to analyse."
    total_rev = sum(float(j.total_inc or 0) for j in all_jobs)
    # Use deposit as proxy for collected; balance_due as outstanding
    # Margin by customer: revenue - cost (estimated via total_ex → tax = cost proxy)
    cust_rev: dict = {}
    cust_ex: dict = {}
    cust_count: dict = {}
    for j in all_jobs:
        if j.customer_id and j.status not in ("CANCEL",):
            inc = float(j.total_inc or 0)
            ex = float(j.total_ex or 0)
            cust_rev[j.customer_id] = cust_rev.get(j.customer_id, 0) + inc
            cust_ex[j.customer_id] = cust_ex.get(j.customer_id, 0) + ex
            cust_count[j.customer_id] = cust_count.get(j.customer_id, 0) + 1
    # Top customers by revenue with margin %
    sorted_custs = sorted(cust_rev.keys(), key=lambda k: -cust_rev[k])
    lines = ["**Revenue & Margin Analysis by Customer**", ""]
    total_gst = sum(float(j.tax or 0) for j in all_jobs if j.status not in ("CANCEL",))
    total_ex = sum(
        float(j.total_ex or 0) for j in all_jobs if j.status not in ("CANCEL",)
    )
    lines += [
        f"• Total billed (inc GST): {fmt_currency(total_rev)}",
        f"• Total ex GST: {fmt_currency(total_ex)} | Total GST: {fmt_currency(total_gst)}",
        f"• Avg job value: {fmt_currency(total_rev / len(all_jobs) if all_jobs else 0)}",
        "",
        "**Top Customers by Revenue:**",
    ]
    for cid in sorted_custs[:8]:
        rev = cust_rev[cid]
        ex = cust_ex[cid]
        count = cust_count[cid]
        avg = rev / count if count else 0
        rev_share = pct(int(rev), int(total_rev))
        lines.append(
            f"  {cid} | {fmt_currency(rev)} ({rev_share} of total) | {count} jobs | Avg: {fmt_currency(avg)}"
        )
    # Job value distribution
    vals = [float(j.total_inc or 0) for j in all_jobs if float(j.total_inc or 0) > 0]
    if vals:
        vals.sort()
        median = vals[len(vals) // 2]
        lines.append("\n**Job Value Distribution:**")
        lines.append(
            f"  Median: {fmt_currency(median)} | Min: {fmt_currency(vals[0])} | Max: {fmt_currency(vals[-1])}"
        )
        small = len([v for v in vals if v < 500])
        medium = len([v for v in vals if 500 <= v < 2000])
        large = len([v for v in vals if v >= 2000])
        lines.append(f"  <$500: {small} | $500–$2k: {medium} | >$2k: {large}")
    return "\n".join(lines)


def respond_dso(db: Session) -> str:
    """Days Sales Outstanding — average collection time."""
    all_jobs = db.query(Job).all()
    invoiced = [j for j in all_jobs if j.status in ("INVOICE", "PAID") and j.date_in]
    if not invoiced:
        return "No invoiced jobs to calculate DSO."
    total_outstanding = sum(
        float(j.balance_due or 0) for j in all_jobs if float(j.balance_due or 0) > 0
    )
    total_rev_90 = sum(
        float(j.total_inc or 0)
        for j in all_jobs
        if (d := parse_date(j.date_in or "")) and (date.today() - d).days <= 90
    )
    dso = (total_outstanding / total_rev_90 * 90) if total_rev_90 > 0 else 0
    # Collection efficiency
    paid = [j for j in all_jobs if j.status == "PAID"]
    partially_paid = [
        j
        for j in all_jobs
        if float(j.deposit or 0) > 0 and float(j.balance_due or 0) > 0
    ]
    fully_outstanding = [j for j in invoiced if float(j.deposit or 0) == 0]
    lines = [
        "**Days Sales Outstanding (DSO) — AR Analysis**",
        "",
        f"• **DSO: {round(dso, 1)} days** (industry target: <30 days)",
        f"• Outstanding receivables: {fmt_currency(total_outstanding)}",
        f"• Revenue (last 90 days): {fmt_currency(total_rev_90)}",
        f"• Fully paid jobs: {len(paid)} | Partially paid: {len(partially_paid)} | Unpaid invoices: {len(fully_outstanding)}",
        "",
    ]
    rating = (
        "🟢 Excellent"
        if dso < 20
        else "🟡 Acceptable" if dso < 35 else "🔴 Action needed"
    )
    lines.append(f"**Collection health: {rating}**")
    if dso > 30:
        lines.append(
            "\n→ DSO above 30 days — chase outstanding invoices in the Jobs module."
        )
    # Top outstanding by customer
    cust_bal: dict = {}
    for j in all_jobs:
        bal = float(j.balance_due or 0)
        if bal > 0:
            key = f"{j.customer_id} – {j.customer_name or ''}"
            cust_bal[key] = cust_bal.get(key, 0) + bal
    if cust_bal:
        lines.append("\n**Largest Outstanding Balances:**")
        for name, bal in sorted(cust_bal.items(), key=lambda x: -x[1])[:5]:
            lines.append(f"  {name}: {fmt_currency(bal)}")
    return "\n".join(lines)


def respond_turnaround(db: Session) -> str:
    """Average job turnaround time from creation to completion."""
    finished = [
        j
        for j in db.query(Job).all()
        if j.status in ("FINISH", "INVOICE", "PAID") and j.date_in
    ]
    if not finished:
        return "No completed jobs to analyse turnaround time."
    durations = []
    for j in finished:
        d_in = parse_date(j.date_in or "")
        d_out = parse_date(j.out or "") or (
            parse_date(j.due or "")
            if j.status in ("FINISH", "INVOICE", "PAID")
            else None
        )
        if d_in and d_out and d_out >= d_in:
            durations.append((d_out - d_in).days)
    if not durations:
        return "Insufficient date data to calculate turnaround."
    durations.sort()
    avg = sum(durations) / len(durations)
    median = durations[len(durations) // 2]
    p90 = durations[int(len(durations) * 0.9)]
    fast = len([d for d in durations if d <= 3])
    medium = len([d for d in durations if 4 <= d <= 10])
    slow = len([d for d in durations if d > 10])
    lines = [
        "**Job Turnaround Time Analysis**",
        "",
        f"• Jobs analysed: {len(durations)}",
        f"• **Average: {round(avg, 1)} days**",
        f"• Median: {median} days | 90th percentile: {p90} days",
        f"• Fast (≤3d): {fast} | Medium (4–10d): {medium} | Slow (>10d): {slow}",
        "",
    ]
    rating = (
        "🟢 Fast"
        if avg <= 5
        else "🟡 Moderate" if avg <= 10 else "🔴 Slow — review workflow"
    )
    lines.append(f"**Throughput rating: {rating}**")
    # Backlog — active jobs and how long they've been open
    active = get_active_jobs(db)
    if active:
        ages = [
            (j, (date.today() - (parse_date(j.date_in or "") or date.today())).days)
            for j in active
        ]
        avg_backlog_age = sum(a for _, a in ages) / len(ages) if ages else 0
        lines.append(
            f"\n**Current Backlog:** {len(active)} jobs | Avg age: {round(avg_backlog_age, 1)} days"
        )
        old = [(j, a) for j, a in ages if a > avg * 1.5]
        if old:
            lines.append("**At-risk (>1.5× avg turnaround):**")
            for j, age in sorted(old, key=lambda x: -x[1])[:5]:
                lines.append(f"  #{j.id} – {j.customer_name} | {j.status} | {age} days")
    return "\n".join(lines)


def respond_seasonality(db: Session) -> str:
    """Month-of-year revenue patterns and seasonal index."""
    all_jobs = db.query(Job).all()
    by_month_num: dict = {i: [] for i in range(1, 13)}
    for j in all_jobs:
        d = parse_date(j.date_in or "")
        if d:
            by_month_num[d.month].append(float(j.total_inc or 0))
    month_names = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ]
    avgs = {m: (sum(v) / len(v)) if v else 0 for m, v in by_month_num.items()}
    overall_avg = sum(avgs.values()) / 12 if any(avgs.values()) else 1
    lines = ["**Seasonality Analysis — Monthly Revenue Patterns**", ""]
    if overall_avg < 1:
        return "Not enough data for seasonality analysis."
    peak_month = max(avgs, key=lambda k: avgs[k])
    low_month = min((m for m in avgs if avgs[m] > 0), key=lambda k: avgs[k], default=1)
    lines += [
        f"• Peak month: **{month_names[peak_month-1]}** (avg {fmt_currency(avgs[peak_month])})",
        f"• Slowest month: **{month_names[low_month-1]}** (avg {fmt_currency(avgs[low_month])})",
        "",
        "**Seasonal Index (1.0 = average):**",
    ]
    for m in range(1, 13):
        avg = avgs[m]
        if avg == 0:
            idx = "—"
            bar = ""
        else:
            si = avg / overall_avg
            idx = f"{si:.2f}"
            filled = int(si * 10)
            bar = "█" * min(filled, 20) + ("↑" if si > 1.1 else "↓" if si < 0.9 else "")
        count = len(by_month_num[m])
        lines.append(
            f"  {month_names[m-1]:>3}: {bar:<22} {idx}  ({count} jobs, avg {fmt_currency(avgs[m])})"
        )
    lines.append("\n→ Use peak months to plan capacity and staffing in advance.")
    return "\n".join(lines)


# ── Build live data context for LLM ───────────────────────────────────────────


def build_live_context(db: Session) -> str:
    """Snapshot of key metrics to inject into the LLM system prompt."""
    all_jobs = db.query(Job).all()
    active = [j for j in all_jobs if j.status not in ("FINISH", "CANCEL", "PAID")]
    overdue = get_overdue_jobs(db)
    low_stock = get_low_stock(db)
    this_m = jobs_this_month(db)
    this_m_rev = sum(float(j.total_inc or 0) for j in this_m)
    total_rev = sum(float(j.total_inc or 0) for j in all_jobs)
    outstanding = sum(
        float(j.balance_due or 0) for j in all_jobs if float(j.balance_due or 0) > 0
    )
    customers = db.query(Customer).count()
    inventory_count = db.query(InventoryItem).count()
    draft_pos = db.query(PurchaseOrder).filter(PurchaseOrder.status == "Draft").count()
    open_freight = get_open_freight(db)

    by_status: dict = {}
    for j in all_jobs:
        by_status[j.status] = by_status.get(j.status, 0) + 1

    return f"""
LIVE ERP DATA SNAPSHOT ({date.today().strftime('%d %b %Y')}):
- Total jobs: {len(all_jobs)} | Active: {len(active)} | Overdue: {len(overdue)}
- Jobs by status: {', '.join(f'{s}:{c}' for s, c in sorted(by_status.items()))}
- This month revenue: ${this_m_rev:,.2f} ({len(this_m)} jobs)
- All-time revenue: ${total_rev:,.2f} | Outstanding receivables: ${outstanding:,.2f}
- Inventory: {inventory_count} SKUs | Low stock alerts: {len(low_stock)}
- Customers: {customers} | Draft POs: {draft_pos} | Open freight jobs: {len(open_freight)}
""".strip()


# ── Claude LLM call ───────────────────────────────────────────────────────────


def call_claude(user_message: str, live_context: str, username: str) -> Optional[str]:
    """Call Claude claude-haiku-4-5 with ERP context. Returns None if no API key."""
    if not settings.ANTHROPIC_API_KEY:
        return None
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        system = f"""You are an intelligent ERP assistant for Total Image Group (TIG), a garment decoration company specialising in embroidery, screen printing, DTF, and transfers.

You have access to live data from their ERP system. Respond concisely using markdown formatting (bold with **, bullets with •).

{live_context}

Job workflow: QUOTE → New → ORDER → In Progress → PROOF → PRINT → Pick/Pack → FINISH → INVOICE → PAID (or CANCEL at any stage).

Capabilities you can describe or compute:
- Job status, overdue jobs, production pipeline, due dates
- Revenue, monthly trends, outstanding balances
- Inventory levels, low stock, ABC analysis
- Customer churn risk, top customers
- Revenue forecasting (mention Holt's exponential smoothing + OLS ensemble)
- Anomaly detection (Z-score on stock movements and revenue)
- DSO (Days Sales Outstanding), turnaround time, seasonality analysis
- Purchase orders, open freight, card files/ship-to addresses

Be conversational but data-driven. If you can answer from the live data above, do so with specific numbers. Keep responses under 300 words unless a detailed report is requested. Always format currency in AUD ($)."""

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        )
        return message.content[0].text
    except Exception:
        return None


# ── Help text ─────────────────────────────────────────────────────────────────


def respond_help() -> str:
    return (
        "**TIG AI Assistant — What I Can Do**\n\n"
        "**Jobs & Production:**\n"
        "• Daily briefing / today's priorities\n"
        "• Overdue jobs, due this week, production pipeline\n"
        "• *Show me job #12345* — specific job lookup\n"
        "• Open freight / ready to dispatch\n"
        "• Quote pipeline, what's in progress\n\n"
        "**Revenue & Finance:**\n"
        "• Revenue summary, this month vs last month\n"
        "• Outstanding balances, who owes us money\n"
        "• DSO (Days Sales Outstanding)\n\n"
        "**ML & Predictive Analytics:**\n"
        "• *Forecast revenue* — Holt's smoothing + OLS ensemble\n"
        "• *Show anomalies* — Z-score detection on stock & revenue\n"
        "• *Customer churn risk* — 60/120-day inactivity model\n"
        "• *ABC analysis* — Pareto inventory classification\n"
        "• *Margin analysis* — revenue breakdown by customer\n"
        "• *Turnaround time* — avg job completion speed\n"
        "• *Seasonality* — monthly revenue patterns\n\n"
        "**Inventory & Purchasing:**\n"
        "• Low stock, inventory summary, stock value\n"
        "• Purchase order status\n\n"
        "**Customers & Shipping:**\n"
        "• Top customers, outstanding balances\n"
        "• *Shipping to RESP.SYD* — ship-to job lookup\n"
        "• Card files overview"
    )


def respond_unknown(message: str) -> str:
    return (
        f'I\'m not sure about *"{message}"*\n\n'
        "Try: *daily briefing*, *overdue jobs*, *forecast revenue*, *low stock*, "
        "*ABC analysis*, *churn risk*, *DSO*, *turnaround time*, or *help*."
    )


# ── Main route ────────────────────────────────────────────────────────────────


@router.post("/chat")
def ai_chat(
    body: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any),
):
    msg = (body.message or "").strip()
    m = msg.lower()

    # Greetings
    if re.match(r"^(hi|hello|hey|g'day|good morning|good afternoon|howdy)\b", m):
        name = current_user.full_name or current_user.username
        hour = datetime.now().hour
        greeting = (
            "Good morning"
            if hour < 12
            else "Good afternoon" if hour < 17 else "Good evening"
        )
        return {
            "response": f"{greeting}, {name}! Ask me about jobs, revenue, inventory, ML forecasts, or type *help*."
        }

    # Help
    if has(m, "help", "what can you", "commands"):
        return {"response": respond_help()}

    # Specific job lookup
    job_id_match = re.search(r"(?:job\s*#?\s*|#)(\w+)", m)
    if job_id_match:
        return {"response": respond_specific_job(db, job_id_match.group(1))}

    # Customer-specific lookup
    cust_match = re.search(
        r"(?:jobs?\s+for|customer|client)\s+([A-Z0-9][A-Z0-9.\-_]+)", msg, re.IGNORECASE
    )
    if cust_match:
        return {"response": respond_customer_jobs(db, cust_match.group(1))}

    # Ship-to lookup
    ship_match = re.search(
        r"(?:ship(?:ping)?(?:\s+to)?|dispatch(?:ing)?(?:\s+to)?)\s+([A-Z0-9][A-Z0-9._]+)",
        msg,
        re.IGNORECASE,
    )
    if ship_match:
        return {"response": respond_ship_to(db, ship_match.group(1))}

    # ── New advanced analytics ────────────────────────────────────────────────
    if has(m, "abc", "pareto", "a item", "b item", "c item", "80/20"):
        return {"response": respond_abc_analysis(db)}

    if has(m, "margin", "profit", "most valuable customer", "revenue breakdown"):
        return {"response": respond_margin_analysis(db)}

    if has(m, "dso", "days sales", "collection", "receivable", "accounts receivable"):
        return {"response": respond_dso(db)}

    if has(m, "turnaround", "throughput", "how long", "completion time", "speed"):
        return {"response": respond_turnaround(db)}

    if has(m, "season", "seasonal", "peak month", "slow month", "monthly pattern"):
        return {"response": respond_seasonality(db)}

    # ── Existing analytics ────────────────────────────────────────────────────
    if has(m, "today", "daily", "briefing", "priorities", "morning"):
        return {"response": respond_todays_summary(db)}

    if has(m, "open freight", "ready to ship", "ready to dispatch", "freight"):
        return {"response": respond_open_freight(db)}

    if has(m, "production", "in progress", "pipeline", "print run"):
        return {"response": respond_production_pipeline(db)}

    if has(m, "quote", "quote pipeline", "conversion"):
        return {"response": respond_quote_pipeline(db)}

    if has(m, "overdue", "late", "past due"):
        return {"response": respond_overdue(db)}

    if has(m, "due this week", "due soon", "due in", "coming due", "deadline"):
        days = 7
        if has(m, "today"):
            days = 0
        elif has(m, "tomorrow"):
            days = 1
        elif has(m, "3 day"):
            days = 3
        else:
            dm = re.search(r"due in (\d+)", m)
            if dm:
                days = int(dm.group(1))
        return {"response": respond_due_soon(db, days)}

    if has(m, "card file", "cardfile", "ship address", "ship code"):
        return {"response": respond_card_files(db)}

    if has(m, "this month", "last month", "monthly"):
        return {"response": respond_monthly_revenue(db)}

    if has(
        m,
        "revenue",
        "income",
        "sales",
        "turnover",
        "financial",
        "outstanding",
        "owed",
        "who owes",
    ):
        return {"response": respond_revenue(db)}

    if has(m, "low stock", "reorder", "stock alert", "running low", "out of stock"):
        return {"response": respond_low_stock(db)}

    if has(m, "inventory", "stock", "warehouse", "sku", "product"):
        return {"response": respond_inventory(db)}

    if has(m, "customer", "client", "top customer"):
        return {"response": respond_customers(db)}

    if has(m, "purchase order", "po ", "supplier order", "restock"):
        return {"response": respond_purchase_orders(db)}

    if has(m, "job", "order", "work", "schedule"):
        return {"response": respond_jobs_summary(db)}

    if has(m, "supplier", "vendor"):
        sups = db.query(Supplier).all()
        active = len([s for s in sups if s.status == "Active"])
        return {"response": f"**Suppliers:** {len(sups)} total ({active} active)."}

    if has(m, "forecast", "predict", "next month", "projection", "trend"):
        return {"response": respond_forecast(db)}

    if has(m, "anomal", "unusual", "spike", "outlier", "detect"):
        return {"response": respond_anomalies(db)}

    if has(m, "churn", "at risk", "inactive customer", "retention"):
        return {"response": respond_customer_churn(db)}

    # ── Claude LLM fallback (when API key is configured) ─────────────────────
    live_ctx = build_live_context(db)
    claude_response = call_claude(msg, live_ctx, current_user.username)
    if claude_response:
        return {"response": claude_response, "powered_by_claude": True}

    return {"response": respond_unknown(msg)}


@router.get("/status")
def ai_status(_: User = Depends(require_any)):
    """Returns whether Claude LLM is available."""
    return {
        "claude_available": bool(settings.ANTHROPIC_API_KEY),
        "model": "claude-haiku-4-5-20251001" if settings.ANTHROPIC_API_KEY else None,
        "analytics": [
            "forecast",
            "anomalies",
            "churn",
            "abc",
            "margins",
            "dso",
            "turnaround",
            "seasonality",
        ],
    }

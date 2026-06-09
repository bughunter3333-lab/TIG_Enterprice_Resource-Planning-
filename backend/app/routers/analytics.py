from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any
import re

from app.database import get_db
from app.core.dependencies import require_any
from app.models.user import User
from app.models.job import Job
from app.models.inventory import InventoryItem, StockMovement
from app.models.customer import Customer
from app.models.supplier import Supplier
from app.models.purchase_order import PurchaseOrder

router = APIRouter(prefix="/analytics", tags=["analytics"])

# ── Math & Statistical Helpers ──────────────────────────────────────────────────

def parse_date(s: str) -> Optional[date]:
    if not s:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s.strip().split(" ")[0], fmt).date()
        except ValueError:
            continue
    return None

def _linear_regression(xs: list, ys: list) -> tuple:
    n = len(xs)
    if n < 2:
        return 0.0, (ys[0] if ys else 0.0), 0.0
    sx = sum(xs); sy = sum(ys)
    sxx = sum(x * x for x in xs); sxy = sum(x * y for x, y in zip(xs, ys))
    denom = n * sxx - sx ** 2
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
    if not ys:
        return []
    smoothed = [ys[0]]
    for y in ys[1:]:
        smoothed.append(alpha * y + (1 - alpha) * smoothed[-1])
    return smoothed

def _holt_forecast(ys: list, alpha: float = 0.4, beta: float = 0.3, steps: int = 1) -> tuple:
    if len(ys) < 3:
        return ys[-1] if ys else 0.0, 0.0, 0.0
    level = ys[0]
    trend = ys[1] - ys[0]
    for y in ys[1:]:
        prev_l = level
        level = alpha * y + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_l) + (1 - beta) * trend
    forecast = level + steps * trend
    
    mean_y = sum(ys) / len(ys)
    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    smoothed = _exponential_smoothing(ys, alpha)
    ss_res = sum((y - s) ** 2 for y, s in zip(ys, smoothed))
    r2 = max(0.0, min(1.0, 1 - ss_res / ss_tot)) if ss_tot > 0 else 0.0
    return max(0.0, forecast), trend, r2

def _zscore_anomalies(values: list) -> list[tuple[int, float]]:
    if len(values) < 4:
        return []
    mean = sum(values) / len(values)
    std = (sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5
    if std < 0.01:
        return []
    return [(i, (v - mean) / std) for i, v in enumerate(values) if abs((v - mean) / std) > 2.0]

def get_active_jobs(db: Session) -> list:
    return db.query(Job).filter(Job.status.notin_(["FINISH", "CANCEL", "PAID"])).all()

def get_overdue_jobs(db: Session) -> list:
    return [j for j in get_active_jobs(db)
            if (d := parse_date(j.due or "")) and d < date.today()]

def get_low_stock(db: Session) -> list:
    return db.query(InventoryItem).filter(
        InventoryItem.stock <= InventoryItem.min_stock,
        InventoryItem.min_stock > 0,
        InventoryItem.status == "Active"
    ).all()

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/overview")
def get_overview(db: Session = Depends(get_db), _: User = Depends(require_any)):
    """Summary metrics overview of operations."""
    active_jobs = get_active_jobs(db)
    overdue_jobs = get_overdue_jobs(db)
    low_stock = get_low_stock(db)
    
    # Calculate Total Outstanding Receivables
    outstanding = sum(float(j.balance_due or 0) for j in db.query(Job).filter(Job.balance_due > 0).all())
    
    # Calculate Stagnant active jobs (open > 30 days)
    today = date.today()
    stagnant_count = len([
        j for j in active_jobs
        if (d := parse_date(j.date_in or "")) and (today - d).days > 30
    ])

    # Count draft POs
    draft_pos = db.query(PurchaseOrder).filter(PurchaseOrder.status == "Draft").count()
    
    # Customer churn risk count (>120d inactive)
    customers = db.query(Customer).filter(Customer.status == "Active").all()
    all_jobs = db.query(Job).all()
    last_order = {}
    for j in all_jobs:
        d = parse_date(j.date_in or "")
        if d and j.customer_id:
            if j.customer_id not in last_order or d > last_order[j.customer_id]:
                last_order[j.customer_id] = d
    high_risk_churn_count = 0
    for c in customers:
        last = last_order.get(c.id)
        if last and (today - last).days > 120:
            high_risk_churn_count += 1
            
    return {
        "active_jobs_count": len(active_jobs),
        "overdue_jobs_count": len(overdue_jobs),
        "low_stock_count": len(low_stock),
        "outstanding_receivables": round(outstanding, 2),
        "stagnant_jobs_count": stagnant_count,
        "draft_pos_count": draft_pos,
        "high_risk_churn_count": high_risk_churn_count,
    }

@router.get("/forecast")
def get_forecast(db: Session = Depends(get_db), _: User = Depends(require_any)):
    """Revenue forecasting analysis using Holt-Winters EWMA and OLS ensemble."""
    all_jobs = db.query(Job).all()
    monthly = {}
    for j in all_jobs:
        d = parse_date(j.date_in or "")
        if d:
            key = (d.year, d.month)
            monthly[key] = monthly.get(key, 0) + float(j.total_inc or 0)
            
    if len(monthly) < 3:
        return {
            "error": "Insufficient data (need at least 3 months) to calculate forecast.",
            "recent_months": []
        }
        
    sorted_months = sorted(monthly.keys())
    ys = [monthly[k] for k in sorted_months]
    xs = list(range(len(ys)))
    
    holt_pred, holt_trend, holt_r2 = _holt_forecast(ys, alpha=0.4, beta=0.3, steps=1)
    m_ols, b_ols, r2_ols = _linear_regression(xs, ys)
    ols_pred = max(0.0, m_ols * len(ys) + b_ols)
    ensemble = 0.6 * holt_pred + 0.4 * ols_pred
    
    today = date.today()
    next_month_dt = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
    forecast_month = next_month_dt.strftime("%B %Y")
    
    confidence = "High" if holt_r2 > 0.7 else "Moderate" if holt_r2 > 0.4 else "Low"
    trend_dir = "upward" if holt_trend > 50 else "downward" if holt_trend < -50 else "flat"
    avg_3 = sum(ys[-3:]) / 3
    
    recent_months_list = []
    ewma_values = _exponential_smoothing(ys, 0.3)
    for idx, (yr, mo) in enumerate(sorted_months):
        m_dt = date(yr, mo, 1)
        recent_months_list.append({
            "month_key": f"{yr}-{mo:02d}",
            "month_label": m_dt.strftime("%b %Y"),
            "revenue": round(monthly[(yr, mo)], 2),
            "ewma": round(ewma_values[idx], 2)
        })
        
    return {
        "trend_direction": trend_dir,
        "trend_slope": round(holt_trend, 2),
        "avg_3_months": round(avg_3, 2),
        "holt_prediction": round(holt_pred, 2),
        "ols_prediction": round(ols_pred, 2),
        "ensemble_forecast": round(ensemble, 2),
        "model_fit_r2": round(holt_r2, 4),
        "confidence": confidence,
        "forecast_month": forecast_month,
        "recent_months": recent_months_list
    }

@router.get("/dso")
def get_dso(db: Session = Depends(get_db), _: User = Depends(require_any)):
    """Days Sales Outstanding (DSO) collection efficiency and accounts receivable."""
    all_jobs = db.query(Job).all()
    invoiced_jobs = [j for j in all_jobs if j.status in ("INVOICE", "PAID") and j.date_in]
    
    total_outstanding = sum(float(j.balance_due or 0) for j in all_jobs if float(j.balance_due or 0) > 0)
    
    # Revenue in the last 90 days
    today = date.today()
    total_rev_90 = sum(
        float(j.total_inc or 0) for j in all_jobs
        if (d := parse_date(j.date_in or "")) and (today - d).days <= 90
    )
    
    dso = (total_outstanding / total_rev_90 * 90) if total_rev_90 > 0 else 0
    
    paid_count = len([j for j in all_jobs if j.status == "PAID"])
    partially_paid_count = len([j for j in all_jobs if float(j.deposit or 0) > 0 and float(j.balance_due or 0) > 0])
    unpaid_count = len([j for j in invoiced_jobs if float(j.deposit or 0) == 0])
    
    rating = "Excellent" if dso < 20 else "Acceptable" if dso < 35 else "Action needed"
    
    # Top outstanding customer balances
    cust_bal = {}
    for j in all_jobs:
        bal = float(j.balance_due or 0)
        if bal > 0:
            key = (j.customer_id or "UNKNOWN", j.customer_name or "Unknown")
            cust_bal[key] = cust_bal.get(key, 0.0) + bal
            
    top_receivables = []
    for (cid, cname), bal in sorted(cust_bal.items(), key=lambda x: -x[1])[:10]:
        top_receivables.append({
            "customer_id": cid,
            "customer_name": cname,
            "balance_due": round(bal, 2)
        })
        
    return {
        "dso_days": round(dso, 1),
        "total_outstanding": round(total_outstanding, 2),
        "revenue_last_90_days": round(total_rev_90, 2),
        "paid_jobs_count": paid_count,
        "partially_paid_jobs_count": partially_paid_count,
        "unpaid_invoices_count": unpaid_count,
        "collection_health_rating": rating,
        "top_receivables": top_receivables
    }

@router.get("/abc")
def get_abc_analysis(db: Session = Depends(get_db), _: User = Depends(require_any)):
    """ABC classification of inventory by stock value (Pareto 80/20 rule)."""
    items = db.query(InventoryItem).filter(InventoryItem.status == "Active", InventoryItem.stock > 0).all()
    if not items:
        return {
            "a_items": [], "b_items": [], "c_items": [],
            "summary": {"total_skus": 0, "total_value": 0.0}
        }
        
    valued = [(i, int(i.stock or 0) * float(i.unit_cost or 0)) for i in items]
    valued.sort(key=lambda x: -x[1])
    total_value = sum(v for _, v in valued)
    
    cumulative = 0.0
    a_items, b_items, c_items = [], [], []
    for item, val in valued:
        cumulative += val
        cum_pct = cumulative / total_value if total_value else 0.0
        item_data = {
            "sku": item.sku,
            "name": item.name,
            "stock": item.stock,
            "unit_cost": float(item.unit_cost or 0),
            "stock_value": round(val, 2)
        }
        if cum_pct <= 0.80:
            a_items.append(item_data)
        elif cum_pct <= 0.95:
            b_items.append(item_data)
        else:
            c_items.append(item_data)
            
    return {
        "summary": {
            "total_skus": len(items),
            "total_value": round(total_value, 2),
            "a_skus_count": len(a_items),
            "a_skus_percentage": round(len(a_items) / len(items) * 100, 1) if items else 0,
            "a_value": round(sum(i["stock_value"] for i in a_items), 2),
            "b_skus_count": len(b_items),
            "b_skus_percentage": round(len(b_items) / len(items) * 100, 1) if items else 0,
            "b_value": round(sum(i["stock_value"] for i in b_items), 2),
            "c_skus_count": len(c_items),
            "c_skus_percentage": round(len(c_items) / len(items) * 100, 1) if items else 0,
            "c_value": round(sum(i["stock_value"] for i in c_items), 2),
        },
        "top_a_items": a_items[:15]
    }

@router.get("/churn")
def get_churn_risk(db: Session = Depends(get_db), _: User = Depends(require_any)):
    """Customer Churn Risk Analysis based on order recency."""
    customers = db.query(Customer).filter(Customer.status == "Active").all()
    all_jobs = db.query(Job).all()
    
    last_order = {}
    total_spend = {}
    order_counts = {}
    for j in all_jobs:
        d = parse_date(j.date_in or "")
        if d and j.customer_id:
            if j.customer_id not in last_order or d > last_order[j.customer_id]:
                last_order[j.customer_id] = d
            order_counts[j.customer_id] = order_counts.get(j.customer_id, 0) + 1
            total_spend[j.customer_id] = total_spend.get(j.customer_id, 0.0) + float(j.total_inc or 0)
            
    today = date.today()
    high_risk, at_risk, never = [], [], []
    for c in customers:
        last = last_order.get(c.id)
        c_data = {
            "customer_id": c.id,
            "customer_name": c.name,
            "last_order_date": str(last) if last else None,
            "days_inactive": (today - last).days if last else 9999,
            "ltv_spend": round(total_spend.get(c.id, 0.0), 2),
            "order_count": order_counts.get(c.id, 0)
        }
        if not last:
            never.append(c_data)
        else:
            if c_data["days_inactive"] > 120:
                high_risk.append(c_data)
            elif c_data["days_inactive"] > 60:
                at_risk.append(c_data)
                
    # Sort lists
    high_risk.sort(key=lambda x: -x["days_inactive"])
    at_risk.sort(key=lambda x: -x["days_inactive"])
    never.sort(key=lambda x: x["customer_name"])
    
    return {
        "summary": {
            "total_active_customers": len(customers),
            "high_risk_count": len(high_risk),
            "at_risk_count": len(at_risk),
            "never_ordered_count": len(never)
        },
        "high_risk_customers": high_risk[:20],
        "at_risk_customers": at_risk[:20],
        "never_ordered_customers": never[:20]
    }

@router.get("/margins")
def get_margins(db: Session = Depends(get_db), _: User = Depends(require_any)):
    """Overall margin analysis and order value distribution."""
    all_jobs = db.query(Job).all()
    if not all_jobs:
        return {"summary": {}, "customer_shares": [], "price_distribution": {}}
        
    total_rev_inc = sum(float(j.total_inc or 0) for j in all_jobs)
    total_gst = sum(float(j.tax or 0) for j in all_jobs if j.status != "CANCEL")
    total_ex = sum(float(j.total_ex or 0) for j in all_jobs if j.status != "CANCEL")
    
    # Margin by customer
    cust_rev = {}
    cust_ex = {}
    cust_count = {}
    for j in all_jobs:
        if j.customer_id and j.status != "CANCEL":
            inc = float(j.total_inc or 0)
            ex = float(j.total_ex or 0)
            cust_rev[j.customer_id] = cust_rev.get(j.customer_id, 0.0) + inc
            cust_ex[j.customer_id] = cust_ex.get(j.customer_id, 0.0) + ex
            cust_count[j.customer_id] = cust_count.get(j.customer_id, 0) + 1
            
    customer_shares = []
    for cid, rev in sorted(cust_rev.items(), key=lambda x: -x[1]):
        customer = db.query(Customer).filter(Customer.id == cid).first()
        cname = customer.name if customer else "Unknown Customer"
        count = cust_count[cid]
        customer_shares.append({
            "customer_id": cid,
            "customer_name": cname,
            "revenue": round(rev, 2),
            "jobs_count": count,
            "avg_job_value": round(rev / count, 2) if count else 0,
            "revenue_share_percentage": round(rev / total_rev_inc * 100, 1) if total_rev_inc else 0
        })
        
    vals = [float(j.total_inc or 0) for j in all_jobs if float(j.total_inc or 0) > 0]
    vals.sort()
    
    median_val = vals[len(vals) // 2] if vals else 0.0
    min_val = vals[0] if vals else 0.0
    max_val = vals[-1] if vals else 0.0
    
    small_count = len([v for v in vals if v < 500])
    medium_count = len([v for v in vals if 500 <= v < 2000])
    large_count = len([v for v in vals if v >= 2000])
    
    return {
        "summary": {
            "total_billed_inc": round(total_rev_inc, 2),
            "total_ex_gst": round(total_ex, 2),
            "total_gst_collected": round(total_gst, 2),
            "avg_job_value": round(total_rev_inc / len(all_jobs) if all_jobs else 0, 2),
            "median_job_value": round(median_val, 2),
            "min_job_value": round(min_val, 2),
            "max_job_value": round(max_val, 2)
        },
        "price_distribution": [
            {"bracket": "< $500", "count": small_count},
            {"bracket": "$500 - $2,000", "count": medium_count},
            {"bracket": ">= $2,000", "count": large_count}
        ],
        "top_customers": customer_shares[:15]
    }

@router.get("/turnaround")
def get_turnaround(db: Session = Depends(get_db), _: User = Depends(require_any)):
    """Throughput analytics and job turnaround times."""
    finished = [j for j in db.query(Job).all()
                if j.status in ("FINISH", "INVOICE", "PAID") and j.date_in]
    if not finished:
        return {"error": "No completed jobs to analyze turnaround time."}
        
    durations = []
    for j in finished:
        d_in = parse_date(j.date_in or "")
        d_out = parse_date(j.out or "") or (parse_date(j.due or "") if j.status in ("FINISH", "INVOICE", "PAID") else None)
        if d_in and d_out and d_out >= d_in:
            durations.append((d_out - d_in).days)
            
    if not durations:
        return {"error": "Insufficient date data to calculate turnaround."}
        
    durations.sort()
    avg_days = sum(durations) / len(durations)
    median_days = durations[len(durations) // 2]
    p90_days = durations[int(len(durations) * 0.9)]
    
    fast_count = len([d for d in durations if d <= 3])
    medium_count = len([d for d in durations if 4 <= d <= 10])
    slow_count = len([d for d in durations if d > 10])
    
    rating = "Fast" if avg_days <= 5 else "Moderate" if avg_days <= 10 else "Slow"
    
    active = get_active_jobs(db)
    today = date.today()
    ages = []
    at_risk_jobs = []
    
    for j in active:
        d_in = parse_date(j.date_in or "")
        if d_in:
            age = (today - d_in).days
            ages.append(age)
            if age > avg_days * 1.5:
                at_risk_jobs.append({
                    "job_id": j.id,
                    "customer_name": j.customer_name or "Unknown",
                    "status": j.status,
                    "days_open": age,
                    "threshold_days": round(avg_days * 1.5, 1)
                })
                
    avg_backlog_age = sum(ages) / len(ages) if ages else 0
    at_risk_jobs.sort(key=lambda x: -x["days_open"])
    
    return {
        "completed_jobs_analysed": len(durations),
        "average_turnaround_days": round(avg_days, 1),
        "median_turnaround_days": median_days,
        "p90_turnaround_days": p90_days,
        "throughput_rating": rating,
        "speed_breakdown": [
            {"category": "Fast (≤3 days)", "count": fast_count},
            {"category": "Medium (4-10 days)", "count": medium_count},
            {"category": "Slow (>10 days)", "count": slow_count}
        ],
        "backlog": {
            "active_backlog_count": len(active),
            "average_backlog_age_days": round(avg_backlog_age, 1),
            "at_risk_count": len(at_risk_jobs),
            "at_risk_jobs": at_risk_jobs[:15]
        }
    }

@router.get("/seasonality")
def get_seasonality(db: Session = Depends(get_db), _: User = Depends(require_any)):
    """Month-of-year seasonal revenue patterns and indexes."""
    all_jobs = db.query(Job).all()
    by_month_num = {i: [] for i in range(1, 13)}
    for j in all_jobs:
        d = parse_date(j.date_in or "")
        if d:
            by_month_num[d.month].append(float(j.total_inc or 0))
            
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    avgs = {m: (sum(v) / len(v)) if v else 0.0 for m, v in by_month_num.items()}
    overall_avg = sum(avgs.values()) / 12 if any(avgs.values()) else 1.0
    
    if overall_avg == 0:
        overall_avg = 1.0
        
    monthly_patterns = []
    for m in range(1, 13):
        avg = avgs[m]
        si = avg / overall_avg
        monthly_patterns.append({
            "month_num": m,
            "month_name": month_names[m-1],
            "average_revenue": round(avg, 2),
            "seasonal_index": round(si, 2),
            "jobs_count": len(by_month_num[m])
        })
        
    peak_month_idx = max(avgs, key=lambda k: avgs[k])
    slow_month_idx = min((m for m in avgs if avgs[m] > 0), key=lambda k: avgs[k], default=1)
    
    return {
        "overall_average_revenue": round(overall_avg, 2),
        "peak_month": month_names[peak_month_idx-1],
        "peak_month_avg": round(avgs[peak_month_idx], 2),
        "slowest_month": month_names[slow_month_idx-1],
        "slowest_month_avg": round(avgs[slow_month_idx], 2),
        "monthly_patterns": monthly_patterns
    }

@router.get("/anomalies")
def get_anomalies(db: Session = Depends(get_db), _: User = Depends(require_any)):
    """Z-Score anomaly detection on stock movements, revenue spikes, and stuck jobs."""
    items = db.query(InventoryItem).filter(InventoryItem.status == "Active").all()
    movements = db.query(StockMovement).all()
    
    # Stock anomalies by SKU deltas
    sku_deltas = {}
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
            stock_anomalies.append({
                "sku": item.sku,
                "name": item.name,
                "z_score": round(z, 2),
                "recent_outflow": round(recent),
                "avg_outflow": round(mean),
                "description": f"Consumption spike detected. Last outflow: {round(recent)} pcs (historical average: {round(mean)} pcs)."
            })
            
    # Monthly revenue anomalies
    all_jobs = db.query(Job).all()
    monthly = {}
    for j in all_jobs:
        d = parse_date(j.date_in or "")
        if d:
            key = d.strftime("%b %Y")
            monthly[key] = monthly.get(key, 0.0) + float(j.total_inc or 0)
            
    sorted_months = sorted(monthly.keys())
    sorted_revs = [monthly[k] for k in sorted_months]
    
    rev_anomalies_raw = _zscore_anomalies(sorted_revs)
    revenue_anomalies = []
    for idx, z in rev_anomalies_raw:
        month = sorted_months[idx]
        revenue_anomalies.append({
            "month": month,
            "revenue": round(sorted_revs[idx], 2),
            "z_score": round(z, 2),
            "type": "spike" if z > 0 else "dip",
            "description": f"Revenue anomaly: {month} billed {round(sorted_revs[idx], 2)} (z-score: {round(z, 2)}σ)."
        })
        
    # Stuck/stagnant jobs (>30 days open)
    active_jobs = get_active_jobs(db)
    today = date.today()
    stagnant_jobs = []
    for j in active_jobs:
        d = parse_date(j.date_in or "")
        if d:
            age = (today - d).days
            if age > 30:
                stagnant_jobs.append({
                    "job_id": j.id,
                    "customer_name": j.customer_name or "Unknown Customer",
                    "status": j.status,
                    "days_open": age,
                    "date_in": j.date_in
                })
    stagnant_jobs.sort(key=lambda x: -x["days_open"])
    
    return {
        "stock_consumption_anomalies": stock_anomalies,
        "revenue_anomalies": revenue_anomalies,
        "stagnant_jobs": stagnant_jobs
    }

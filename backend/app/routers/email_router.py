import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional
from app.database import get_db, SessionLocal
from app.models.job import Job
from app.models.settings import CompanySettings, EmailLog
from app.core.dependencies import require_any, require_staff, get_current_user
from app.core.config import settings as app_settings
from app.core.encryption import decrypt_value
from app.models.user import User

router = APIRouter(prefix="/email", tags=["email"])


class SendEmailRequest(BaseModel):
    job_id: str
    to_email: str
    cc: Optional[str] = None
    subject: Optional[str] = None
    message: Optional[str] = None
    email_type: str = "invoice"   # invoice / quote / reminder


def _get_settings(db: Session) -> CompanySettings:
    s = db.query(CompanySettings).first()
    return s or CompanySettings()


def _build_email_body(job: Job, settings: CompanySettings, email_type: str, custom_message: str = "") -> str:
    items_html = ""
    for it in (job.items or []):
        if it.display_type != "product":
            continue
        items_html += (
            f"<tr>"
            f"<td style='padding:4px 8px;border-bottom:1px solid #eee'>{it.description or ''}</td>"
            f"<td style='padding:4px 8px;border-bottom:1px solid #eee;text-align:center'>{it.order_qty or 0}</td>"
            f"<td style='padding:4px 8px;border-bottom:1px solid #eee;text-align:right'>${float(it.price_ex or 0):.2f}</td>"
            f"<td style='padding:4px 8px;border-bottom:1px solid #eee;text-align:right'>${float(it.total or 0):.2f}</td>"
            f"</tr>"
        )

    company = settings.company_name or "Total Image Group"
    abn = settings.abn or ""
    bank_details = ""
    if settings.bank_name:
        bank_details = f"""
        <div style='background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px;padding:12px;margin-top:16px'>
          <strong>Payment Details</strong><br>
          Bank: {settings.bank_name or ""}<br>
          BSB: {settings.bank_bsb or ""} &nbsp; Account: {settings.bank_account or ""}<br>
          Account Name: {settings.bank_account_name or ""}
        </div>"""

    abn_header = f'<div style="font-size:12px;opacity:0.8">ABN: {abn}</div>' if abn else ''
    invoice_row = (
        f'<tr><td style="color:#666">Invoice #:</td><td>{job.invoice or ""}</td></tr>'
        if job.invoice else ''
    )
    due_row = (
        f'<tr><td style="color:#666">Due:</td><td>{job.due or ""}</td></tr>'
        if job.due else ''
    )
    custom_msg_html = (
        f'<p style="background:#f0f7ff;border-left:4px solid #1e3a5f;padding:12px;margin:16px 0">{custom_message}</p>'
        if custom_message else ''
    )
    balance_row = ""
    if float(job.balance_due or 0) > 0:
        balance_row = (
            f'<tr style="color:#cc0000">'
            f'<td style="padding:2px 8px">Balance Due:</td>'
            f'<td style="padding:2px 8px;text-align:right">${float(job.balance_due or 0):.2f}</td>'
            f'</tr>'
        )
    heading = "Tax Invoice" if email_type == "invoice" else "Quote"
    phone_part = f' &nbsp;|&nbsp; {settings.phone}' if settings.phone else ''
    email_part = f' &nbsp;|&nbsp; {settings.email}' if settings.email else ''
    abn_footer = f' &nbsp;|&nbsp; ABN: {abn}' if abn else ''

    return f"""
<html><body style='font-family:Arial,sans-serif;color:#333;max-width:700px;margin:auto;padding:20px'>
  <div style='background:#1e3a5f;color:white;padding:20px;border-radius:8px 8px 0 0'>
    <h2 style='margin:0'>{company}</h2>
    {abn_header}
  </div>
  <div style='border:1px solid #e0e0e0;border-top:0;padding:24px;border-radius:0 0 8px 8px'>
    <h3 style='color:#1e3a5f;margin-top:0'>{heading} &mdash; Job #{job.id}</h3>
    <table style='width:100%;border-collapse:collapse;margin-bottom:8px'>
      <tr><td style='color:#666;width:120px'>Customer:</td><td><strong>{job.customer_name or ""}</strong></td></tr>
      {invoice_row}
      <tr><td style='color:#666'>Date:</td><td>{job.date_in or ""}</td></tr>
      {due_row}
    </table>
    {custom_msg_html}
    <table style='width:100%;border-collapse:collapse;margin-top:16px'>
      <thead><tr style='background:#f5f5f5'>
        <th style='padding:8px;text-align:left'>Description</th>
        <th style='padding:8px;text-align:center'>Qty</th>
        <th style='padding:8px;text-align:right'>Unit (ex GST)</th>
        <th style='padding:8px;text-align:right'>Total</th>
      </tr></thead>
      <tbody>{items_html}</tbody>
    </table>
    <div style='text-align:right;margin-top:12px;border-top:2px solid #1e3a5f;padding-top:12px'>
      <table style='margin-left:auto'>
        <tr><td style='padding:2px 8px;color:#666'>Subtotal (ex GST):</td><td style='padding:2px 8px;text-align:right'>${float(job.total_ex or 0):.2f}</td></tr>
        <tr><td style='padding:2px 8px;color:#666'>GST (10%):</td><td style='padding:2px 8px;text-align:right'>${float(job.tax or 0):.2f}</td></tr>
        <tr style='font-weight:bold;font-size:16px'><td style='padding:4px 8px'>TOTAL:</td><td style='padding:4px 8px;text-align:right;color:#1e3a5f'>${float(job.total_inc or 0):.2f}</td></tr>
        {balance_row}
      </table>
    </div>
    {bank_details}
    <div style='margin-top:24px;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:12px'>
      {company}{abn_footer}{phone_part}{email_part}
    </div>
  </div>
</body></html>"""


def _send_email_background(
    smtp_config: dict,
    recipients: list,
    msg_string: str,
    log_data: dict,
):
    """Runs off the request thread — opens its own DB session."""
    db = SessionLocal()
    status = "sent"
    error_text = None
    try:
        if smtp_config["use_tls"]:
            server = smtplib.SMTP(smtp_config["host"], smtp_config["port"], timeout=15)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(smtp_config["host"], smtp_config["port"], timeout=15)
        server.login(smtp_config["user"], smtp_config["password"])
        server.sendmail(smtp_config["user"], recipients, msg_string)
        server.quit()
    except Exception as e:
        status = "failed"
        error_text = str(e)
    finally:
        log = EmailLog(
            sent_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            to_email=log_data["to_email"],
            subject=log_data["subject"],
            job_id=log_data["job_id"],
            email_type=log_data["email_type"],
            status=status,
            error=error_text,
            sent_by=log_data["sent_by"],
        )
        db.add(log)
        db.commit()
        db.close()


@router.post("/send", status_code=202)
def send_email(
    body: SendEmailRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    settings = _get_settings(db)
    if not settings.smtp_host:
        raise HTTPException(status_code=400, detail="SMTP not configured. Set SMTP settings in Company Settings.")

    job = db.query(Job).options(joinedload(Job.items)).filter(Job.id == body.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    subject = body.subject or (
        f"Tax Invoice #{job.invoice or job.id} — {settings.company_name or 'TIG'}"
        if body.email_type == "invoice"
        else f"Quote #{job.id} — {settings.company_name or 'TIG'}"
    )
    html_body = _build_email_body(job, settings, body.email_type, body.message or "")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name or settings.company_name or 'TIG'} <{settings.smtp_user}>"
    msg["To"] = body.to_email
    if body.cc:
        msg["Cc"] = body.cc
    msg.attach(MIMEText(html_body, "html"))

    recipients = [body.to_email] + ([body.cc] if body.cc else [])

    # Decrypt SMTP password in memory; fall back to raw value for legacy plaintext rows
    smtp_password = None
    if settings.smtp_password:
        try:
            smtp_password = decrypt_value(settings.smtp_password, app_settings.SECRET_KEY)
        except ValueError:
            smtp_password = settings.smtp_password

    background_tasks.add_task(
        _send_email_background,
        smtp_config={
            "host": settings.smtp_host,
            "port": settings.smtp_port or 587,
            "user": settings.smtp_user,
            "password": smtp_password,
            "use_tls": settings.smtp_use_tls,
        },
        recipients=recipients,
        msg_string=msg.as_string(),
        log_data={
            "to_email": body.to_email,
            "subject": subject,
            "job_id": body.job_id,
            "email_type": body.email_type,
            "sent_by": current_user.username,
        },
    )

    return {"ok": True, "message": f"Email queued for {body.to_email}"}


@router.get("/log")
def email_log(
    limit: int = Query(50),
    job_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    q = db.query(EmailLog)
    if job_id:
        q = q.filter(EmailLog.job_id == job_id)
    return q.order_by(EmailLog.id.desc()).limit(limit).all()

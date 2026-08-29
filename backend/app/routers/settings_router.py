import smtplib
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.settings import CompanySettings
from app.core.dependencies import require_admin, require_any
from app.core.config import settings as app_settings
from app.core.encryption import encrypt_value, decrypt_value
from app.models.user import User

router = APIRouter(prefix="/settings", tags=["settings"])


class CompanySettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    abn: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    gst_rate: Optional[float] = None
    invoice_prefix: Optional[str] = None
    quote_prefix: Optional[str] = None
    bank_name: Optional[str] = None
    bank_bsb: Optional[str] = None
    bank_account: Optional[str] = None
    bank_account_name: Optional[str] = None
    payment_terms_default: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None  # plaintext in request; stored encrypted
    smtp_from_name: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    tyro_merchant_id: Optional[str] = None
    tyro_terminal_id: Optional[str] = None
    tyro_environment: Optional[str] = None


def _get_or_create_settings(db: Session) -> CompanySettings:
    s = db.query(CompanySettings).first()
    if not s:
        s = CompanySettings(id=1)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def _safe_response(s: CompanySettings) -> dict:
    """Return settings as a dict, replacing the stored smtp_password with a mask."""
    d = {c.name: getattr(s, c.name) for c in s.__table__.columns}
    d["smtp_password"] = "••••••••" if s.smtp_password else None
    return d


@router.get("/company")
def get_company_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    return _safe_response(_get_or_create_settings(db))


@router.put("/company")
def update_company_settings(
    body: CompanySettingsUpdate,
    db: Session = Depends(get_db),
    # Admin only. These settings include the BSB and account number printed
    # on every invoice PDF and payment email, the GST rate that feeds the BAS
    # figures, and the SMTP credentials. Changing the bank details silently
    # redirects where customers send money, which is not a staff-level action.
    _: User = Depends(require_admin),
):
    s = _get_or_create_settings(db)
    data = body.model_dump(exclude_none=True)
    if "smtp_password" in data:
        raw_pw = data.pop("smtp_password")
        data["smtp_password"] = (
            encrypt_value(raw_pw, app_settings.SECRET_KEY) if raw_pw else None
        )
    for field, value in data.items():
        setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return _safe_response(s)


@router.post("/smtp-test")
def test_smtp(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s = _get_or_create_settings(db)
    if not s.smtp_host:
        raise HTTPException(
            status_code=400,
            detail="SMTP not configured — please save host settings first.",
        )

    # Decrypt password in memory only
    plaintext_pw = None
    if s.smtp_password:
        try:
            plaintext_pw = decrypt_value(s.smtp_password, app_settings.SECRET_KEY)
        except ValueError:
            # Legacy plaintext password (migration path)
            plaintext_pw = s.smtp_password

    try:
        if s.smtp_use_tls:
            server = smtplib.SMTP(s.smtp_host, s.smtp_port or 587, timeout=10)
            server.ehlo()
            server.starttls()
            server.ehlo()
        else:
            server = smtplib.SMTP_SSL(s.smtp_host, s.smtp_port or 465, timeout=10)
        if s.smtp_user and plaintext_pw:
            server.login(s.smtp_user, plaintext_pw)
        server.quit()
        return {
            "ok": True,
            "message": f"Connected to {s.smtp_host}:{s.smtp_port or (587 if s.smtp_use_tls else 465)} successfully.",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"SMTP test failed: {e}")

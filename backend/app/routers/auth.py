from fastapi import APIRouter, Depends, HTTPException, Response, Cookie, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime, timezone
import re

from app.database import get_db
from app.models.user import User
from app.core.security import (
    verify_password, hash_password,
    create_access_token, create_refresh_token, create_pre_mfa_token,
    decode_token, generate_totp_secret, verify_totp, totp_qr_base64,
)
from app.core.limiter import limiter
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_OPTS = dict(httponly=True, samesite="lax", secure=settings.is_production)


class LoginRequest(BaseModel):
    username: str
    password: str


class MFAVerifyRequest(BaseModel):
    code: str


class MFASetupConfirmRequest(BaseModel):
    code: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit")
        return v


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    if user.totp_enabled:
        # Issue short-lived pre-MFA token; full access granted after /verify-2fa
        pre_token = create_pre_mfa_token(user.id)
        response.set_cookie("pre_mfa_token", pre_token, max_age=300, **COOKIE_OPTS)
        return {"requires_2fa": True}

    # No 2FA configured — issue full tokens
    _issue_tokens(response, user)
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    return {"requires_2fa": False, "user": _user_info(user)}


@router.post("/verify-2fa")
@limiter.limit("5/minute")
def verify_2fa(
    request: Request,
    body: MFAVerifyRequest,
    response: Response,
    pre_mfa_token: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    if not pre_mfa_token:
        raise HTTPException(status_code=401, detail="No pending MFA session")
    payload = decode_token(pre_mfa_token)
    if not payload or payload.get("type") != "pre_mfa":
        raise HTTPException(status_code=401, detail="Invalid or expired MFA session")

    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid or expired MFA session")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.totp_secret:
        raise HTTPException(status_code=401, detail="User not found")
    if not verify_totp(user.totp_secret, body.code):
        raise HTTPException(status_code=401, detail="Invalid 2FA code")

    response.delete_cookie("pre_mfa_token")
    _issue_tokens(response, user)
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    return {"user": _user_info(user)}


@router.post("/setup-2fa")
def setup_2fa(
    access_token: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    """Returns a QR code for the authenticated user to scan in their authenticator app."""
    user = _require_authenticated(access_token, db)
    secret = generate_totp_secret()
    user.totp_secret = secret
    db.commit()
    return {
        "qr_code": totp_qr_base64(secret, user.username),
        "secret": secret,  # show once so user can enter manually if needed
    }


@router.post("/confirm-2fa")
def confirm_2fa(
    body: MFASetupConfirmRequest,
    access_token: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    """Verifies the first TOTP code after setup to confirm the user scanned correctly."""
    user = _require_authenticated(access_token, db)
    if not user.totp_secret:
        raise HTTPException(status_code=400, detail="Run /setup-2fa first")
    if not verify_totp(user.totp_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid code — scan QR again")
    user.totp_enabled = True
    db.commit()
    return {"message": "2FA enabled successfully"}


@router.post("/refresh")
def refresh(response: Response, refresh_token: Optional[str] = Cookie(default=None), db: Session = Depends(get_db)):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(user.id, user.role, mfa_verified=True)
    response.set_cookie("access_token", access, max_age=1800, **COOKIE_OPTS)
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"ok": True}


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    access_token: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = _require_authenticated(access_token, db)
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    user.hashed_password = hash_password(body.new_password)
    db.commit()
    return {"message": "Password updated"}


# ── helpers ──────────────────────────────────────────────────────────────────

def _issue_tokens(response: Response, user: User):
    from app.core.config import settings
    access = create_access_token(user.id, user.role, mfa_verified=True)
    refresh = create_refresh_token(user.id)
    response.set_cookie("access_token", access, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, **COOKIE_OPTS)
    response.set_cookie("refresh_token", refresh, max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, **COOKIE_OPTS)


def _require_authenticated(token: Optional[str], db: Session) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    if not payload or payload.get("type") != "access" or not payload.get("mfa"):
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _user_info(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "totp_enabled": user.totp_enabled,
    }

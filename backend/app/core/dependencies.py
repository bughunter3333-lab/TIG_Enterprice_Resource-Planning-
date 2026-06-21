from fastapi import Depends, HTTPException, Cookie, status
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.core.security import decode_token
from app.models.user import User


def get_current_user(
    access_token: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )
    if not access_token:
        raise credentials_error

    payload = decode_token(access_token)
    if not payload or payload.get("type") != "access" or not payload.get("mfa"):
        raise credentials_error

    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise credentials_error
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise credentials_error
    if payload.get("tv", 0) != user.token_version:
        raise credentials_error
    return user


def require_role(*roles: str):
    def checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user

    return checker


require_admin = require_role("admin")
require_staff = require_role("admin", "staff")
require_any = require_role("admin", "staff", "overseas_staff")

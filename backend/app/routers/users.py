from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
import re

from app.database import get_db
from app.models.user import User
from app.core.security import hash_password
from app.core.dependencies import require_admin, get_current_user

router = APIRouter(prefix="/users", tags=["users"])


def _validate_password_strength(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[0-9]", v):
        raise ValueError("Password must contain at least one digit")
    return v


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    full_name: str
    password: str
    role: str = "staff"

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    totp_enabled: bool

    class Config:
        from_attributes = True


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(User).all()


@router.post("", response_model=UserOut)
def create_user(
    body: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    if body.role not in ("admin", "staff", "overseas_staff"):
        raise HTTPException(status_code=400, detail="Invalid role")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    user = User(
        username=body.username,
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


class PasswordReset(BaseModel):
    new_password: str
    # Off by default: resetting a password should not remove a working second
    # factor as a side effect.
    clear_2fa: bool = False

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


@router.post("/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    body: PasswordReset,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(body.new_password)
    # Revoke every token already issued to this account.
    #
    # Without this the reset does not do what an admin thinks it does. The
    # obvious move when someone leaves or an account is suspected compromised is
    # to reset their password — but their existing access token kept working,
    # and their refresh token kept minting new ones for the rest of its seven
    # day life. The self-service change at auth.py has always bumped this; the
    # admin path, which is the one used in an actual incident, did not.
    user.token_version = (user.token_version or 0) + 1

    # Clearing the second factor is a separate decision from resetting the
    # password, and doing it silently left the account weaker than before the
    # reset ran. A lost authenticator and a stolen password are different
    # incidents; the caller has to say which one this is.
    if body.clear_2fa:
        user.totp_enabled = False
        user.totp_secret = None
    db.commit()
    return {"ok": True}


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"ok": True}

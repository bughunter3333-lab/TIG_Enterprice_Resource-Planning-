"""User accounts and their roles — the admin's side of access control.

An account's role is the whole of what it may do: every endpoint names the
roles it lets through (app.core.dependencies), and nothing else is consulted.
So what this router has to get right is small and matters a great deal: only
an admin changes accounts, a role is always one of the four that exist, and an
admin cannot lock themselves — and with them the business — out.
"""

import logging
import re
from datetime import datetime
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.access import access_table
from app.core.dependencies import ROLES, get_signed_in_user, require_admin
from app.core.security import (
    MAX_PASSWORD_CHARS,
    hash_password,
    validate_password_strength,
)
from app.database import get_db
from app.models.dispatch_session import DispatchSession
from app.models.saved_list import SavedList
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])
logger = logging.getLogger(__name__)

# What someone types to sign in: no spaces, nothing that needs escaping in a
# URL or reads differently in another font's hand.
_USERNAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,49}$")


def _a_username(value: str) -> str:
    value = value.strip()
    if not _USERNAME.match(value):
        raise ValueError(
            "Username must be 3 to 50 characters: letters, digits, dots, dashes "
            "and underscores, starting with a letter or digit"
        )
    return value


def _a_name(value: str) -> str:
    value = " ".join(value.split())
    if not value:
        raise ValueError("Full name cannot be blank")
    return value


Username = Annotated[str, Field(max_length=50), AfterValidator(_a_username)]
FullName = Annotated[str, Field(max_length=100), AfterValidator(_a_name)]


def _same_email(address: str):
    """The filter for an account that already has this address, whatever its case."""
    return func.lower(User.email) == func.lower(address)


def _keep_an_admin(db: Session, target: User) -> None:
    """Refuse a change that would leave the system with no active admin.

    Called when `target` is about to stop being one. The rule that an admin
    cannot demote or switch off themselves covers one admin acting alone; two
    acting on each other at the same moment each pass that. So the rule is held
    directly: the active admins are read under a lock, in one order, and the
    second of two crossing requests waits and then sees what the first did.
    """
    if target.role != "admin" or not target.is_active:
        return
    admins = (
        db.query(User)
        .filter(User.role == "admin", User.is_active.is_(True))
        .order_by(User.id)
        .with_for_update()
        .all()
    )
    if not any(admin.id != target.id for admin in admins):
        raise HTTPException(
            status_code=400,
            detail=(
                f"{target.username} is the only active admin. Make someone else "
                "an admin first."
            ),
        )


def _a_role(role: str) -> str:
    if role not in ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown role '{role}'. The roles are: {', '.join(ROLES)}",
        )
    return role


class UserCreate(BaseModel):
    username: Username
    email: EmailStr = Field(max_length=255)
    full_name: FullName
    password: str = Field(max_length=MAX_PASSWORD_CHARS)
    role: str = Field("staff", max_length=20)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = Field(None, max_length=255)
    full_name: Optional[FullName] = None
    role: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    totp_enabled: bool
    # Still on a password an admin chose; see the User model.
    must_change_password: bool = False
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_signed_in_user)):
    # Not get_current_user: someone who still has to choose their own password
    # has to be able to learn that they do.
    return current_user


@router.get("/access")
def get_access_table(request: Request, _: User = Depends(require_admin)):
    """What each role can do, area by area, counted from the routes' own gates."""
    return access_table(request.app)


@router.get("", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(User).order_by(func.lower(User.username)).all()


@router.post("", response_model=UserOut)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _a_role(body.role)
    # Compared without case: "Emon117" and "emon117" as two accounts is a
    # mistake waiting to happen, and an easy way to pass for someone else.
    # The database folds both sides: folded here and there by different rules,
    # an address with an accent in it did not match itself.
    taken = func.lower(User.username) == func.lower(body.username)
    if db.query(User).filter(taken).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    # Email is unique in the table too, and was not checked here, so a taken
    # address reached the database and came back as a 500.
    if db.query(User).filter(_same_email(body.email)).first():
        raise HTTPException(status_code=409, detail="Email already in use")
    user = User(
        username=body.username,
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=body.role,
        # The admin chose it; the person replaces it when they first sign in.
        must_change_password=True,
    )
    # A SAVEPOINT, so a refusal by the database undoes this row and nothing
    # else in the session.
    try:
        with db.begin_nested():
            db.add(user)
            db.flush()
    except IntegrityError:
        # Two requests for the same username or address at the same moment:
        # both pass the checks above, and the database refuses the second.
        raise HTTPException(
            status_code=409, detail="That username or email was just taken"
        )
    db.commit()
    db.refresh(user)
    logger.info(
        "user created: %s as %s, by %s",
        user.username,
        user.role,
        current_user.username,
    )
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Update never checked the role. Every permission is an allowlist, so an
    # unknown value grants nothing — but a typo like "Admin" silently took away
    # everything, and the person found out by being locked out.
    if body.role is not None:
        _a_role(body.role)
    # An admin cannot take their own access away. Whoever is doing this is an
    # active admin, so as long as they cannot demote or switch off themselves
    # there is always one left — the last admin locking the business out of
    # its own system is otherwise two clicks.
    if user.id == current_user.id:
        if body.role is not None and body.role != user.role:
            raise HTTPException(
                status_code=400,
                detail="You cannot change your own role. Another admin has to.",
            )
        if body.is_active is False:
            raise HTTPException(
                status_code=400,
                detail="You cannot deactivate your own account. Another admin has to.",
            )
    if (
        body.email is not None
        and db.query(User).filter(_same_email(body.email), User.id != user_id).first()
    ):
        raise HTTPException(status_code=409, detail="Email already in use")
    changes = body.model_dump(exclude_none=True)
    was = {field: getattr(user, field) for field in ("role", "is_active")}
    leaving = changes.get("role", user.role) != "admin" or (
        changes.get("is_active", user.is_active) is False
    )
    if leaving:
        _keep_an_admin(db, user)
    for field, value in changes.items():
        setattr(user, field, value)
    # Switching an account off ends its sessions, not just suspends them:
    # without this, switching it on again brought every old cookie back to
    # life, with no password and no second factor.
    if was["is_active"] and not user.is_active:
        user.token_version = (user.token_version or 0) + 1
    db.commit()
    db.refresh(user)
    for field, before in was.items():
        if getattr(user, field) != before:
            logger.info(
                "user %s: %s changed from %s to %s, by %s",
                user.username,
                field,
                before,
                getattr(user, field),
                current_user.username,
            )
    return user


class PasswordReset(BaseModel):
    new_password: str = Field(max_length=MAX_PASSWORD_CHARS)
    # Off by default: resetting a password should not remove a working second
    # factor as a side effect.
    clear_2fa: bool = False

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


@router.post("/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    body: PasswordReset,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(body.new_password)
    # The admin chose this one too, so the person replaces it on signing in —
    # unless the admin is resetting their own, which nobody else knows.
    user.must_change_password = user.id != current_user.id
    # Revoke every token already issued to this account.
    #
    # Without this the reset does not do what an admin thinks it does. The
    # obvious move when someone leaves or an account is suspected compromised is
    # to reset their password — but their existing access token kept working,
    # and their refresh token kept minting new ones for the rest of its seven
    # day life. The self-service change at auth.py has always bumped this; the
    # admin path, which is the one used in an actual incident, did not.
    user.token_version = (user.token_version or 0) + 1
    # A reset is also how an admin lets a locked-out person back in without
    # making them wait out the lock.
    user.failed_login_count = 0
    user.locked_until = None

    # Clearing the second factor is a separate decision from resetting the
    # password, and doing it silently left the account weaker than before the
    # reset ran. A lost authenticator and a stolen password are different
    # incidents; the caller has to say which one this is.
    if body.clear_2fa:
        user.totp_enabled = False
        user.totp_secret = None
    db.commit()
    logger.info(
        "user %s: password reset%s, by %s",
        user.username,
        " and second factor cleared" if body.clear_2fa else "",
        current_user.username,
    )
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
    # Despatches are recorded against the account that made them. Deleting it
    # would take the name off that record — or, where the database refuses,
    # fail as an error. An account with history is switched off, not deleted.
    if db.query(DispatchSession).filter(DispatchSession.user_id == user_id).first():
        raise HTTPException(
            status_code=409,
            detail=(
                f"{user.username} has recorded despatches, which stay on file "
                "under their name. Deactivate the account instead."
            ),
        )
    _keep_an_admin(db, user)
    # Their saved lists are theirs alone and go with them.
    db.query(SavedList).filter(SavedList.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    logger.info("user deleted: %s, by %s", user.username, current_user.username)
    return {"ok": True}

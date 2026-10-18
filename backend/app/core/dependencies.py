from fastapi import Depends, HTTPException, Cookie, status
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.core.security import decode_token
from app.models.user import User


def get_signed_in_user(
    access_token: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Who the sign-in cookie belongs to, and nothing more.

    Only `GET /users/me` stops here: a person who still has to choose their
    own password must be told who they are and that they have to. Everything
    else goes through `get_current_user`.
    """
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


def get_current_user(user: User = Depends(get_signed_in_user)) -> User:
    """The signed-in account, once it is using a password of its own.

    A password an admin chose (a new account, or a reset) is known to two
    people, so until the person replaces it the API answers nothing but who
    they are (`get_signed_in_user`) and the change itself (`/auth/change-
    password`). Signing out and refreshing a token still work; neither grants
    anything. Every gate below is built on this, and the sign-in routes that
    read the cookie themselves (`routers/auth.py`, `_require_authenticated`)
    apply it too, so no route can be reached round it.
    """
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "password_change_required",
                "message": "Choose your own password before going on.",
            },
        )
    return user


def require_role(*roles: str):
    def checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user

    # Which roles this gate lets through, readable from outside: the access
    # table on the admin screen is built from the gates themselves
    # (app.core.access), so it cannot say something the server does not do.
    checker.roles = roles
    return checker


# The roles an account can hold, named once. The frontend mirrors this in
# `src/roles.js` and a test asserts the two agree. Before it existed the list
# lived in three places that had drifted: the permission checks knew `manager`,
# the create endpoint rejected it, and the admin screen could not offer it — so
# the role existed and could not be given to anybody.
ROLES = ("admin", "manager", "staff", "overseas_staff")

require_admin = require_role("admin")
# Stock is the ledger the whole system prices and picks from, so editing a
# position is a supervisory act rather than a daily one. Staff read it and
# move it through jobs; changing what a record *says* is admin or manager.
require_manager = require_role("admin", "manager")
require_staff = require_role("admin", "manager", "staff")
require_any = require_role("admin", "manager", "staff", "overseas_staff")

from sqlalchemy import Column, Integer, String, Boolean, DateTime, func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    full_name = Column(String(100), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    # roles: admin | staff | overseas_staff
    role = Column(String(20), nullable=False, default="staff")
    is_active = Column(Boolean, default=True)
    totp_secret = Column(String(64), nullable=True)
    totp_enabled = Column(Boolean, default=False)
    # Bumped on password change to invalidate all previously-issued JWTs.
    token_version = Column(Integer, nullable=False, default=0, server_default="0")
    # SSO fields — populated when migrating to SSO later
    sso_provider = Column(String(50), nullable=True)
    sso_subject = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)

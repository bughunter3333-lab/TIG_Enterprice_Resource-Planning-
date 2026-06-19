"""
Run once to create the first admin user.

Interactive (local):
    python seed_admin.py

Non-interactive (cloud — no TTY): set these env vars and run the same command:
    ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD   (ADMIN_FULL_NAME optional)
When all three required vars are present the prompts are skipped.
"""
import os
import sys
import getpass
from app.database import SessionLocal
from app.models.user import User
from app.core.security import hash_password

def main():
    env_user = os.environ.get("ADMIN_USERNAME")
    env_pass = os.environ.get("ADMIN_PASSWORD")
    if env_user and env_pass:
        # Non-interactive path (cloud deploy / CI)
        username = env_user.strip()
        email = (os.environ.get("ADMIN_EMAIL") or "").strip()
        full_name = (os.environ.get("ADMIN_FULL_NAME") or username).strip()
        password = env_pass
    else:
        username = input("Admin username: ").strip()
        email = input("Admin email: ").strip()
        full_name = input("Full name: ").strip()
        password = getpass.getpass("Password: ").strip()

    db = SessionLocal()
    if db.query(User).filter(User.username == username).first():
        print("Username already exists.")
        sys.exit(1)

    user = User(
        username=username,
        email=email,
        full_name=full_name,
        hashed_password=hash_password(password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    print(f"Admin user '{username}' created. Set up 2FA on first login via /auth/setup-2fa.")

if __name__ == "__main__":
    main()

"""
Run once to create the first admin user:
    python seed_admin.py
"""
import sys
import getpass
from app.database import SessionLocal
from app.models.user import User
from app.core.security import hash_password

def main():
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

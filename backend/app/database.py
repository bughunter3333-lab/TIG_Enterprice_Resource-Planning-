import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool
from app.core.config import settings

_connect_args = (
    {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
)
# On Vercel every warm function instance would keep its own pool of idle
# connections, and enough instances exhaust the database's connection limit.
# There the pooling is Supabase's job (its transaction pooler, port 6543), so
# each request opens one connection and hands it straight back. Vercel sets
# VERCEL=1 in every function; locally and in tests the normal pool stays.
_pool_args = {"poolclass": NullPool} if os.environ.get("VERCEL") else {}
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    connect_args=_connect_args,
    **_pool_args,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

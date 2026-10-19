from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool
from app.core.config import settings


def engine_options(url: str) -> dict:
    """How the engine connects, by the kind of database.

    SQLite (local development) is one file shared across threads. Postgres is
    Supabase, reached from Vercel Functions through its transaction pooler: the
    instances are many, short-lived and frozen between requests, so a pool of
    their own would hold sockets that go stale and multiply connections across
    instances. Each request opens a connection and closes it; the pooler keeps
    the real ones.
    """
    if url.startswith("sqlite"):
        return {"pool_pre_ping": True, "connect_args": {"check_same_thread": False}}
    return {"poolclass": NullPool}


engine = create_engine(settings.DATABASE_URL, **engine_options(settings.DATABASE_URL))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

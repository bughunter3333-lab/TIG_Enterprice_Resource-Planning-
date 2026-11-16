from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
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

# How long a request waits for a row another holds before it is told to try
# again (a 409, app/main.py). Unbounded, it waited for as long as the other
# held it — past Vercel's limit, a 504 "can't reach the server".
LOCK_TIMEOUT = "10s"


@event.listens_for(Session, "after_begin")
def _bounded_lock_waits(session, transaction, connection) -> None:
    # SET LOCAL lasts the transaction: it holds through Supabase's transaction
    # pooler, which hands each transaction whichever connection is free.
    if connection.dialect.name == "postgresql":
        connection.exec_driver_sql(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT}'")


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

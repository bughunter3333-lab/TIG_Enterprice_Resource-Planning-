"""Tests that need real Postgres: row locks, lost updates and deadlocks.

SQLite ignores `FOR UPDATE`, so the rest of the suite cannot see two requests
wait on each other. These run where TEST_POSTGRES_URL names a database built
by the migrations — CI's Migrations job, or a throwaway server — and are
skipped everywhere else.

Each scenario runs two requests on two threads with their own sessions, the
way two people's requests meet on the server. Request A is paused right after
it runs a chosen statement — holding whatever it has locked so far — while
request B starts. Then A goes on. Locked in one order, B waits for A and both
succeed. Locked in opposite orders, each waits for the other and Postgres
aborts one with a deadlock.
"""

import os
import re
import threading
import time
import uuid
from contextlib import contextmanager

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

URL = os.environ.get("TEST_POSTGRES_URL")

# Nothing here should wait long: a lock held past this is a bug, not a queue.
LOCK_TIMEOUT_MS = 15000


# These tests commit customers, jobs, an admin and invoice numbers for good:
# only a database plainly made for tests is used, never a real company's.
THROWAWAY = re.compile(r"^(ci|.*test.*|.*throwaway.*)$", re.I)


@pytest.fixture(scope="session")
def pg_engine():
    if not URL:
        pytest.skip("TEST_POSTGRES_URL is not set: these tests need real Postgres")
    database = make_url(URL).database or ""
    if not THROWAWAY.match(database):
        pytest.fail(
            f"TEST_POSTGRES_URL names database {database!r}: these tests write to "
            "it for good, so it must be one made for them (named ci, or with "
            "'test' in its name)"
        )
    engine = create_engine(
        URL,
        poolclass=NullPool,
        connect_args={"options": f"-c lock_timeout={LOCK_TIMEOUT_MS}"},
    )
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def pg_session(pg_engine):
    """A session factory set up as the app's own (`app.database.SessionLocal`)."""
    return sessionmaker(autocommit=False, autoflush=False, bind=pg_engine)


@pytest.fixture(scope="session")
def pg_admin(pg_session):
    """An admin in the Postgres database, and the company's settings row."""
    from app.models.settings import CompanySettings
    from app.models.user import User

    with pg_session() as db:
        if db.query(CompanySettings).first() is None:
            db.add(CompanySettings())
        user = db.query(User).filter_by(username="pg-admin").first()
        if user is None:
            user = User(
                username="pg-admin",
                email="pg-admin@example.test",
                full_name="PG Admin",
                # No password signs in to it: the routes are called with the
                # user itself (as `client_as` in tests/conftest.py).
                hashed_password="unused",
                role="admin",
                is_active=True,
            )
            db.add(user)
        db.commit()
        db.refresh(user)
        db.expunge(user)
        return user


@pytest.fixture
def tag():
    """A short unique suffix, so scenarios never share rows."""
    return uuid.uuid4().hex[:8].upper()


class Pause:
    """Hold one thread right after the first statement it runs that matches."""

    def __init__(self, engine, pattern: str, thread_name: str):
        self.engine = engine
        self.pattern = re.compile(pattern, re.I | re.S)
        self.thread_name = thread_name
        self.reached = threading.Event()
        self.release = threading.Event()
        self.statement = None

    def __call__(self, conn, cursor, statement, params, context, executemany):
        if threading.current_thread().name != self.thread_name or self.reached.is_set():
            return
        if self.pattern.search(statement):
            self.statement = statement
            self.reached.set()
            self.release.wait(LOCK_TIMEOUT_MS / 1000)

    @contextmanager
    def listening(self):
        event.listen(self.engine, "after_cursor_execute", self)
        try:
            yield self
        finally:
            self.release.set()
            event.remove(self.engine, "after_cursor_execute", self)


def _someone_waits(engine) -> bool:
    with engine.connect() as conn:
        return bool(
            conn.execute(
                text("SELECT count(*) FROM pg_locks WHERE NOT granted")
            ).scalar()
        )


def race(engine, first, second, pause_after: str, b_waits: bool = True):
    """Run `first` on thread A, paused after `pause_after`; run `second` meanwhile.

    With `b_waits`, A goes on only once B is seen waiting for a lock — the one A
    holds, in a right order — and the race fails if B never waits: B finishing
    on its own would prove nothing. In a wrong order B holds a row A wants by
    then, and Postgres finds the deadlock about a second (`deadlock_timeout`)
    after A goes on and waits. Without it (a lost update, where nothing is
    locked to wait on), A goes on once B has finished.

    Returns {"A": (ok, value_or_error), "B": (...)} once both have finished.
    """
    results = {}

    def run(name, work):
        try:
            results[name] = (True, work())
        except Exception as exc:  # the scenario reports it
            results[name] = (False, exc)

    deadline = LOCK_TIMEOUT_MS / 1000
    with Pause(engine, pause_after, "A").listening() as pause:
        a = threading.Thread(target=run, args=("A", first), name="A")
        a.start()
        assert pause.reached.wait(
            deadline
        ), f"request A never ran a statement matching {pause_after!r}"
        b = threading.Thread(target=run, args=("B", second), name="B")
        b.start()
        if b_waits:
            waited = False
            for _ in range(int(deadline * 10)):
                if _someone_waits(engine):
                    waited = True
                    break
                if not b.is_alive():
                    break
                time.sleep(0.1)
            assert waited, (
                f"request B never waited for request A (B: {results.get('B')!r}); "
                "the scenario did not make them meet"
            )
        else:
            b.join(deadline)
        pause.release.set()
        a.join(deadline + 5)
        b.join(deadline + 5)
    assert not a.is_alive() and not b.is_alive(), "a request never finished"
    return results


def failures(results) -> list[str]:
    return [f"{name}: {value!r}" for name, (ok, value) in results.items() if not ok]

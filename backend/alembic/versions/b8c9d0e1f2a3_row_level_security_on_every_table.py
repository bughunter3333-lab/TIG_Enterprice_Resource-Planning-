"""row level security on every table: Supabase's Data API reads nothing

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-10-24

Supabase publishes every table in the `public` schema through its Data API
(PostgREST) to anyone holding the project's anon key, and the anon key is not a
secret — Supabase designs it to ship in browsers. This app never uses the Data
API: the website talks only to our FastAPI, which connects as the role that owns
the tables. So with row level security off, the users table (password hashes,
TOTP secrets), customers, jobs and the ledger were one leaked anon key away from
being readable and writable by anyone.

Row level security on, with no policies, is "deny everything" for the anon and
authenticated roles the Data API uses. The owning role — the one Alembic and the
API connect as — is not subject to row level security unless it is forced, so
the app is unaffected.

PostgreSQL only: SQLite (tests, local scratch) has no such thing. A table added
by a later migration must enable it too; tests/unit/test_schema_conventions.py
fails on one that does not.
"""

from alembic import op


revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def _every_public_table(statement):
    op.execute(
        f"""
        DO $$
        DECLARE t record;
        BEGIN
          FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
            EXECUTE format('ALTER TABLE public.%I {statement}', t.tablename);
          END LOOP;
        END $$;
        """
    )


def upgrade():
    if op.get_bind().dialect.name != "postgresql":
        return
    _every_public_table("ENABLE ROW LEVEL SECURITY")


def downgrade():
    if op.get_bind().dialect.name != "postgresql":
        return
    _every_public_table("DISABLE ROW LEVEL SECURITY")

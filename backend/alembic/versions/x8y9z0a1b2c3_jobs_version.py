"""jobs.version — the optimistic-lock token

Replaces `updated_at` as the version a client sends back on save. That column
is a wall clock with about 10ms of resolution, so two saves inside one tick
carried an identical token and the stale one was accepted as current — 16 of 40
back-to-back saves in a measured run. Existing rows start at 1; every later
UPDATE moves it via the mapper's version_id_col.

Revision ID: x8y9z0a1b2c3
Revises: w7x8y9z0a1b2
Create Date: 2026-08-29
"""

from alembic import op
import sqlalchemy as sa

revision = "x8y9z0a1b2c3"
down_revision = "w7x8y9z0a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )


def downgrade() -> None:
    op.drop_column("jobs", "version")

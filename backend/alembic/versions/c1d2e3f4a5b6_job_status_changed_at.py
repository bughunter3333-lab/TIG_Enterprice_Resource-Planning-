"""when a job came to its status: how long it has sat there

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-11-09

docs/superpowers/specs/2026-11-09-status-times.md: a job over its allowance
at a status is flagged. `jobs.status_changed_at` is written by the one status
gate (`_apply_status_transition`). A job already at its status takes its last
change (`updated_at`) — the nearest thing to when it got there that the
database holds.
"""

from alembic import op
import sqlalchemy as sa


revision = "c1d2e3f4a5b6"
down_revision = "b0c1d2e3f4a5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "jobs", sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute(
        "UPDATE jobs SET status_changed_at = COALESCE(updated_at, created_at) "
        "WHERE status_changed_at IS NULL"
    )


def downgrade():
    op.drop_column("jobs", "status_changed_at")

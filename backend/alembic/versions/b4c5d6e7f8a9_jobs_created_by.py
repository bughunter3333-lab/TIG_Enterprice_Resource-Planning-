"""jobs: the account that created each one

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-10-25

The online store's portal now has an account of its own, the 'portal' role,
which books orders and comments on them (owner decision 2026-10-25, finding
F26). It may comment only on the orders it booked, so a job records the
account that created it.

Nullable, nothing to backfill: jobs made before this record no creator, and
the portal can comment on none of them.
"""

from alembic import op
import sqlalchemy as sa


revision = "b4c5d6e7f8a9"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "jobs", sa.Column("created_by_user_id", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        "fk_jobs_created_by_user_id",
        "jobs",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("fk_jobs_created_by_user_id", "jobs", type_="foreignkey")
    op.drop_column("jobs", "created_by_user_id")

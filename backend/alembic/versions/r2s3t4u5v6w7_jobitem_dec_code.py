"""add generic dec_code to job_items (per-method decoration code)

Revision ID: r2s3t4u5v6w7
Revises: q1r2s3t4u5v6
Create Date: 2026-06-23
"""

from alembic import op
import sqlalchemy as sa

revision = "r2s3t4u5v6w7"
down_revision = "q1r2s3t4u5v6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "job_items", sa.Column("dec_code", sa.String(length=100), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("job_items", "dec_code")

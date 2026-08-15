"""goods_receipts.branch — which branch the goods landed at

Revision ID: w7x8y9z0a1b2
Revises: v6w7x8y9z0a1
Create Date: 2026-08-15
"""

from alembic import op
import sqlalchemy as sa

revision = "w7x8y9z0a1b2"
down_revision = "v6w7x8y9z0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "goods_receipts",
        sa.Column("branch", sa.String(length=50), server_default="HQ"),
    )


def downgrade() -> None:
    op.drop_column("goods_receipts", "branch")

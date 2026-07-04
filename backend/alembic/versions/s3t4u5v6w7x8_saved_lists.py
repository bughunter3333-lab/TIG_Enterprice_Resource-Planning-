"""saved_lists — server-synced per-user nav-tree lists (Jim2 25/node)

Revision ID: s3t4u5v6w7x8
Revises: r2s3t4u5v6w7
Create Date: 2026-07-04
"""

from alembic import op
import sqlalchemy as sa

revision = "s3t4u5v6w7x8"
down_revision = "r2s3t4u5v6w7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saved_lists",
        sa.Column("id", sa.String(length=50), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False
        ),
        sa.Column("node", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("filter_json", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_saved_lists_user_id", "saved_lists", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_saved_lists_user_id", table_name="saved_lists")
    op.drop_table("saved_lists")

"""stock_audit — who changed a stock record, and to what

Revision ID: a1b2c3d4e5f6
Revises: z0a1b2c3d4e5
Create Date: 2026-09-06

The trail the Locations screen writes. One row per field that moved, so the
question "who took this SKU out of B.3.H.1" has an answer that does not depend
on anyone having remembered to write a note.

Portable ops only — the same file runs on SQLite in tests and PostgreSQL in
production.
"""

from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e5f6"
down_revision = "z0a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "stock_audit",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sku", sa.String(length=50), nullable=False),
        sa.Column("branch", sa.String(length=50), nullable=True),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("field", sa.String(length=50), nullable=False),
        sa.Column("old_value", sa.String(length=255), nullable=True),
        sa.Column("new_value", sa.String(length=255), nullable=True),
        sa.Column("changed_by", sa.String(length=50), nullable=False),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_audit_sku", "stock_audit", ["sku"])


def downgrade():
    op.drop_index("ix_stock_audit_sku", table_name="stock_audit")
    op.drop_table("stock_audit")

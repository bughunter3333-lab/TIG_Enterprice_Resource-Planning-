"""dispatch line items: what each despatch sent of each job line

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-10-30

A further consignment's delivery note printed the line's running picked or
supplied total, so the second carton claimed everything sent so far (finding
F21). Each despatch now records what it sent of each goods line. Despatches
made before this have no rows; their notes print as they did.
"""

from alembic import op
import sqlalchemy as sa


revision = "d6e7f8a9b0c1"
down_revision = "c5d6e7f8a9b0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "dispatch_line_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("dispatch_session_line_id", sa.Integer(), nullable=False),
        sa.Column("job_item_id", sa.Integer(), nullable=True),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["dispatch_session_line_id"],
            ["dispatch_session_lines.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["job_item_id"], ["job_items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_dispatch_line_items_dispatch_session_line_id",
        "dispatch_line_items",
        ["dispatch_session_line_id"],
    )
    op.create_index(
        "ix_dispatch_line_items_job_item_id", "dispatch_line_items", ["job_item_id"]
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE public.dispatch_line_items ENABLE ROW LEVEL SECURITY")


def downgrade():
    op.drop_index("ix_dispatch_line_items_job_item_id", "dispatch_line_items")
    op.drop_index(
        "ix_dispatch_line_items_dispatch_session_line_id", "dispatch_line_items"
    )
    op.drop_table("dispatch_line_items")

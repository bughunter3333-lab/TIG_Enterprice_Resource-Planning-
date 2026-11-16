"""rack sections: a stretch of racking marked for a customer

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-10-12

"Bays 3-7 of aisle B belong to Zone Bowling." One row is a rectangle on a
single rack face, held as its two opposite corners (bay + position along the
face, level up it), smallest corner first. The 3D warehouse view paints them.

Deleting a customer takes its sections with it. No two sections in a branch
start at the same box: the overlap rule is the application's, and this is the
part of it the database can hold against two saves at the same moment.
"""

from alembic import op
import sqlalchemy as sa


revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "rack_sections",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("branch", sa.String(length=20), nullable=False),
        sa.Column("customer_id", sa.String(length=20), nullable=False),
        sa.Column("aisle", sa.String(length=10), nullable=False),
        sa.Column("bay_from", sa.Integer(), nullable=False),
        sa.Column("position_from", sa.Integer(), nullable=False),
        sa.Column("bay_to", sa.Integer(), nullable=False),
        sa.Column("position_to", sa.Integer(), nullable=False),
        sa.Column("level_from", sa.String(length=2), nullable=False),
        sa.Column("level_to", sa.String(length=2), nullable=False),
        sa.Column("created_by", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "branch",
            "aisle",
            "bay_from",
            "position_from",
            "level_from",
            name="uq_rack_sections_start",
        ),
    )
    op.create_index("ix_rack_sections_branch", "rack_sections", ["branch"])
    op.create_index("ix_rack_sections_customer_id", "rack_sections", ["customer_id"])


def downgrade():
    op.drop_index("ix_rack_sections_customer_id", table_name="rack_sections")
    op.drop_index("ix_rack_sections_branch", table_name="rack_sections")
    op.drop_table("rack_sections")

"""logos, and the line a decoration or alteration applies to

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-10-25

Owner decision of 2026-10-25 for findings F02, F09, F12, F16, F19 and F31: a
logo is a record of its own — code, method, stitch count, price, cost, in-house
or subcontracted, proof — and a decoration or alteration line points at the
logo it applies and at the garment line it is done to. Such a line is a
service: supplied in full, never bought, reserved, picked or shipped as stock.

Row level security is on for the new table, like every other (b8c9d0e1f2a3).
Nothing to backfill: existing lines keep their decoration as text, as before.
"""

from alembic import op
import sqlalchemy as sa


revision = "a3b4c5d6e7f8"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "logos",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("customer_id", sa.String(length=20), nullable=True),
        sa.Column("name", sa.String(length=150), nullable=True),
        sa.Column("decoration_type", sa.String(length=30), nullable=False),
        sa.Column("position", sa.String(length=30), nullable=True),
        sa.Column("stitch_count", sa.Integer(), nullable=True),
        sa.Column("color_count", sa.Integer(), nullable=True),
        sa.Column("artwork_ref", sa.String(length=255), nullable=True),
        sa.Column("price_ex", sa.Numeric(10, 2), nullable=True),
        sa.Column("cost_ex", sa.Numeric(10, 2), nullable=True),
        sa.Column("made_by", sa.String(length=20), nullable=False),
        sa.Column("supplier_id", sa.String(length=20), nullable=True),
        sa.Column("proof_status", sa.String(length=20), nullable=False),
        sa.Column("proof_notes", sa.Text(), nullable=True),
        sa.Column("proof_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("proof_by", sa.String(length=100), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_logos_code"),
    )
    op.create_index("ix_logos_customer_id", "logos", ["customer_id"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE public.logos ENABLE ROW LEVEL SECURITY")

    op.add_column("job_items", sa.Column("logo_id", sa.Integer(), nullable=True))
    op.add_column(
        "job_items", sa.Column("applies_to_item_id", sa.Integer(), nullable=True)
    )
    op.create_index("ix_job_items_logo_id", "job_items", ["logo_id"])
    op.create_foreign_key(
        "fk_job_items_logo_id",
        "job_items",
        "logos",
        ["logo_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_job_items_applies_to_item_id",
        "job_items",
        "job_items",
        ["applies_to_item_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint(
        "fk_job_items_applies_to_item_id", "job_items", type_="foreignkey"
    )
    op.drop_constraint("fk_job_items_logo_id", "job_items", type_="foreignkey")
    op.drop_index("ix_job_items_logo_id", table_name="job_items")
    op.drop_column("job_items", "applies_to_item_id")
    op.drop_column("job_items", "logo_id")
    op.drop_index("ix_logos_customer_id", table_name="logos")
    op.drop_table("logos")

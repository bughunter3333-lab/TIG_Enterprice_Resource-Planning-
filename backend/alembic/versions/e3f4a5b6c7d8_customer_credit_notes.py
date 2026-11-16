"""customer credit notes and returns: credit against an invoice, goods back

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-11-09

docs/superpowers/specs/2026-11-09-returns-credit-notes.md. A credit note
(CN-0001, its own series) credits lines of an invoiced job; it is applied to
that invoice up to what it owes and the rest is credit on the customer's
account. `jobs.credited` is the credit applied to an invoice, so what it owes is
its total less payments less that. Lines whose plain goods come back wait at
RET for inspection. New tables, so row-level security like every table since
b8c9d0e1f2a3.
"""

from alembic import op
import sqlalchemy as sa


revision = "e3f4a5b6c7d8"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None

_NEW_TABLES = (
    "customer_credit_notes",
    "credit_note_lines",
    "credit_note_applications",
)


def upgrade():
    op.add_column(
        "jobs",
        sa.Column("credited", sa.Numeric(10, 2), nullable=True, server_default="0"),
    )
    op.create_table(
        "customer_credit_notes",
        sa.Column("id", sa.String(20), nullable=False),
        sa.Column("customer_id", sa.String(20), nullable=False),
        sa.Column("job_id", sa.String(20), nullable=False),
        sa.Column("credit_date", sa.String(10), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("total_ex", sa.Numeric(10, 2), nullable=False),
        sa.Column("tax", sa.Numeric(10, 2), nullable=False),
        sa.Column("total_inc", sa.Numeric(10, 2), nullable=False),
        sa.Column("created_by", sa.String(100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"]),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_customer_credit_notes_customer_id",
        "customer_credit_notes",
        ["customer_id"],
    )
    op.create_index(
        "ix_customer_credit_notes_job_id", "customer_credit_notes", ["job_id"]
    )
    op.create_table(
        "credit_note_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("credit_note_id", sa.String(20), nullable=False),
        sa.Column("job_item_id", sa.Integer(), nullable=True),
        sa.Column("stock_code", sa.String(50), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.Column("total_ex", sa.Numeric(10, 2), nullable=False),
        sa.Column("tax", sa.Numeric(10, 2), nullable=False),
        sa.Column("total_inc", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "goods_back", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "restockable", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("inspection", sa.String(20), nullable=True),
        sa.Column("inspected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("inspected_by", sa.String(100), nullable=True),
        sa.ForeignKeyConstraint(
            ["credit_note_id"], ["customer_credit_notes.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["job_item_id"], ["job_items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_credit_note_lines_credit_note_id", "credit_note_lines", ["credit_note_id"]
    )
    op.create_table(
        "credit_note_applications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("credit_note_id", sa.String(20), nullable=False),
        sa.Column("job_id", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("applied_on", sa.String(10), nullable=False),
        sa.Column("applied_by", sa.String(100), nullable=True),
        sa.ForeignKeyConstraint(
            ["credit_note_id"], ["customer_credit_notes.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_credit_note_applications_credit_note_id",
        "credit_note_applications",
        ["credit_note_id"],
    )
    op.create_index(
        "ix_credit_note_applications_job_id", "credit_note_applications", ["job_id"]
    )
    if op.get_bind().dialect.name == "postgresql":
        for table in _NEW_TABLES:
            op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")


def downgrade():
    op.drop_index("ix_credit_note_applications_job_id", "credit_note_applications")
    op.drop_index(
        "ix_credit_note_applications_credit_note_id", "credit_note_applications"
    )
    op.drop_table("credit_note_applications")
    op.drop_index("ix_credit_note_lines_credit_note_id", "credit_note_lines")
    op.drop_table("credit_note_lines")
    op.drop_index("ix_customer_credit_notes_job_id", "customer_credit_notes")
    op.drop_index("ix_customer_credit_notes_customer_id", "customer_credit_notes")
    op.drop_table("customer_credit_notes")
    op.drop_column("jobs", "credited")

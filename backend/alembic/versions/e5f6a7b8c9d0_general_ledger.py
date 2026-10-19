"""general ledger: chart of accounts, journal entries and lines

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-25

The double-entry ledger that invoices, payments and bills now post into.
Design: docs/superpowers/specs/2026-09-25-general-ledger-design.md

The chart itself is not seeded here. `app.core.ledger.ensure_chart` creates it
on first use, from the one definition in code, so there is no second copy of
the chart in a migration to drift from it.
"""

from alembic import op
import sqlalchemy as sa


revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ledger_accounts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("role", sa.String(length=40), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("role"),
    )
    op.create_index("ix_ledger_accounts_code", "ledger_accounts", ["code"], unique=True)

    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("memo", sa.String(length=255), nullable=True),
        sa.Column("source_type", sa.String(length=30), nullable=False),
        sa.Column("source_id", sa.String(length=40), nullable=True),
        sa.Column("reverses_id", sa.Integer(), nullable=True),
        sa.Column("reversed_by_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["reverses_id"], ["journal_entries.id"]),
        sa.ForeignKeyConstraint(["reversed_by_id"], ["journal_entries.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_journal_entries_entry_date", "journal_entries", ["entry_date"])
    op.create_index("ix_journal_entries_source_type", "journal_entries", ["source_type"])
    op.create_index("ix_journal_entries_source_id", "journal_entries", ["source_id"])

    op.create_table(
        "journal_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("entry_id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("debit", sa.Numeric(14, 2), server_default="0", nullable=False),
        sa.Column("credit", sa.Numeric(14, 2), server_default="0", nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("party_type", sa.String(length=20), nullable=True),
        sa.Column("party_id", sa.String(length=40), nullable=True),
        sa.Column("job_id", sa.String(length=20), nullable=True),
        sa.CheckConstraint(
            "debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0)",
            name="ck_journal_lines_one_side",
        ),
        sa.ForeignKeyConstraint(["entry_id"], ["journal_entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["ledger_accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_journal_lines_entry_id", "journal_lines", ["entry_id"])
    op.create_index("ix_journal_lines_account_id", "journal_lines", ["account_id"])
    op.create_index("ix_journal_lines_party_id", "journal_lines", ["party_id"])
    op.create_index("ix_journal_lines_job_id", "journal_lines", ["job_id"])

    with op.batch_alter_table("supplier_bills") as batch:
        batch.add_column(sa.Column("account_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_supplier_bills_account_id", "ledger_accounts", ["account_id"], ["id"]
        )


def downgrade():
    with op.batch_alter_table("supplier_bills") as batch:
        batch.drop_constraint("fk_supplier_bills_account_id", type_="foreignkey")
        batch.drop_column("account_id")
    op.drop_table("journal_lines")
    op.drop_table("journal_entries")
    op.drop_index("ix_ledger_accounts_code", table_name="ledger_accounts")
    op.drop_table("ledger_accounts")

"""close the drift between the models and what the migrations built

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-09-24

`alembic check` against a database built from nothing reported fourteen
differences. It reports differences, not which side is right, and for most of
them the database was right and the model had simply never described it — a
unique constraint, two `ON DELETE SET NULL` foreign keys, an aging index. Those
were fixed in the models, where the fix costs no DDL at all.

This migration is the remainder, where the model is right and the database is
not:

- `jobs.status` and `job_comments.status` were created as VARCHAR(20) and the
  models say 30. SQLite ignores the length, so the test suite could never see
  it; Postgres rejects any status longer than twenty characters, which is a
  production-only failure waiting on the first long status name.
- `jobs.item_no` was declared indexed in z0a1b2c3d4e5 and the index was never
  created.
- `supplier_bills.po_id` is a foreign key with no index. Deleting a purchase
  order has to find the bills that point at it to null them, and without the
  index that is a full scan of the table.

Widening a VARCHAR never truncates, and each index is new, so nothing here can
lose data.
"""

from alembic import op
import sqlalchemy as sa


revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("jobs") as batch:
        batch.alter_column(
            "status",
            existing_type=sa.String(20),
            type_=sa.String(30),
            existing_nullable=False,
        )
    with op.batch_alter_table("job_comments") as batch:
        batch.alter_column(
            "status",
            existing_type=sa.String(20),
            type_=sa.String(30),
            existing_nullable=True,
        )
    op.create_index("ix_jobs_item_no", "jobs", ["item_no"])
    op.create_index("ix_supplier_bills_po_id", "supplier_bills", ["po_id"])


def downgrade():
    op.drop_index("ix_supplier_bills_po_id", table_name="supplier_bills")
    op.drop_index("ix_jobs_item_no", table_name="jobs")
    # Narrowing back to 20 would fail on any status that used the extra room,
    # so the columns are left at 30. A wider column is harmless to the older
    # code, which never writes more than twenty characters.

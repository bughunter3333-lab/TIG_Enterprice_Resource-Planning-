"""email log: the purchase order an email sent

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-10-25

A purchase order can now be emailed to its supplier with its PDF attached
(finding F17), and the send is logged like an invoice's. The log named a job
only; it now names the purchase order too. Nullable, nothing to backfill.
"""

from alembic import op
import sqlalchemy as sa


revision = "c5d6e7f8a9b0"
down_revision = "b4c5d6e7f8a9"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("email_log", sa.Column("po_id", sa.String(length=20), nullable=True))


def downgrade():
    op.drop_column("email_log", "po_id")

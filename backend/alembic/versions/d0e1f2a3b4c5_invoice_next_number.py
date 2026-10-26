"""invoice numbering: where the issued sequence carries on from

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-10-25

Invoicing a job with no invoice number now issues the next one: the company's
invoice prefix followed by `invoice_next_number` (simulation finding F24). Left
empty, as it is here, numbering carries on from the highest number already used
under the prefix — so nothing has to be set for the existing sequence to
continue, and the shop can set it to where Jim2 stopped.
"""

from alembic import op
import sqlalchemy as sa


revision = "d0e1f2a3b4c5"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "company_settings",
        sa.Column("invoice_next_number", sa.Integer(), nullable=True),
    )


def downgrade():
    op.drop_column("company_settings", "invoice_next_number")

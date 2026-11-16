"""a customer's watchout: a note shown on every job for them

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-11-09

Roadmap Phase 1, watchouts (owner decision 2026-11-08: on customers):
`customers.watchout`, shown on every job for the customer and on the job form
when the customer is chosen (docs/superpowers/specs/2026-11-09-watchouts.md).
"""

from alembic import op
import sqlalchemy as sa


revision = "d2e3f4a5b6c7"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("customers", sa.Column("watchout", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("customers", "watchout")

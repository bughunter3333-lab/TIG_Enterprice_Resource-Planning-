"""a job's order category: Normal, Branch or Employee

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-11-07

Owner decision 2026-11-06 (JIM7): Jim2's Priority holds the order category —
a customer's order, a branch's own, or an employee's — where this app's
`priority` holds the urgency. Both are kept: `jobs.order_category`, Normal for
every job before this.

TIG's status ladder (docs/superpowers/specs/2026-11-07-tig-status-ladder.md)
adds the statuses Picked, Inco/Pick, ProdExt and Ready. `jobs.status` is a
plain string, so they need no change here.
"""

from alembic import op
import sqlalchemy as sa


revision = "f8a9b0c1d2e3"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "jobs",
        sa.Column(
            "order_category",
            sa.String(20),
            nullable=False,
            server_default="Normal",
        ),
    )


def downgrade():
    op.drop_column("jobs", "order_category")

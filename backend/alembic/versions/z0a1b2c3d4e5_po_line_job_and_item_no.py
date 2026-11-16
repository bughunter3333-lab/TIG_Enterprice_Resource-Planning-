"""po line job link, and the job channel marker

The two Jim2 fields the photographs made unavoidable.

`purchase_order_items.job_id` is the one that matters. Jim2's PO 2048001 has
eight lines spanning six different jobs, each line naming the job it is for,
and it was auto-created from a job. That is what makes a shortage answerable:
the Arcare simulation reported "35 units across 22 jobs" and there was no way
to raise one purchase order that remembered which job each unit belonged to.

`jobs.item_no` is Jim2's Item# -- NOP.ONLINE against SALE. It marks how the job
arrived: through the ordering portal, or keyed by a person. It is the field that
answers "how much of our volume is self-service", which is the number that
justifies building the portal at all.

Revision ID: z0a1b2c3d4e5
Revises: y9z0a1b2c3d4
"""

from alembic import op
import sqlalchemy as sa

revision = "z0a1b2c3d4e5"
down_revision = "y9z0a1b2c3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "purchase_order_items",
        sa.Column("job_id", sa.String(length=20), nullable=True),
    )
    op.create_index(
        "ix_purchase_order_items_job_id", "purchase_order_items", ["job_id"]
    )
    op.add_column("jobs", sa.Column("item_no", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("jobs", "item_no")
    op.drop_index("ix_purchase_order_items_job_id", table_name="purchase_order_items")
    op.drop_column("purchase_order_items", "job_id")

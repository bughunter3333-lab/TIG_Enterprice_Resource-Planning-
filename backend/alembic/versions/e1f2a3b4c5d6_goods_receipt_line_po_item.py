"""goods receipt lines: the PO line they are received against

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-10-25

A goods receipt line named only a SKU, and accepting it credited the first PO
line with that SKU — so a PO consolidated across jobs (two lines of one
embroidery code, one per job) never closed, and nothing said which job's line
the goods had arrived for (findings F03, F18). A receipt line may now name its
PO line; one that does not is spread across the PO's lines for the SKU.

Nullable, and nothing to backfill: receipts already accepted keep the credit
they were given.
"""

from alembic import op
import sqlalchemy as sa


revision = "e1f2a3b4c5d6"
down_revision = "d0e1f2a3b4c5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "goods_receipt_lines",
        sa.Column("po_item_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_goods_receipt_lines_po_item_id",
        "goods_receipt_lines",
        "purchase_order_items",
        ["po_item_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint(
        "fk_goods_receipt_lines_po_item_id", "goods_receipt_lines", type_="foreignkey"
    )
    op.drop_column("goods_receipt_lines", "po_item_id")

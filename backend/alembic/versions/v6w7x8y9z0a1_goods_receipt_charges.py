"""goods_receipt_charges — landed costs (freight/duty/customs) per receipt

Revision ID: v6w7x8y9z0a1
Revises: u5v6w7x8y9z0
Create Date: 2026-08-15
"""

from alembic import op
import sqlalchemy as sa

revision = "v6w7x8y9z0a1"
down_revision = "u5v6w7x8y9z0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "goods_receipt_charges",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "receipt_id",
            sa.Integer(),
            sa.ForeignKey("goods_receipts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("description", sa.String(length=100), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), server_default="0"),
        sa.Column("basis", sa.String(length=10), server_default="value"),
    )
    op.create_index(
        "ix_goods_receipt_charges_receipt_id",
        "goods_receipt_charges",
        ["receipt_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_goods_receipt_charges_receipt_id", table_name="goods_receipt_charges"
    )
    op.drop_table("goods_receipt_charges")

"""Phase 2a ERP fields — customer_group/territory, supplier ABN, PO GST columns

Revision ID: g1h2i3j4k5l6
Revises: d1e3f5a7b9c0
Create Date: 2026-05-21
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'g1h2i3j4k5l6'
down_revision: Union[str, None] = 'd1e3f5a7b9c0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Customer — segmentation fields
    op.add_column('customers', sa.Column('customer_group', sa.String(50), nullable=True, server_default='General'))
    op.add_column('customers', sa.Column('territory', sa.String(50), nullable=True))

    # Supplier — ABN
    op.add_column('suppliers', sa.Column('abn', sa.String(20), nullable=True))

    # PurchaseOrder — GST breakdown columns
    op.add_column('purchase_orders', sa.Column('total_ex', sa.Numeric(10, 2), nullable=True, server_default='0'))
    op.add_column('purchase_orders', sa.Column('tax_total', sa.Numeric(10, 2), nullable=True, server_default='0'))
    op.add_column('purchase_orders', sa.Column('total_inc', sa.Numeric(10, 2), nullable=True, server_default='0'))
    op.add_column('purchase_orders', sa.Column('bill_no', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('purchase_orders', 'bill_no')
    op.drop_column('purchase_orders', 'total_inc')
    op.drop_column('purchase_orders', 'tax_total')
    op.drop_column('purchase_orders', 'total_ex')

    op.drop_column('suppliers', 'abn')

    op.drop_column('customers', 'territory')
    op.drop_column('customers', 'customer_group')

"""Phase 3 ERP completion — invoice_date, payment ledger, reorder_qty, credit_hold

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6
Create Date: 2026-05-21
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'h2i3j4k5l6m7'
down_revision: Union[str, None] = 'g1h2i3j4k5l6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Job — compliance timestamps
    op.add_column('jobs', sa.Column('invoice_date', sa.String(20), nullable=True))
    op.add_column('jobs', sa.Column('payment_date', sa.String(20), nullable=True))
    op.add_column('jobs', sa.Column('dispatched_at', sa.String(20), nullable=True))

    # Customer — credit control
    op.add_column('customers', sa.Column('credit_hold', sa.Boolean, nullable=True, server_default='false'))
    op.add_column('customers', sa.Column('gst_registered', sa.Boolean, nullable=True, server_default='true'))

    # Supplier — GST status
    op.add_column('suppliers', sa.Column('gst_registered', sa.Boolean, nullable=True, server_default='true'))

    # InventoryItem — proper reorder quantities
    op.add_column('inventory', sa.Column('reorder_qty', sa.Integer, nullable=True, server_default='0'))
    op.add_column('inventory', sa.Column('on_order_qty', sa.Integer, nullable=True, server_default='0'))

    # PurchaseOrder — receiving and payment dates
    op.add_column('purchase_orders', sa.Column('due_date', sa.String(20), nullable=True))
    op.add_column('purchase_orders', sa.Column('received_date', sa.String(20), nullable=True))

    # Job payments ledger
    op.create_table(
        'job_payments',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('job_id', sa.String(20), sa.ForeignKey('jobs.id'), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('method', sa.String(50), server_default='Account'),
        sa.Column('reference', sa.String(100), nullable=True),
        sa.Column('received_date', sa.String(20), nullable=True),
        sa.Column('received_by', sa.String(100), nullable=True),
        sa.Column('notes', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_job_payments_job_id', 'job_payments', ['job_id'], if_not_exists=True)


def downgrade() -> None:
    op.drop_index('ix_job_payments_job_id', table_name='job_payments')
    op.drop_table('job_payments')

    op.drop_column('purchase_orders', 'received_date')
    op.drop_column('purchase_orders', 'due_date')

    op.drop_column('inventory', 'on_order_qty')
    op.drop_column('inventory', 'reorder_qty')

    op.drop_column('suppliers', 'gst_registered')

    op.drop_column('customers', 'gst_registered')
    op.drop_column('customers', 'credit_hold')

    op.drop_column('jobs', 'dispatched_at')
    op.drop_column('jobs', 'payment_date')
    op.drop_column('jobs', 'invoice_date')

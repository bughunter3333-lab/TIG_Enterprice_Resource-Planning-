"""Sprint F — Accounts Payable: supplier bills table

Revision ID: k5l6m7n8o9p0
Revises: j4k5l6m7n8o9
Create Date: 2026-05-27
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'k5l6m7n8o9p0'
down_revision: Union[str, None] = 'j4k5l6m7n8o9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'supplier_bills',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('supplier_id', sa.String(20), nullable=True),
        sa.Column('supplier_name', sa.String(100), nullable=True),
        sa.Column('po_id', sa.String(20), nullable=True),
        sa.Column('bill_number', sa.String(50), nullable=True),
        sa.Column('bill_date', sa.String(20), nullable=True),
        sa.Column('due_date', sa.String(20), nullable=True),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('amount_ex', sa.Numeric(10, 2), nullable=True, default=0),
        sa.Column('tax', sa.Numeric(10, 2), nullable=True, default=0),
        sa.Column('amount_inc', sa.Numeric(10, 2), nullable=True, default=0),
        sa.Column('status', sa.String(20), nullable=True, default='pending'),
        sa.Column('paid_date', sa.String(20), nullable=True),
        sa.Column('paid_amount', sa.Numeric(10, 2), nullable=True, default=0),
        sa.Column('notes', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['supplier_id'], ['suppliers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['po_id'], ['purchase_orders.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_supplier_bills_supplier_id', 'supplier_bills', ['supplier_id'])
    op.create_index('ix_supplier_bills_status', 'supplier_bills', ['status'])
    op.create_index('ix_supplier_bills_due_date', 'supplier_bills', ['due_date'])


def downgrade() -> None:
    op.drop_index('ix_supplier_bills_due_date', 'supplier_bills')
    op.drop_index('ix_supplier_bills_status', 'supplier_bills')
    op.drop_index('ix_supplier_bills_supplier_id', 'supplier_bills')
    op.drop_table('supplier_bills')

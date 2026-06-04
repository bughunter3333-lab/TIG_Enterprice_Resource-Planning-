"""add_job_customer_fields

Revision ID: a1f4e8c2d093
Revises: ce9231bf3b56
Create Date: 2026-04-25 09:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a1f4e8c2d093'
down_revision: Union[str, None] = 'ce9231bf3b56'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('jobs', sa.Column('payment_method', sa.String(50), nullable=True))
    op.add_column('jobs', sa.Column('shipping_address', sa.Text(), nullable=True))
    op.add_column('jobs', sa.Column('tax', sa.Numeric(10, 2), nullable=True, server_default='0'))

    op.add_column('customers', sa.Column('abn', sa.String(20), nullable=True))
    op.add_column('customers', sa.Column('mobile', sa.String(30), nullable=True))
    op.add_column('customers', sa.Column('payment_terms', sa.String(30), nullable=True))
    op.add_column('customers', sa.Column('account_manager', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('jobs', 'payment_method')
    op.drop_column('jobs', 'shipping_address')
    op.drop_column('jobs', 'tax')

    op.drop_column('customers', 'abn')
    op.drop_column('customers', 'mobile')
    op.drop_column('customers', 'payment_terms')
    op.drop_column('customers', 'account_manager')

"""Production fields — weight, committed stock, ship-to addresses, branch, fuel levy

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-05-21
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'i3j4k5l6m7n8'
down_revision: Union[str, None] = 'h2i3j4k5l6m7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # InventoryItem — warehouse tracking
    op.add_column('inventory', sa.Column('weight_kg', sa.Numeric(8, 3), nullable=True, server_default='0'))
    op.add_column('inventory', sa.Column('committed_qty', sa.Integer, nullable=True, server_default='0'))

    # Customer ship-to addresses (Ship# in Jim2)
    op.create_table(
        'customer_ship_tos',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('customer_id', sa.String(20), sa.ForeignKey('customers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('code', sa.String(20), nullable=False),
        sa.Column('name', sa.String(100)),
        sa.Column('address', sa.String(255)),
        sa.Column('city', sa.String(100)),
        sa.Column('state', sa.String(50)),
        sa.Column('postcode', sa.String(10)),
        sa.Column('country', sa.String(50), server_default='Australia'),
        sa.Column('is_default', sa.Boolean, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_customer_ship_tos_customer_id', 'customer_ship_tos', ['customer_id'])
    op.create_unique_constraint('uq_customer_ship_tos_code', 'customer_ship_tos', ['customer_id', 'code'])

    # Job — production / dispatch fields
    op.add_column('jobs', sa.Column('branch', sa.String(50), nullable=True, server_default='HQ'))
    op.add_column('jobs', sa.Column('ship_to_id', sa.Integer, sa.ForeignKey('customer_ship_tos.id'), nullable=True))
    op.add_column('jobs', sa.Column('weight_total', sa.Numeric(8, 3), nullable=True, server_default='0'))
    op.add_column('jobs', sa.Column('fuel_levy', sa.Numeric(10, 2), nullable=True, server_default='0'))

    # JobItem — weight per line
    op.add_column('job_items', sa.Column('weight_kg', sa.Numeric(8, 3), nullable=True, server_default='0'))


def downgrade() -> None:
    op.drop_column('job_items', 'weight_kg')

    op.drop_column('jobs', 'fuel_levy')
    op.drop_column('jobs', 'weight_total')
    op.drop_column('jobs', 'ship_to_id')
    op.drop_column('jobs', 'branch')

    op.drop_constraint('uq_customer_ship_tos_code', 'customer_ship_tos', type_='unique')
    op.drop_index('ix_customer_ship_tos_customer_id', table_name='customer_ship_tos')
    op.drop_table('customer_ship_tos')

    op.drop_column('inventory', 'committed_qty')
    op.drop_column('inventory', 'weight_kg')

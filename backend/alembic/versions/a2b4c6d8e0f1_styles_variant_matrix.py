"""styles variant matrix

Revision ID: a2b4c6d8e0f1
Revises: c0d2e4f6a8b1
Create Date: 2026-05-08

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a2b4c6d8e0f1'
down_revision: Union[str, None] = 'c0d2e4f6a8b1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'styles',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('code', sa.String(50), nullable=False, unique=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('category', sa.String(100)),
        sa.Column('brand', sa.String(100)),
        sa.Column('gender', sa.String(20)),
        sa.Column('season', sa.String(50)),
        sa.Column('collection', sa.String(100)),
        sa.Column('description', sa.Text()),
        sa.Column('base_purchase_price', sa.Numeric(10, 2), server_default='0'),
        sa.Column('base_sell_price', sa.Numeric(10, 2), server_default='0'),
        sa.Column('gst_applicable', sa.Boolean(), server_default='true'),
        sa.Column('image_url', sa.String(500)),
        sa.Column('notes', sa.Text()),
        sa.Column('active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_styles_code', 'styles', ['code'])

    op.create_table(
        'style_colours',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('style_id', sa.Integer(), sa.ForeignKey('styles.id'), nullable=False),
        sa.Column('code', sa.String(20), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('hex', sa.String(7)),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
    )

    op.create_table(
        'style_sizes',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('style_id', sa.Integer(), sa.ForeignKey('styles.id'), nullable=False),
        sa.Column('code', sa.String(20), nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
    )

    op.add_column('inventory', sa.Column('style_id', sa.Integer(), sa.ForeignKey('styles.id'), nullable=True))
    op.add_column('inventory', sa.Column('colour_code', sa.String(20), nullable=True))
    op.add_column('inventory', sa.Column('size_code', sa.String(20), nullable=True))
    op.create_index('ix_inventory_style_id', 'inventory', ['style_id'])


def downgrade() -> None:
    op.drop_index('ix_inventory_style_id', table_name='inventory')
    op.drop_column('inventory', 'size_code')
    op.drop_column('inventory', 'colour_code')
    op.drop_column('inventory', 'style_id')
    op.drop_table('style_sizes')
    op.drop_table('style_colours')
    op.drop_index('ix_styles_code', table_name='styles')
    op.drop_table('styles')

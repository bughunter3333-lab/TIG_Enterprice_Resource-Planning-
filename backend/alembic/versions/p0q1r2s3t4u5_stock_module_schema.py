"""stock_module_schema — stock_locations, stock_price_levels, stock_price_breakpoints, extend inventory + stock_movements

Revision ID: p0q1r2s3t4u5
Revises: o9p0q1r2s3t4
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = 'p0q1r2s3t4u5'
down_revision = 'o9p0q1r2s3t4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Extend inventory table with Jim2 item detail + cost tracking fields
    op.add_column('inventory', sa.Column('item_type', sa.String(30), nullable=True, server_default='Depleting'))
    op.add_column('inventory', sa.Column('gl_group', sa.String(100), nullable=True))
    op.add_column('inventory', sa.Column('barcode', sa.String(100), nullable=True))
    op.add_column('inventory', sa.Column('buy_unit', sa.String(20), nullable=True))
    op.add_column('inventory', sa.Column('sell_unit', sa.String(20), nullable=True))
    op.add_column('inventory', sa.Column('buy_tax_pct', sa.Numeric(5, 2), nullable=True, server_default='10'))
    op.add_column('inventory', sa.Column('sell_tax_pct', sa.Numeric(5, 2), nullable=True, server_default='10'))
    op.add_column('inventory', sa.Column('last_cost', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('last_cog', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('avg_cost', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('avg_cog', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('max_cog', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('last_po_cogs', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('avg_po_cogs', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('last_ex', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('last_effective_date', sa.String(20), nullable=True))
    op.add_column('inventory', sa.Column('price_template', sa.String(100), nullable=True))

    op.create_table(
        'stock_locations',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('sku', sa.String(50), sa.ForeignKey('inventory.sku', ondelete='CASCADE'), nullable=False),
        sa.Column('branch', sa.String(50), nullable=False),
        sa.Column('zone', sa.String(20), nullable=True),
        sa.Column('qty_on_hand', sa.Integer, nullable=False, server_default='0'),
        sa.Column('committed_qty', sa.Integer, nullable=False, server_default='0'),
        sa.Column('backorder_qty', sa.Integer, nullable=False, server_default='0'),
        sa.Column('on_po_qty', sa.Integer, nullable=False, server_default='0'),
        sa.Column('primary_bin_1', sa.String(50), nullable=True),
        sa.Column('max_qty_bin_1', sa.Integer, nullable=True),
        sa.Column('primary_bin_2', sa.String(50), nullable=True),
        sa.Column('max_qty_bin_2', sa.Integer, nullable=True),
        sa.UniqueConstraint('sku', 'branch', name='uq_stock_locations_sku_branch'),
    )
    op.create_index('ix_stock_locations_sku', 'stock_locations', ['sku'])

    op.create_table(
        'stock_price_levels',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('sku', sa.String(50), sa.ForeignKey('inventory.sku', ondelete='CASCADE'), nullable=False),
        sa.Column('price_level', sa.String(50), nullable=False),
        sa.Column('price_calc_method', sa.String(50), nullable=True, server_default='Fixed Price'),
        sa.Column('base_pl', sa.String(50), nullable=True),
        sa.Column('currency', sa.String(10), nullable=True, server_default='AUD'),
        sa.Column('tax_code', sa.String(10), nullable=True, server_default='G'),
        sa.UniqueConstraint('sku', 'price_level', name='uq_stock_price_levels_sku_level'),
    )
    op.create_index('ix_stock_price_levels_sku', 'stock_price_levels', ['sku'])

    op.create_table(
        'stock_price_breakpoints',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('price_level_id', sa.Integer, sa.ForeignKey('stock_price_levels.id', ondelete='CASCADE'), nullable=False),
        sa.Column('min_qty', sa.Integer, nullable=False, server_default='0'),
        sa.Column('price_ex', sa.Numeric(10, 4), nullable=False),
        sa.Column('price_inc', sa.Numeric(10, 4), nullable=False),
        sa.Column('pont_pct', sa.Numeric(5, 2), nullable=True),
    )

    # Extend stock_movements with optional FK links and location detail (all nullable)
    op.add_column('stock_movements', sa.Column('job_id', sa.String(20), sa.ForeignKey('jobs.id'), nullable=True))
    op.add_column('stock_movements', sa.Column('po_id', sa.String(50), sa.ForeignKey('purchase_orders.id'), nullable=True))
    op.add_column('stock_movements', sa.Column('po_line', sa.Integer, nullable=True))
    op.add_column('stock_movements', sa.Column('location_branch', sa.String(50), nullable=True))
    op.add_column('stock_movements', sa.Column('qty_bal', sa.Integer, nullable=True))
    op.add_column('stock_movements', sa.Column('pack_num', sa.String(50), nullable=True))
    op.add_column('stock_movements', sa.Column('bin', sa.String(50), nullable=True))
    op.add_column('stock_movements', sa.Column('link_tran_id', sa.Integer, sa.ForeignKey('stock_movements.id'), nullable=True))
    op.add_column('stock_movements', sa.Column('link_gl', sa.String(50), nullable=True))
    op.create_index('ix_stock_movements_job_id', 'stock_movements', ['job_id'])


def downgrade() -> None:
    op.drop_index('ix_stock_movements_job_id', table_name='stock_movements')
    op.drop_column('stock_movements', 'link_gl')
    op.drop_column('stock_movements', 'link_tran_id')
    op.drop_column('stock_movements', 'bin')
    op.drop_column('stock_movements', 'pack_num')
    op.drop_column('stock_movements', 'qty_bal')
    op.drop_column('stock_movements', 'location_branch')
    op.drop_column('stock_movements', 'po_line')
    op.drop_column('stock_movements', 'po_id')
    op.drop_column('stock_movements', 'job_id')
    op.drop_table('stock_price_breakpoints')
    op.drop_index('ix_stock_price_levels_sku', table_name='stock_price_levels')
    op.drop_table('stock_price_levels')
    op.drop_index('ix_stock_locations_sku', table_name='stock_locations')
    op.drop_table('stock_locations')
    op.drop_column('inventory', 'price_template')
    op.drop_column('inventory', 'last_effective_date')
    op.drop_column('inventory', 'last_ex')
    op.drop_column('inventory', 'avg_po_cogs')
    op.drop_column('inventory', 'last_po_cogs')
    op.drop_column('inventory', 'max_cog')
    op.drop_column('inventory', 'avg_cog')
    op.drop_column('inventory', 'avg_cost')
    op.drop_column('inventory', 'last_cog')
    op.drop_column('inventory', 'last_cost')
    op.drop_column('inventory', 'sell_tax_pct')
    op.drop_column('inventory', 'buy_tax_pct')
    op.drop_column('inventory', 'sell_unit')
    op.drop_column('inventory', 'buy_unit')
    op.drop_column('inventory', 'barcode')
    op.drop_column('inventory', 'gl_group')
    op.drop_column('inventory', 'item_type')

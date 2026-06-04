"""Sprint B — supplier price lists + goods receipts

Revision ID: j4k5l6m7n8o9
Revises: i3j4k5l6m7n8
Create Date: 2026-05-21
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'j4k5l6m7n8o9'
down_revision: Union[str, None] = 'i3j4k5l6m7n8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Supplier price lists ──────────────────────────────────────────────────
    op.create_table(
        'supplier_price_lists',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('supplier_id', sa.String(20), sa.ForeignKey('suppliers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sku', sa.String(50), nullable=False),
        sa.Column('description', sa.String(255)),
        sa.Column('unit_cost', sa.Numeric(10, 2), nullable=False),
        sa.Column('min_qty', sa.Integer(), default=1),
        sa.Column('currency', sa.String(10), default='AUD'),
        sa.Column('lead_time_days', sa.Integer()),
        sa.Column('valid_from', sa.String(20)),
        sa.Column('valid_to', sa.String(20)),
        sa.Column('notes', sa.String(255)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_supplier_price_lists_supplier_id', 'supplier_price_lists', ['supplier_id'])
    op.create_index('ix_supplier_price_lists_sku', 'supplier_price_lists', ['sku'])

    # ── Goods receipts (header) ───────────────────────────────────────────────
    op.create_table(
        'goods_receipts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('po_id', sa.String(20), sa.ForeignKey('purchase_orders.id', ondelete='SET NULL'), nullable=True),
        sa.Column('supplier_id', sa.String(20), sa.ForeignKey('suppliers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('supplier_name', sa.String(100)),
        sa.Column('received_date', sa.String(20), nullable=False),
        sa.Column('reference', sa.String(50)),
        sa.Column('status', sa.String(20), default='Pending'),
        sa.Column('notes', sa.String(500)),
        sa.Column('created_by', sa.String(50)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_goods_receipts_po_id', 'goods_receipts', ['po_id'])
    op.create_index('ix_goods_receipts_status', 'goods_receipts', ['status'])

    # ── Goods receipt lines ───────────────────────────────────────────────────
    op.create_table(
        'goods_receipt_lines',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('receipt_id', sa.Integer(), sa.ForeignKey('goods_receipts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sku', sa.String(50), nullable=False),
        sa.Column('description', sa.String(255)),
        sa.Column('qty_expected', sa.Integer(), default=0),
        sa.Column('qty_received', sa.Integer(), default=0),
        sa.Column('unit_cost', sa.Numeric(10, 2), default=0),
        sa.Column('condition', sa.String(20), default='Good'),
        sa.Column('notes', sa.String(255)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_goods_receipt_lines_receipt_id', 'goods_receipt_lines', ['receipt_id'])


def downgrade() -> None:
    op.drop_table('goods_receipt_lines')
    op.drop_table('goods_receipts')
    op.drop_table('supplier_price_lists')

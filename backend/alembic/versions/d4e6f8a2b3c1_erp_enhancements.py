"""ERP enhancements - job/item/comment new fields

Revision ID: d4e6f8a2b3c1
Revises: c3d5e7f9a1b2
Create Date: 2026-04-26
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd4e6f8a2b3c1'
down_revision: Union[str, None] = 'c3d5e7f9a1b2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Job header new fields
    op.add_column('jobs', sa.Column('payment_status', sa.String(20), nullable=True, server_default='unpaid'))
    op.add_column('jobs', sa.Column('commitment_date', sa.String(20), nullable=True))
    op.add_column('jobs', sa.Column('validity_date', sa.String(20), nullable=True))
    op.add_column('jobs', sa.Column('locked', sa.Boolean, nullable=True, server_default='false'))
    op.add_column('jobs', sa.Column('invoice_status', sa.String(20), nullable=True, server_default='not_invoiced'))

    # JobItem new fields
    op.add_column('job_items', sa.Column('sort', sa.Integer, nullable=True, server_default='0'))
    op.add_column('job_items', sa.Column('display_type', sa.String(20), nullable=True, server_default='product'))
    op.add_column('job_items', sa.Column('decoration_type', sa.String(30), nullable=True, server_default='None'))
    op.add_column('job_items', sa.Column('emb_code', sa.String(50), nullable=True))
    op.add_column('job_items', sa.Column('trs_code', sa.String(50), nullable=True))
    op.add_column('job_items', sa.Column('qty_delivered', sa.Integer, nullable=True, server_default='0'))
    op.add_column('job_items', sa.Column('qty_invoiced', sa.Integer, nullable=True, server_default='0'))
    op.add_column('job_items', sa.Column('purchase_price', sa.Numeric(10, 2), nullable=True, server_default='0'))
    op.add_column('job_items', sa.Column('margin', sa.Numeric(10, 2), nullable=True, server_default='0'))
    op.add_column('job_items', sa.Column('margin_percent', sa.Numeric(5, 2), nullable=True, server_default='0'))
    op.add_column('job_items', sa.Column('discount', sa.Numeric(5, 2), nullable=True, server_default='0'))

    # JobComment new fields
    op.add_column('job_comments', sa.Column('author_name', sa.String(100), nullable=True))
    op.add_column('job_comments', sa.Column('is_internal', sa.Boolean, nullable=True, server_default='false'))
    op.add_column('job_comments', sa.Column('pinned_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('job_comments', 'pinned_at')
    op.drop_column('job_comments', 'is_internal')
    op.drop_column('job_comments', 'author_name')

    op.drop_column('job_items', 'discount')
    op.drop_column('job_items', 'margin_percent')
    op.drop_column('job_items', 'margin')
    op.drop_column('job_items', 'purchase_price')
    op.drop_column('job_items', 'qty_invoiced')
    op.drop_column('job_items', 'qty_delivered')
    op.drop_column('job_items', 'trs_code')
    op.drop_column('job_items', 'emb_code')
    op.drop_column('job_items', 'decoration_type')
    op.drop_column('job_items', 'display_type')
    op.drop_column('job_items', 'sort')

    op.drop_column('jobs', 'invoice_status')
    op.drop_column('jobs', 'locked')
    op.drop_column('jobs', 'validity_date')
    op.drop_column('jobs', 'commitment_date')
    op.drop_column('jobs', 'payment_status')

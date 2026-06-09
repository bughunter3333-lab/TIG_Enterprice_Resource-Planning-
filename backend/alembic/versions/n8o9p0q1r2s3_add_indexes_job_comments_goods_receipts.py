"""add_indexes_job_comments_goods_receipts

Revision ID: n8o9p0q1r2s3
Revises: m7n8o9p0q1r2
Create Date: 2026-06-08
"""
from alembic import op
import sqlalchemy as sa

revision = 'n8o9p0q1r2s3'
down_revision = 'm7n8o9p0q1r2'
branch_labels = None
depends_on = None


def upgrade():
    # Create indexes added to models but missing in DB
    op.create_index('ix_job_comments_job_id', 'job_comments', ['job_id'])
    op.create_index('ix_goods_receipts_supplier_id', 'goods_receipts', ['supplier_id'])
    op.create_index('ix_goods_receipt_lines_sku', 'goods_receipt_lines', ['sku'])


def downgrade():
    op.drop_index('ix_goods_receipt_lines_sku', table_name='goods_receipt_lines')
    op.drop_index('ix_goods_receipts_supplier_id', table_name='goods_receipts')
    op.drop_index('ix_job_comments_job_id', table_name='job_comments')

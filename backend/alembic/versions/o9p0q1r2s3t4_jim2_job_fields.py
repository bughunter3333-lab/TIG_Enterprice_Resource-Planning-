"""jim2_job_fields — price_level, acc_mgr, invoice_desc, ex_job_ref, requested_by, lock_rate + admin_settings table

Revision ID: o9p0q1r2s3t4
Revises: n8o9p0q1r2s3
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa

revision = 'o9p0q1r2s3t4'
down_revision = 'n8o9p0q1r2s3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Jim2 job fields
    op.add_column('jobs', sa.Column('price_level', sa.String(50), nullable=True))
    op.add_column('jobs', sa.Column('acc_mgr', sa.String(100), nullable=True))
    op.add_column('jobs', sa.Column('invoice_desc', sa.Text(), nullable=True))
    op.add_column('jobs', sa.Column('ex_job_ref', sa.String(100), nullable=True))
    op.add_column('jobs', sa.Column('requested_by', sa.String(100), nullable=True))
    op.add_column('jobs', sa.Column('lock_rate', sa.Boolean(), nullable=True, server_default='false'))

    # Admin settings key-value store
    op.create_table(
        'admin_settings',
        sa.Column('key', sa.String(100), primary_key=True),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('admin_settings')
    op.drop_column('jobs', 'lock_rate')
    op.drop_column('jobs', 'requested_by')
    op.drop_column('jobs', 'ex_job_ref')
    op.drop_column('jobs', 'invoice_desc')
    op.drop_column('jobs', 'acc_mgr')
    op.drop_column('jobs', 'price_level')

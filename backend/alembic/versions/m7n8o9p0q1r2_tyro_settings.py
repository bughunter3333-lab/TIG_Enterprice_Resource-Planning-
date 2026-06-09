"""tyro_settings

Revision ID: m7n8o9p0q1r2
Revises: l6m7n8o9p0q1
Create Date: 2026-06-07
"""
from alembic import op
import sqlalchemy as sa

revision = 'm7n8o9p0q1r2'
down_revision = 'l6m7n8o9p0q1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('company_settings', sa.Column('tyro_merchant_id', sa.String(100), nullable=True))
    op.add_column('company_settings', sa.Column('tyro_terminal_id', sa.String(100), nullable=True))
    op.add_column('company_settings', sa.Column('tyro_environment', sa.String(20), server_default='sandbox', nullable=True))


def downgrade():
    op.drop_column('company_settings', 'tyro_environment')
    op.drop_column('company_settings', 'tyro_terminal_id')
    op.drop_column('company_settings', 'tyro_merchant_id')

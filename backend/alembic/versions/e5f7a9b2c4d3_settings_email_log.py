"""Add company_settings and email_log tables

Revision ID: e5f7a9b2c4d3
Revises: d4e6f8a2b3c1
Create Date: 2026-05-07
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision = 'e5f7a9b2c4d3'
down_revision = 'd4e6f8a2b3c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'company_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('company_name', sa.String(150), nullable=True),
        sa.Column('abn', sa.String(20), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('phone', sa.String(30), nullable=True),
        sa.Column('email', sa.String(100), nullable=True),
        sa.Column('website', sa.String(100), nullable=True),
        sa.Column('gst_rate', sa.Numeric(5, 2), server_default='10.0'),
        sa.Column('invoice_prefix', sa.String(10), server_default='INV'),
        sa.Column('quote_prefix', sa.String(10), server_default='QT'),
        sa.Column('bank_name', sa.String(100), nullable=True),
        sa.Column('bank_bsb', sa.String(10), nullable=True),
        sa.Column('bank_account', sa.String(20), nullable=True),
        sa.Column('bank_account_name', sa.String(100), nullable=True),
        sa.Column('payment_terms_default', sa.String(50), server_default='Net 30'),
        sa.Column('smtp_host', sa.String(100), nullable=True),
        sa.Column('smtp_port', sa.Integer(), server_default='587'),
        sa.Column('smtp_user', sa.String(100), nullable=True),
        sa.Column('smtp_password', sa.String(200), nullable=True),
        sa.Column('smtp_from_name', sa.String(100), nullable=True),
        sa.Column('smtp_use_tls', sa.Boolean(), server_default='true'),
    )
    op.create_table(
        'email_log',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('sent_at', sa.String(30), nullable=True),
        sa.Column('to_email', sa.String(200), nullable=True),
        sa.Column('subject', sa.String(200), nullable=True),
        sa.Column('job_id', sa.String(20), nullable=True),
        sa.Column('email_type', sa.String(20), nullable=True),
        sa.Column('status', sa.String(20), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('sent_by', sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('email_log')
    op.drop_table('company_settings')

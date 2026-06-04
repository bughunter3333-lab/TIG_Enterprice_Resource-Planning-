"""card_files table

Revision ID: e2a4f8b1c9d6
Revises: f3a7c9e1b042
Create Date: 2026-04-25
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e2a4f8b1c9d6'
down_revision: Union[str, None] = 'f3a7c9e1b042'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'card_files',
        sa.Column('ship_code', sa.String(30), primary_key=True),
        sa.Column('customer_code', sa.String(30), nullable=False),
        sa.Column('company_name', sa.String(100), nullable=True),
        sa.Column('contact_name', sa.String(100), nullable=True),
        sa.Column('address1', sa.String(255), nullable=True),
        sa.Column('address2', sa.String(255), nullable=True),
        sa.Column('suburb', sa.String(100), nullable=True),
        sa.Column('state', sa.String(50), nullable=True),
        sa.Column('postcode', sa.String(10), nullable=True),
        sa.Column('country', sa.String(50), server_default='AU', nullable=True),
        sa.Column('phone', sa.String(30), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('card_files')

"""open_freight account and parcel types

Revision ID: c3d5e7f9a1b2
Revises: e2a4f8b1c9d6
Create Date: 2026-04-25
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c3d5e7f9a1b2'
down_revision: Union[str, None] = 'e2a4f8b1c9d6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'open_freight_account',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('account_number', sa.String(50), nullable=True),
        sa.Column('account_name', sa.String(100), nullable=True),
        sa.Column('depot', sa.String(100), nullable=True),
        sa.Column('contact_name', sa.String(100), nullable=True),
        sa.Column('contact_phone', sa.String(30), nullable=True),
        sa.Column('contact_email', sa.String(255), nullable=True),
        sa.Column('api_key', sa.String(255), nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    op.create_table(
        'open_freight_parcels',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('parcel_type', sa.String(30), nullable=True),   # Satchel, Box, Envelope, Pallet
        sa.Column('service', sa.String(50), nullable=True),        # Standard, Express, Overnight
        sa.Column('carrier_code', sa.String(50), nullable=True),
        sa.Column('max_weight_kg', sa.Numeric(8, 3), nullable=True),
        sa.Column('length_cm', sa.Numeric(8, 1), nullable=True),
        sa.Column('width_cm', sa.Numeric(8, 1), nullable=True),
        sa.Column('height_cm', sa.Numeric(8, 1), nullable=True),
        sa.Column('rate', sa.Numeric(10, 2), nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('open_freight_parcels')
    op.drop_table('open_freight_account')

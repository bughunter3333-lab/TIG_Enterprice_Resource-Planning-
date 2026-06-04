"""proof_status

Revision ID: b1c3e5d7f9a0
Revises: d4e6f8a2b3c1
Create Date: 2026-05-08

"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b1c3e5d7f9a0'
down_revision: Union[str, None] = 'd4e6f8a2b3c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('jobs', sa.Column('proof_status', sa.String(20), nullable=True, server_default='none'))
    op.add_column('jobs', sa.Column('proof_notes', sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column('jobs', 'proof_notes')
    op.drop_column('jobs', 'proof_status')

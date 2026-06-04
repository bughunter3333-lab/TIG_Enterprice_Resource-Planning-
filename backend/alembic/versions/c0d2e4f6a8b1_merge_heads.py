"""merge heads

Revision ID: c0d2e4f6a8b1
Revises: b1c3e5d7f9a0, e5f7a9b2c4d3
Create Date: 2026-05-08

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'c0d2e4f6a8b1'
down_revision: tuple = ('b1c3e5d7f9a0', 'e5f7a9b2c4d3')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

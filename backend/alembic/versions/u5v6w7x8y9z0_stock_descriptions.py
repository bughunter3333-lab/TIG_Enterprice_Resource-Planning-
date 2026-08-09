"""stock descriptions — Jim2 Descriptions tab (extended / web / care)

Revision ID: u5v6w7x8y9z0
Revises: t4u5v6w7x8y9
Create Date: 2026-07-26
"""

from alembic import op
import sqlalchemy as sa

revision = "u5v6w7x8y9z0"
down_revision = "t4u5v6w7x8y9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inventory", sa.Column("desc_extended", sa.Text(), nullable=True))
    op.add_column("inventory", sa.Column("desc_web", sa.Text(), nullable=True))
    op.add_column("inventory", sa.Column("desc_care", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("inventory", "desc_care")
    op.drop_column("inventory", "desc_web")
    op.drop_column("inventory", "desc_extended")

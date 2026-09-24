"""per-account login lockout

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-24

The rate limiter's own docstring said "the control that actually holds is the
per-account lockout". There was none. The IP limit is keyed on the address a
request arrives from, so an attacker who spreads guesses across addresses gets a
fresh allowance with each one, and the admin account — which has no second
factor — could be guessed at without limit. These two columns are the lockout
that docstring assumed existed.
"""

from alembic import op
import sqlalchemy as sa


revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column(
            "failed_login_count", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade():
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_login_count")

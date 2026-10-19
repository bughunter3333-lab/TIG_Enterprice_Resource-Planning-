"""users.must_change_password: a password an admin chose is replaced on first use

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-10-19

An admin types the first password of every new account, and the new one when
they reset a password, so until the person picks their own it is known to two
people. The flag is set by those two paths and cleared when the person changes
their password; while it is set, the API answers nothing but who they are and
the change itself.

Accounts that exist already chose their own password or have been using the one
they were given; they are not asked again.
"""

from alembic import op
import sqlalchemy as sa


revision = "a7b8c9d0e1f2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade():
    op.drop_column("users", "must_change_password")

"""dispatch_sessions — recorded despatch batches (Jim2 Dispatch #)

Revision ID: t4u5v6w7x8y9
Revises: s3t4u5v6w7x8
Create Date: 2026-07-18
"""

from alembic import op
import sqlalchemy as sa

revision = "t4u5v6w7x8y9"
down_revision = "s3t4u5v6w7x8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dispatch_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_table(
        "dispatch_session_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "session_id",
            sa.Integer(),
            sa.ForeignKey("dispatch_sessions.id"),
            nullable=False,
        ),
        sa.Column("job_id", sa.String(length=20), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("customer_name", sa.String(length=255), nullable=True),
        sa.Column("ship_via", sa.String(length=100), nullable=True),
        sa.Column("ship_ref", sa.String(length=100), nullable=True),
        sa.Column("cartons", sa.Integer(), server_default="1"),
    )
    op.create_index(
        "ix_dispatch_session_lines_session_id",
        "dispatch_session_lines",
        ["session_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_dispatch_session_lines_session_id", table_name="dispatch_session_lines"
    )
    op.drop_table("dispatch_session_lines")
    op.drop_table("dispatch_sessions")

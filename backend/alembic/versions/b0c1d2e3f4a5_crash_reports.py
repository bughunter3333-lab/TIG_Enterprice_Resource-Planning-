"""crash reports: what broke, for whom, with what they saw

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-11-08

docs/superpowers/specs/2026-11-08-crash-reports.md: a crash, an uncaught
error, a server error or a person's own report, with the steps before it and,
when sent by the person, a screenshot. Admins read them; anyone signed in sends
them. A new table, so it gets row-level security like every table since
b8c9d0e1f2a3 (the API reaches it through its own role, never through the
Supabase client).
"""

from alembic import op
import sqlalchemy as sa


revision = "b0c1d2e3f4a5"
down_revision = "a9b0c1d2e3f4"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "crash_reports",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("auto", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("stack", sa.Text(), nullable=True),
        sa.Column("component_stack", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("url", sa.String(500), nullable=True),
        sa.Column("module", sa.String(50), nullable=True),
        sa.Column("job_id", sa.String(20), nullable=True),
        sa.Column("app_build", sa.String(60), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("viewport", sa.String(20), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("breadcrumbs", sa.Text(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("username", sa.String(100), nullable=True),
        sa.Column("role", sa.String(20), nullable=True),
        sa.Column("screenshot", sa.LargeBinary(), nullable=True),
        sa.Column("screenshot_type", sa.String(20), nullable=True),
        sa.Column("details_added_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status", sa.String(20), nullable=False, server_default=sa.text("'new'")
        ),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column("emailed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_crash_reports_created_at", "crash_reports", ["created_at"])
    op.create_index("ix_crash_reports_fingerprint", "crash_reports", ["fingerprint"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE public.crash_reports ENABLE ROW LEVEL SECURITY")


def downgrade():
    op.drop_index("ix_crash_reports_fingerprint", "crash_reports")
    op.drop_index("ix_crash_reports_created_at", "crash_reports")
    op.drop_table("crash_reports")

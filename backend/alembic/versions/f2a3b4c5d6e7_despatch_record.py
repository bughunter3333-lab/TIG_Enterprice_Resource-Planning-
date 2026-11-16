"""despatch record: the connote on the job, and where each despatch went

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-10-25

Despatching a job wrote the carrier and consignment note into a comment and
nothing else, and the despatch line did not say where the goods were sent
(finding F22). The job now carries `ship_via` and `connote`, and each despatch
line the ship-to code and the address as they stood that day — a job's ship-to
can be changed afterwards; a despatch cannot.

Nullable, nothing to backfill: past despatches keep their comment.
"""

from alembic import op
import sqlalchemy as sa


revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("jobs", sa.Column("ship_via", sa.String(length=100), nullable=True))
    op.add_column("jobs", sa.Column("connote", sa.String(length=100), nullable=True))
    op.add_column(
        "dispatch_session_lines",
        sa.Column("ship_to", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "dispatch_session_lines", sa.Column("address", sa.Text(), nullable=True)
    )


def downgrade():
    op.drop_column("dispatch_session_lines", "address")
    op.drop_column("dispatch_session_lines", "ship_to")
    op.drop_column("jobs", "connote")
    op.drop_column("jobs", "ship_via")

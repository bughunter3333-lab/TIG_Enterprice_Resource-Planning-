"""where a garment is on the floor: the production board's hand-offs

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-11-07

Roadmap Phase 1, the production board
(docs/superpowers/specs/2026-11-07-production-board.md): a garment line handed
to a lane — picking, embroidery, print, packing or an outside decorator — keeps
the lane (job_items.station), the person given it (station_holder) and when
(station_at). Every line before this is not handed off: the board places it
where its work is. Nothing here touches status, stock or money.
"""

from alembic import op
import sqlalchemy as sa


revision = "a9b0c1d2e3f4"
down_revision = "f8a9b0c1d2e3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("job_items", sa.Column("station", sa.String(40), nullable=True))
    op.add_column(
        "job_items", sa.Column("station_holder", sa.String(50), nullable=True)
    )
    op.add_column(
        "job_items",
        sa.Column("station_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("job_items", "station_at")
    op.drop_column("job_items", "station_holder")
    op.drop_column("job_items", "station")

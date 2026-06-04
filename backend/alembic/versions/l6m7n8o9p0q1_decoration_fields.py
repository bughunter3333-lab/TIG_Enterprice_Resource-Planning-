"""decoration fields — stitch_count, color_count, dec_position

Revision ID: l6m7n8o9p0q1
Revises: k5l6m7n8o9p0
Create Date: 2026-06-04

Industry-standard decoration tracking fields added to job_items:
  - stitch_count  (INT)  — embroidery pricing basis (cost per 1,000 stitches)
  - color_count   (INT)  — screen/DTF/DTG color count (setup fee per color)
  - dec_position  (STR)  — placement: Chest, Back, L.Sleeve, R.Sleeve, Cap, etc.
"""
from alembic import op
import sqlalchemy as sa

revision = 'l6m7n8o9p0q1'
down_revision = 'k5l6m7n8o9p0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('job_items', sa.Column('stitch_count', sa.Integer(), nullable=True))
    op.add_column('job_items', sa.Column('color_count', sa.Integer(), nullable=True))
    op.add_column('job_items', sa.Column('dec_position', sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column('job_items', 'dec_position')
    op.drop_column('job_items', 'color_count')
    op.drop_column('job_items', 'stitch_count')

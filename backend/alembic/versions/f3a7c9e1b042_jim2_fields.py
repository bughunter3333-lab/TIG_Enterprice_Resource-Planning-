"""jim2_fields

Revision ID: f3a7c9e1b042
Revises: a1f4e8c2d093
Create Date: 2026-04-25 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'f3a7c9e1b042'
down_revision: Union[str, None] = 'a1f4e8c2d093'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Job header fields from Jim2
    op.add_column('jobs', sa.Column('cust_ref', sa.String(100), nullable=True))
    op.add_column('jobs', sa.Column('our_ref', sa.String(100), nullable=True))
    op.add_column('jobs', sa.Column('description', sa.String(200), nullable=True))
    op.add_column('jobs', sa.Column('ship_to', sa.String(100), nullable=True))
    op.add_column('jobs', sa.Column('project_no', sa.String(50), nullable=True))
    op.add_column('jobs', sa.Column('serial_no', sa.String(100), nullable=True))
    op.add_column('jobs', sa.Column('name_contact', sa.String(100), nullable=True))

    # Job item fields from Jim2
    op.add_column('job_items', sa.Column('b_ord', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('job_items', sa.Column('qty_pick', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('job_items', sa.Column('hide', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('job_items', sa.Column('tax_type', sa.String(5), nullable=True))
    op.add_column('job_items', sa.Column('item_status', sa.String(30), nullable=True))
    op.add_column('job_items', sa.Column('po_no', sa.String(50), nullable=True))
    op.add_column('job_items', sa.Column('po_due', sa.String(20), nullable=True))

    # Job comment fields from Jim2
    op.add_column('job_comments', sa.Column('inc', sa.Boolean(), nullable=True, server_default='false'))


def downgrade() -> None:
    op.drop_column('jobs', 'cust_ref')
    op.drop_column('jobs', 'our_ref')
    op.drop_column('jobs', 'description')
    op.drop_column('jobs', 'ship_to')
    op.drop_column('jobs', 'project_no')
    op.drop_column('jobs', 'serial_no')
    op.drop_column('jobs', 'name_contact')

    op.drop_column('job_items', 'b_ord')
    op.drop_column('job_items', 'qty_pick')
    op.drop_column('job_items', 'hide')
    op.drop_column('job_items', 'tax_type')
    op.drop_column('job_items', 'item_status')
    op.drop_column('job_items', 'po_no')
    op.drop_column('job_items', 'po_due')

    op.drop_column('job_comments', 'inc')

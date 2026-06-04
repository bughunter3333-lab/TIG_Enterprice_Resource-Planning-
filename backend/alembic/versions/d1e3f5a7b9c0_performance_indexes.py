"""performance indexes

Revision ID: d1e3f5a7b9c0
Revises: a2b4c6d8e0f1
Create Date: 2026-05-15

"""
from typing import Union
from alembic import op

revision: str = 'd1e3f5a7b9c0'
down_revision: Union[str, None] = 'a2b4c6d8e0f1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index('ix_jobs_customer_id',    'jobs',            ['customer_id'])
    op.create_index('ix_jobs_status',         'jobs',            ['status'])
    op.create_index('ix_job_items_job_id',    'job_items',       ['job_id'])
    op.create_index('ix_job_items_stock_code','job_items',       ['stock_code'])
    op.create_index('ix_job_items_po_no',     'job_items',       ['po_no'])
    op.create_index('ix_customers_status',    'customers',       ['status'])
    op.create_index('ix_suppliers_status',    'suppliers',       ['status'])
    op.create_index('ix_po_supplier_id',      'purchase_orders', ['supplier_id'])
    op.create_index('ix_po_status',           'purchase_orders', ['status'])
    op.create_index('ix_inventory_status',    'inventory',       ['status'])


def downgrade() -> None:
    op.drop_index('ix_inventory_status',    table_name='inventory')
    op.drop_index('ix_po_status',           table_name='purchase_orders')
    op.drop_index('ix_po_supplier_id',      table_name='purchase_orders')
    op.drop_index('ix_suppliers_status',    table_name='suppliers')
    op.drop_index('ix_customers_status',    table_name='customers')
    op.drop_index('ix_job_items_po_no',     table_name='job_items')
    op.drop_index('ix_job_items_stock_code',table_name='job_items')
    op.drop_index('ix_job_items_job_id',    table_name='job_items')
    op.drop_index('ix_jobs_status',         table_name='jobs')
    op.drop_index('ix_jobs_customer_id',    table_name='jobs')

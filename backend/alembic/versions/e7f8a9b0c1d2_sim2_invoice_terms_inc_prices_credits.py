"""invoice terms and due date, lines priced inc GST, supplier credit notes

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-11-02

From the 2026-11-01 simulation (docs/backlog.md, SIM2):

- S2-13: an invoice keeps the terms it was issued on and the day it falls due
  by them (jobs.invoice_terms, jobs.invoice_due_date). Invoices issued before
  this carry neither; aged receivables and the PDF work them out as before.
- S2-08: a line priced inc GST — the online store's shelf price — totals its
  inc price to the cent (job_items.priced_inc). Every line before this was
  priced ex GST, so it is false for all of them.
- S2-09: a supplier's credit note applied against one of its bills
  (supplier_bills.applied_to_bill_id).
- B1-07: a consignment's despatch date (dispatch_session_lines.despatch_date),
  today unless it goes later — after the carrier's cut-off. Despatches before
  this carry none; their notes print the session's day as before.
- S2-01: a job saved with no customer name takes its customer's, as a job
  booked from now on does. The online store never sent one, so its jobs'
  invoices named no buyer and aged receivables listed them as 'Unknown'.
"""

from alembic import op
import sqlalchemy as sa


revision = "e7f8a9b0c1d2"
down_revision = "d6e7f8a9b0c1"
branch_labels = None
depends_on = None

# A job with no customer name of its own takes its customer's (S2-01).
FILL_CUSTOMER_NAMES = """
    UPDATE jobs
    SET customer_name = (
        SELECT customers.name FROM customers WHERE customers.id = jobs.customer_id
    )
    WHERE (customer_name IS NULL OR TRIM(customer_name) = '')
      AND customer_id IS NOT NULL
"""


def upgrade():
    op.add_column("jobs", sa.Column("invoice_terms", sa.String(30), nullable=True))
    op.add_column("jobs", sa.Column("invoice_due_date", sa.String(20), nullable=True))
    op.add_column(
        "job_items",
        sa.Column("priced_inc", sa.Boolean(), nullable=True, server_default=sa.false()),
    )
    op.add_column(
        "supplier_bills",
        sa.Column("applied_to_bill_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_supplier_bills_applied_to_bill_id",
        "supplier_bills",
        "supplier_bills",
        ["applied_to_bill_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_supplier_bills_applied_to_bill_id",
        "supplier_bills",
        ["applied_to_bill_id"],
    )
    op.add_column(
        "dispatch_session_lines",
        sa.Column("despatch_date", sa.String(20), nullable=True),
    )
    op.execute(FILL_CUSTOMER_NAMES)


def downgrade():
    # The customer names filled in are left: they are the customers' own.
    op.drop_column("dispatch_session_lines", "despatch_date")
    op.drop_index("ix_supplier_bills_applied_to_bill_id", "supplier_bills")
    op.drop_constraint(
        "fk_supplier_bills_applied_to_bill_id", "supplier_bills", type_="foreignkey"
    )
    op.drop_column("supplier_bills", "applied_to_bill_id")
    op.drop_column("job_items", "priced_inc")
    op.drop_column("jobs", "invoice_due_date")
    op.drop_column("jobs", "invoice_terms")

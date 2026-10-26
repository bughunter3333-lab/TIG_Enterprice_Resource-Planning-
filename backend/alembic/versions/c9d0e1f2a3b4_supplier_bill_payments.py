"""supplier bill payments: one row per payment, so part-payments add up

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-10-25

Paying a bill used to overwrite `supplier_bills.paid_amount` and mark the bill
paid, however much was paid: a $184.25 bill paid as $100 then $84.25 finished
with $84.25 recorded and one ledger entry for $84.25 (simulation finding F07).
Each payment is now a row of its own, posted to the ledger on its own date, and
the bill's paid_amount is their sum.

What is already there is carried over as it stands, not reinterpreted:

- a bill marked paid with an amount becomes one payment of that amount, and its
  existing ledger entry (source 'bill_payment', keyed by the bill) is re-keyed
  to that payment, so nothing is posted twice and nothing is reversed;
- a paid bill whose payment does not cover it — the overwritten part-payments —
  is reopened as 'approved', so what is still owed shows as owed instead of
  hiding behind 'paid';
- an amount on a bill that is not marked paid was never posted (the old ledger
  only posted paid bills), so it is cleared, to agree with the ledger.

Row level security is on for the new table, like every other (b8c9d0e1f2a3).
"""

from datetime import date

from alembic import op
import sqlalchemy as sa


revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None

CARRIED_OVER_BY = "Carried over (before part-payments)"


def carry_over_existing_payments(bind) -> None:
    """The data half of the upgrade; separate so it can be run against SQLite."""
    bind.execute(
        sa.text(
            "INSERT INTO supplier_bill_payments (bill_id, amount, paid_date, paid_by) "
            "SELECT id, paid_amount, paid_date, :who FROM supplier_bills "
            "WHERE status = 'paid' AND paid_amount > 0"
        ),
        {"who": CARRIED_OVER_BY},
    )
    # Before this, a bill had at most one payment, so each bill maps to exactly
    # one row. Reversals carry their original's source, and are re-keyed with it.
    bind.execute(
        sa.text(
            "UPDATE journal_entries SET source_type = 'supplier_payment', "
            "source_id = (SELECT CAST(p.id AS VARCHAR(40)) "
            "  FROM supplier_bill_payments p "
            "  WHERE CAST(p.bill_id AS VARCHAR(40)) = journal_entries.source_id) "
            "WHERE source_type = 'bill_payment' AND EXISTS ("
            "  SELECT 1 FROM supplier_bill_payments p "
            "  WHERE CAST(p.bill_id AS VARCHAR(40)) = journal_entries.source_id)"
        )
    )
    bind.execute(
        sa.text(
            "UPDATE supplier_bills SET paid_amount = 0, paid_date = NULL "
            "WHERE status <> 'paid' AND paid_amount <> 0"
        )
    )
    bind.execute(
        sa.text(
            "UPDATE supplier_bills SET status = 'approved' "
            "WHERE status = 'paid' AND COALESCE(paid_amount, 0) < CASE "
            "  WHEN COALESCE(amount_inc, 0) <> 0 THEN amount_inc "
            "  ELSE COALESCE(amount_ex, 0) + COALESCE(tax, 0) END"
        )
    )


def upgrade():
    op.create_table(
        "supplier_bill_payments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("bill_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("paid_date", sa.String(length=20), nullable=True),
        sa.Column("reference", sa.String(length=100), nullable=True),
        sa.Column("paid_by", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["bill_id"], ["supplier_bills.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_supplier_bill_payments_bill_id", "supplier_bill_payments", ["bill_id"]
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "ALTER TABLE public.supplier_bill_payments ENABLE ROW LEVEL SECURITY"
        )
    carry_over_existing_payments(op.get_bind())


def _new_entry(bind, *, memo, source_type, source_id, reverses_id=None) -> int:
    return bind.execute(
        sa.text(
            "INSERT INTO journal_entries "
            "(entry_date, memo, source_type, source_id, reverses_id, created_by) "
            "VALUES (:entry_date, :memo, :source_type, :source_id, :reverses_id, "
            ":created_by) RETURNING id"
        ).bindparams(sa.bindparam("entry_date", type_=sa.Date)),
        {
            "entry_date": date.today(),
            "memo": memo[:255],
            "source_type": source_type,
            "source_id": source_id,
            "reverses_id": reverses_id,
            "created_by": "System",
        },
    ).scalar_one()


def _collapse(bind, bill_id: int, payment_ids: list) -> None:
    """Reverse each payment's standing entry and post one for the bill, as the
    old code's own sync would on finding the bill's entry out of date. All of
    it is dated today, where it nets to nothing: every earlier day keeps the
    payments it had."""
    standing = (
        bind.execute(
            sa.text(
                "SELECT id, source_id FROM journal_entries "
                "WHERE source_type = 'supplier_payment' AND source_id IN :ids "
                "AND reverses_id IS NULL AND reversed_by_id IS NULL ORDER BY id"
            ).bindparams(sa.bindparam("ids", expanding=True)),
            {"ids": payment_ids},
        )
        .tuples()
        .all()
    )
    if not standing:
        return
    number = bind.execute(
        sa.text("SELECT bill_number FROM supplier_bills WHERE id = :id"),
        {"id": bill_id},
    ).scalar_one()
    label = f"Payment of bill {number or bill_id}"
    for entry_id, source_id in standing:
        mirror = _new_entry(
            bind,
            memo=f"Reversal of JE-{entry_id:06d}: collapsed into one entry for "
            f"bill {number or bill_id} (downgrade)",
            source_type="supplier_payment",
            source_id=source_id,
            reverses_id=entry_id,
        )
        bind.execute(
            sa.text(
                "INSERT INTO journal_lines (entry_id, account_id, debit, credit, "
                "description, party_type, party_id, job_id) "
                "SELECT :mirror, account_id, credit, debit, description, "
                "party_type, party_id, job_id FROM journal_lines "
                "WHERE entry_id = :entry"
            ),
            {"mirror": mirror, "entry": entry_id},
        )
        bind.execute(
            sa.text(
                "UPDATE journal_entries SET reversed_by_id = :mirror WHERE id = :id"
            ),
            {"mirror": mirror, "id": entry_id},
        )
    combined = _new_entry(
        bind,
        memo=f"Paid bill {number or bill_id}",
        source_type="bill_payment",
        source_id=str(bill_id),
    )
    # The payments' lines summed per account and party: the payable debited and
    # the bank credited by the bill's paid amount, as `bill_payment_lines` did.
    bind.execute(
        sa.text(
            "INSERT INTO journal_lines (entry_id, account_id, debit, credit, "
            "description, party_type, party_id, job_id) "
            "SELECT :combined, account_id, SUM(debit), SUM(credit), :label, "
            "party_type, party_id, job_id FROM journal_lines "
            "WHERE entry_id IN :entries "
            "GROUP BY account_id, party_type, party_id, job_id"
        ).bindparams(sa.bindparam("entries", expanding=True)),
        {
            "combined": combined,
            "label": label,
            "entries": [entry_id for entry_id, _ in standing],
        },
    )


def restore_one_entry_per_bill(bind) -> None:
    """The data half of the downgrade; separate so it can be run against SQLite.

    The old code keeps one 'bill_payment' entry per paid bill, keyed by the
    bill, for its paid amount, and posts again when it finds none. So a paid
    bill's payments go back to being that one entry: re-keyed when there is
    one payment, collapsed into one when there are several — left as they
    were, the old code saw no entry for the bill and posted its payment again.

    A bill that is not paid has no payment entry in the old shape, and the old
    code reverses one it finds. Its part-payments stay as they stand under
    'supplier_payment', which the old code neither reads nor reverses: the
    cash that left stays in the ledger, and the old health check shows it as a
    payables difference instead of it being lost on the bill's next save.
    """
    rows = bind.execute(
        sa.text(
            "SELECT p.bill_id, p.id FROM supplier_bill_payments p "
            "JOIN supplier_bills b ON b.id = p.bill_id "
            "WHERE b.status = 'paid' ORDER BY p.bill_id, p.id"
        )
    ).all()
    payments: dict = {}
    for bill_id, payment_id in rows:
        payments.setdefault(bill_id, []).append(str(payment_id))
    for bill_id, payment_ids in payments.items():
        if len(payment_ids) > 1:
            _collapse(bind, bill_id, payment_ids)
            continue
        # Reversals carry their original's source, and are re-keyed with it.
        bind.execute(
            sa.text(
                "UPDATE journal_entries SET source_type = 'bill_payment', "
                "source_id = :bill WHERE source_type = 'supplier_payment' "
                "AND source_id = :payment"
            ),
            {"bill": str(bill_id), "payment": payment_ids[0]},
        )


def downgrade():
    restore_one_entry_per_bill(op.get_bind())
    op.drop_index(
        "ix_supplier_bill_payments_bill_id", table_name="supplier_bill_payments"
    )
    op.drop_table("supplier_bill_payments")

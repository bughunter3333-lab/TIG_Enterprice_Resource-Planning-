"""adopt the warehouse's own branch codes

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-09-07

`BRANCHES` used to hold six invented names. The real ten were read off the live
system, and only one of the six was ever both written to a row and spelled
differently: `Melbourne`, which `seed_data.py` placed stock at, and which the
warehouse calls `MELB`.

Everything else needs no data change. `HQ` is spelled the same in both lists,
and `Warehouse`, `Sydney`, `Brisbane` and `Perth` were never written anywhere —
so dropping them from the vocabulary moves nothing.

Any branch value this migration does not name is left exactly as it is. An
unrecognised branch is a place we hold stock and have no label for; renaming it
to the nearest guess would point every lookup at a different row and make the
stock at the real one invisible. It shows in the Locations grid as an extra row
until somebody decides what it should be called.

Portable ops only — this file runs on SQLite in tests and PostgreSQL in
production.
"""

from alembic import op
import sqlalchemy as sa


revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None

# `stock_locations` is unique on (sku, branch), so a SKU that already has a
# `MELB` row cannot simply have its `Melbourne` row renamed onto it. They are
# the same shelf under two spellings, so the quantities are added together and
# the duplicate removed.
QTY_COLUMNS = ("qty_on_hand", "committed_qty", "backorder_qty", "on_po_qty")

# Every other table stores a branch as a plain label with no uniqueness to
# violate, so a straight update is enough.
PLAIN_RENAMES = (
    ("jobs", "branch"),
    ("goods_receipts", "branch"),
    ("stock_movements", "location_branch"),
    ("stock_audit", "branch"),
)


def upgrade():
    bind = op.get_bind()

    sums = ", ".join(
        f"{col} = {col} + COALESCE(("
        f"SELECT dup.{col} FROM stock_locations dup "
        f"WHERE dup.sku = stock_locations.sku AND dup.branch = 'Melbourne'), 0)"
        for col in QTY_COLUMNS
    )
    bind.execute(
        sa.text(
            f"UPDATE stock_locations SET {sums} "
            "WHERE branch = 'MELB' AND EXISTS ("
            "SELECT 1 FROM stock_locations dup "
            "WHERE dup.sku = stock_locations.sku AND dup.branch = 'Melbourne')"
        )
    )
    bind.execute(
        sa.text(
            "DELETE FROM stock_locations WHERE branch = 'Melbourne' AND EXISTS ("
            "SELECT 1 FROM stock_locations keeper "
            "WHERE keeper.sku = stock_locations.sku AND keeper.branch = 'MELB')"
        )
    )
    bind.execute(
        sa.text(
            "UPDATE stock_locations SET branch = 'MELB' WHERE branch = 'Melbourne'"
        )
    )

    for table, column in PLAIN_RENAMES:
        bind.execute(
            sa.text(
                f"UPDATE {table} SET {column} = 'MELB' WHERE {column} = 'Melbourne'"
            )
        )


def downgrade():
    """Deliberately not reversed.

    Renaming `MELB` back would rename the rows that were always `MELB` as well,
    and the merged duplicates cannot be split apart again — the two spellings
    were one shelf and their quantities are now one number. Recording that the
    step is one-way is more honest than a downgrade that quietly corrupts.
    """

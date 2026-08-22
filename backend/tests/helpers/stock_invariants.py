"""Four things that must hold after any operation that moves stock.

Stock is kept in three places that have to agree: the item total
(`InventoryItem.stock` / `.committed_qty`), the per-branch positions
(`stock_locations`), and the movement ledger (`stock_movements`). Every bug this
codebase has had in this area was one of the three drifting from the others —
a transfer that decremented the total and never added it back, a receipt that
moved the total without touching a branch, a status change that moved neither.

None of those were caught by the tests of the endpoint that caused them, because
each endpoint asserted only its own effect. This harness asserts the
relationships instead, so a path that keeps its own promise while breaking a
shared one still fails.
"""

from dataclasses import dataclass

from app.models.inventory import InventoryItem, StockMovement
from app.models.stock_location import StockLocation

# Movement types that represent stock physically arriving or leaving. Committed
# and Released reserve rather than move, and a Location Change is a relocation
# whose quantity nets to zero against the item total.
ON_HAND_MOVEMENT_TYPES = frozenset(
    {
        "GR",
        "Purchase Receipt",
        "Sale",
        "Adjustment",
        "Stocktake",
        "Transfer In",
        "Transfer Out",
    }
)


@dataclass(frozen=True)
class StockState:
    stock: int
    committed: int
    located: int
    located_committed: int
    on_hand_movements: int
    negative_positions: tuple


def snapshot(db, sku: str) -> StockState:
    db.expire_all()
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    rows = db.query(StockLocation).filter(StockLocation.sku == sku).all()
    movements = db.query(StockMovement).filter(StockMovement.sku == sku).all()
    return StockState(
        stock=(item.stock or 0) if item else 0,
        committed=(item.committed_qty or 0) if item else 0,
        located=sum(r.qty_on_hand or 0 for r in rows),
        located_committed=sum(r.committed_qty or 0 for r in rows),
        on_hand_movements=sum(
            m.quantity or 0 for m in movements if m.type in ON_HAND_MOVEMENT_TYPES
        ),
        negative_positions=tuple(
            f"{r.branch}: on_hand={r.qty_on_hand} committed={r.committed_qty}"
            for r in rows
            if (r.qty_on_hand or 0) < 0 or (r.committed_qty or 0) < 0
        ),
    )


def assert_invariants(db, sku: str, before: StockState, *, what: str) -> StockState:
    """Check the three representations still agree. Returns the new state."""
    after = snapshot(db, sku)
    failures = []

    if after.located != after.stock:
        failures.append(
            f"branch positions sum to {after.located} but the item holds "
            f"{after.stock} — {after.stock - after.located} unaccounted for"
        )

    if after.located_committed != after.committed:
        failures.append(
            f"branch commitments sum to {after.located_committed} but the item "
            f"reserves {after.committed}"
        )

    if after.negative_positions:
        failures.append(f"negative branch positions: {list(after.negative_positions)}")

    posted = after.on_hand_movements - before.on_hand_movements
    moved = after.stock - before.stock
    if posted != moved:
        failures.append(
            f"on-hand changed by {moved} but movements posted {posted} — the "
            "ledger and the balance disagree"
        )

    assert not failures, "after " + what + ":\n  - " + "\n  - ".join(failures)
    return after

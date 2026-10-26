"""Does a supplier's bill charge for what actually arrived? (finding F36)

A bill used to be whatever was typed. For a bill against a purchase order, the
answer is now on the bill: the value received against that PO — each line's
received quantity at its PO price, plus the landed charges (freight, duty) on
its accepted goods receipts, with GST — against everything billed for the PO.
They match when they are the same to the cent.

Received, not ordered: a supplier bills for what it sent, and a short delivery
billed in full is exactly what this is here to catch.
"""

from collections import defaultdict
from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy.orm import Session, selectinload

from app.core.ledger import ZERO, money
from app.core.ledger_postings import bill_owed
from app.models.goods_receipt import GoodsReceipt
from app.models.purchase_order import PurchaseOrder
from app.models.supplier_bill import SupplierBill

GST_RATE = Decimal("0.10")


def po_matches(db: Session, bills: Iterable[SupplierBill]) -> dict[int, Optional[dict]]:
    """{bill id: its match against its PO, or None for a bill against no PO}."""
    bills = list(bills)
    po_ids = {b.po_id for b in bills if b.po_id}
    if not po_ids:
        return {b.id: None for b in bills}

    received_ex: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for po in (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .filter(PurchaseOrder.id.in_(po_ids))
    ):
        for line in po.items:
            received_ex[po.id] += money(
                Decimal(int(line.qty_received or 0)) * money(line.unit_cost)
            )
    for receipt in (
        db.query(GoodsReceipt)
        .options(selectinload(GoodsReceipt.charges))
        .filter(GoodsReceipt.po_id.in_(po_ids), GoodsReceipt.status == "Accepted")
    ):
        for charge in receipt.charges:
            received_ex[receipt.po_id] += money(charge.amount)

    billed: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for other in db.query(SupplierBill).filter(SupplierBill.po_id.in_(po_ids)):
        billed[other.po_id] += bill_owed(other)

    out: dict[int, Optional[dict]] = {}
    for bill in bills:
        if not bill.po_id:
            out[bill.id] = None
            continue
        ex = received_ex[bill.po_id]
        received_inc = ex + money(ex * GST_RATE)
        difference = billed[bill.po_id] - received_inc
        out[bill.id] = {
            "po_id": bill.po_id,
            "received_inc": float(received_inc),
            "billed_inc": float(billed[bill.po_id]),
            "difference": float(difference),
            "matches": difference == ZERO,
        }
    return out

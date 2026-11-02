"""Does a supplier's bill charge for what actually arrived? (finding F36)

A bill used to be whatever was typed. For a bill against a purchase order, the
answer is now on the bill: the value received against that PO — each line's
received quantity at its PO price, plus the landed charges (freight, duty) on
its accepted goods receipts, with GST — against everything billed for the PO.
They match when they are the same to the cent.

Received, not ordered: a supplier bills for what it sent, and a short delivery
billed in full is exactly what this is here to catch. What the PO ordered is
shown beside them, so a bill reads ordered, received and billed — but the match
is for the PO as a whole, not bill by bill or line by line.
"""

from collections import defaultdict
from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy.orm import Session, selectinload

from app.core import po_totals
from app.core.ledger import ZERO, money
from app.core.ledger_postings import bill_owed
from app.models.goods_receipt import GoodsReceipt
from app.models.purchase_order import PurchaseOrder
from app.models.supplier_bill import SupplierBill

GST_RATE = Decimal("0.10")


def po_values(db: Session, po_ids: Iterable[str]) -> dict[str, dict[str, Decimal]]:
    """{PO id: {"ordered_inc", "received_inc"}} — both with GST.

    Ordered is the PO's lines; received is each line's received quantity at its
    PO price, plus the landed charges on the PO's accepted goods receipts.
    Aged payables reads the same figure for goods received and not yet billed.
    """
    po_ids = set(po_ids)
    ordered: dict[str, Decimal] = defaultdict(lambda: ZERO)
    received_ex: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for po in (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .filter(PurchaseOrder.id.in_(po_ids))
    ):
        ordered[po.id] = po_totals.from_lines(po.items).inc
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
    return {
        po_id: {
            "ordered_inc": ordered[po_id],
            "received_inc": received_ex[po_id] + money(received_ex[po_id] * GST_RATE),
        }
        for po_id in po_ids
    }


def billed_by_po(db: Session, po_ids: Iterable[str]) -> dict[str, Decimal]:
    """{PO id: everything billed against it, with GST}, paid or not."""
    billed: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for bill in db.query(SupplierBill).filter(SupplierBill.po_id.in_(set(po_ids))):
        billed[bill.po_id] += bill_owed(bill)
    return billed


def po_matches(db: Session, bills: Iterable[SupplierBill]) -> dict[int, Optional[dict]]:
    """{bill id: its match against its PO, or None for a bill against no PO}."""
    bills = list(bills)
    po_ids = {b.po_id for b in bills if b.po_id}
    if not po_ids:
        return {b.id: None for b in bills}

    values = po_values(db, po_ids)
    billed = billed_by_po(db, po_ids)

    out: dict[int, Optional[dict]] = {}
    for bill in bills:
        if not bill.po_id:
            out[bill.id] = None
            continue
        received_inc = values[bill.po_id]["received_inc"]
        difference = billed[bill.po_id] - received_inc
        out[bill.id] = {
            "po_id": bill.po_id,
            "ordered_inc": float(values[bill.po_id]["ordered_inc"]),
            "received_inc": float(received_inc),
            "billed_inc": float(billed[bill.po_id]),
            "difference": float(difference),
            "matches": difference == ZERO,
        }
    return out

from datetime import date
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core import receiving
from app.core.dependencies import get_db, get_current_user, require_admin, require_staff
from app.core.landed_cost import LandedCharge, ReceiptLine, apportion_landed_costs
from app.core.stock_ledger import post_movement
from app.models.goods_receipt import GoodsReceipt, GoodsReceiptLine, GoodsReceiptCharge
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.inventory import InventoryItem

router = APIRouter(prefix="/goods-receipts", tags=["goods-receipts"])

VALID_STATUSES = {"Pending", "Inspecting", "Accepted", "Rejected"}
# What PATCH may move a receipt between. Accepted is reached only through the
# accept endpoint, which shelves the stock, and is final (F03).
EDITABLE_STATUSES = ("Pending", "Inspecting", "Rejected")


class GRLineIn(BaseModel):
    sku: str
    # The PO line this is received against. Omit to spread it across the PO's
    # lines for the SKU, each up to what it still needs.
    po_item_id: Optional[int] = None
    description: Optional[str] = None
    qty_expected: int = 0
    qty_received: int = 0
    unit_cost: float = 0
    condition: str = "Good"
    notes: Optional[str] = None


class GRChargeIn(BaseModel):
    description: str
    amount: float = 0
    basis: str = "value"  # value | qty


class GoodsReceiptIn(BaseModel):
    po_id: Optional[str] = None
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    branch: str = "HQ"
    received_date: str
    reference: Optional[str] = None
    notes: Optional[str] = None
    lines: List[GRLineIn] = []
    charges: List[GRChargeIn] = []


class GoodsReceiptPatch(BaseModel):
    status: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    received_date: Optional[str] = None


def _line_row(ln: GoodsReceiptLine) -> dict:
    return {
        "id": ln.id,
        "sku": ln.sku,
        "po_item_id": ln.po_item_id,
        "description": ln.description,
        "qty_expected": ln.qty_expected or 0,
        "qty_received": ln.qty_received or 0,
        "unit_cost": float(ln.unit_cost or 0),
        "condition": ln.condition or "Good",
        "notes": ln.notes,
    }


def _row(gr: GoodsReceipt) -> dict:
    return {
        "id": gr.id,
        "po_id": gr.po_id,
        "supplier_id": gr.supplier_id,
        "supplier_name": gr.supplier_name,
        "branch": gr.branch or "HQ",
        "received_date": gr.received_date,
        "reference": gr.reference,
        "status": gr.status,
        "notes": gr.notes,
        "created_by": gr.created_by,
        "created_at": gr.created_at.isoformat() if gr.created_at else None,
        "charges": [
            {
                "id": c.id,
                "description": c.description,
                "amount": float(c.amount or 0),
                "basis": c.basis or "value",
            }
            for c in (gr.charges or [])
        ],
        "landed_total": float(
            sum(Decimal(str(c.amount or 0)) for c in (gr.charges or []))
        ),
        "lines": [_line_row(ln) for ln in (gr.lines or [])],
    }


@router.get("")
def list_receipts(
    po_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(require_staff),
):
    q = db.query(GoodsReceipt)
    if po_id:
        q = q.filter(GoodsReceipt.po_id == po_id)
    if status:
        q = q.filter(GoodsReceipt.status == status)
    return [_row(gr) for gr in q.order_by(GoodsReceipt.created_at.desc()).all()]


@router.get("/{receipt_id}")
def get_receipt(
    receipt_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_staff),
):
    gr = db.get(GoodsReceipt, receipt_id)
    if not gr:
        raise HTTPException(status_code=404, detail="Goods receipt not found")
    return _row(gr)


@router.post("", status_code=201)
def create_receipt(
    body: GoodsReceiptIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    _=Depends(require_staff),
):
    # Derive supplier info from PO if provided
    supplier_name = body.supplier_name
    supplier_id = body.supplier_id
    po = None
    if body.po_id:
        po = db.get(PurchaseOrder, body.po_id)
        if not po:
            raise HTTPException(
                status_code=404, detail=f"Purchase order {body.po_id} not found"
            )
        receiving.check_receivable(po)
        supplier_name = supplier_name or po.supplier_name
        supplier_id = supplier_id or po.supplier_id
    for ln in body.lines:
        if ln.po_item_id is None:
            continue
        po_item = db.get(PurchaseOrderItem, ln.po_item_id)
        if po is None or po_item is None or po_item.order_id != po.id:
            raise HTTPException(
                status_code=422,
                detail=f"PO line {ln.po_item_id} is not a line of {body.po_id or 'this receipt'}",
            )
        if po_item.sku != ln.sku:
            raise HTTPException(
                status_code=422,
                detail=f"PO line {ln.po_item_id} is for {po_item.sku}, not {ln.sku}",
            )

    gr = GoodsReceipt(
        po_id=body.po_id,
        supplier_id=supplier_id,
        supplier_name=supplier_name,
        branch=body.branch or "HQ",
        received_date=body.received_date,
        reference=body.reference,
        status="Pending",
        notes=body.notes,
        created_by=current_user.username,
    )
    db.add(gr)
    db.flush()

    for ln in body.lines:
        db.add(
            GoodsReceiptLine(
                receipt_id=gr.id,
                sku=ln.sku,
                po_item_id=ln.po_item_id,
                description=ln.description,
                qty_expected=ln.qty_expected,
                qty_received=ln.qty_received,
                unit_cost=ln.unit_cost,
                condition=ln.condition,
                notes=ln.notes,
            )
        )

    for c in body.charges:
        if c.basis not in ("value", "qty"):
            raise HTTPException(
                status_code=422, detail="Charge basis must be 'value' or 'qty'"
            )
        db.add(
            GoodsReceiptCharge(
                receipt_id=gr.id,
                description=c.description,
                amount=c.amount,
                basis=c.basis,
            )
        )

    db.commit()
    db.refresh(gr)
    return _row(gr)


@router.patch("/{receipt_id}")
def update_receipt(
    receipt_id: int,
    body: GoodsReceiptPatch,
    db: Session = Depends(get_db),
    _=Depends(require_staff),
):
    gr = db.get(GoodsReceipt, receipt_id)
    if not gr:
        raise HTTPException(status_code=404, detail="Goods receipt not found")

    if body.status and body.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=422, detail=f"Invalid status. Valid: {sorted(VALID_STATUSES)}"
        )
    # Set by hand, Accepted said the stock was shelved when it was not, and an
    # accepted receipt put back to Pending was accepted, and shelved, again.
    if "status" in body.model_fields_set and body.status != gr.status:
        if gr.status == "Accepted":
            raise HTTPException(
                status_code=409,
                detail=f"Goods receipt {gr.id} is accepted and its stock shelved — "
                "reverse it with a stock adjustment",
            )
        if body.status not in EDITABLE_STATUSES:
            raise HTTPException(
                status_code=409,
                detail="A receipt is accepted by accepting it, which shelves its stock",
            )

    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(gr, k, v)
    db.commit()
    db.refresh(gr)
    return _row(gr)


@router.post("/{receipt_id}/accept")
def accept_receipt(
    receipt_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_staff),
):
    """Accept a goods receipt: update stock on hand, update PO qty_received, mark Accepted."""
    # The row is locked and its status read afresh under the lock: two accepts
    # at once both read Pending, and both shelved the stock (F18).
    gr = db.get(GoodsReceipt, receipt_id, with_for_update=True, populate_existing=True)
    if not gr:
        raise HTTPException(status_code=404, detail="Goods receipt not found")
    if gr.status == "Accepted":
        raise HTTPException(status_code=409, detail="Receipt already accepted")
    if gr.status == "Rejected":
        raise HTTPException(status_code=409, detail="Cannot accept a rejected receipt")

    today = date.today().isoformat()

    # Apportion landed costs (freight/duty/customs) across the received lines so
    # COG reflects what the stock actually cost to land, not just the supplier
    # price (Jim2 Cost vs COG). No charges => COG == Cost.
    received = [ln for ln in gr.lines if (ln.qty_received or 0) > 0]
    landed_by_line = dict(
        zip(
            (id(ln) for ln in received),
            apportion_landed_costs(
                [
                    ReceiptLine(
                        sku=ln.sku,
                        qty=ln.qty_received or 0,
                        unit_cost=Decimal(str(ln.unit_cost or 0)),
                    )
                    for ln in received
                ],
                [
                    LandedCharge(
                        description=c.description,
                        amount=Decimal(str(c.amount or 0)),
                        basis=(c.basis or "value"),
                    )
                    for c in (gr.charges or [])
                ],
            ),
        )
    )

    # The PO is locked before its lines are credited: two receives of one line
    # at once both read it as 0 and both wrote 5 (F18).
    po = receiving.lock_po(db, gr.po_id) if gr.po_id else None
    if po is not None:
        receiving.check_receivable(po)
    reference = f"GR-{gr.id}" + (f" / {gr.po_id}" if gr.po_id else "")
    notes = f"Goods receipt from {gr.supplier_name or 'supplier'}"
    prefer_jobs: dict[str, list] = {}
    for ln in gr.lines:
        qty = ln.qty_received or 0
        if qty <= 0:
            continue

        # Against a PO, the receipt credits its lines — the one it names, or
        # each line of the SKU in turn — and shelves one movement per line, so
        # what arrived can be traced to the PO line and the job it was for.
        credits = (
            receiving.credit_po_lines(po, ln.sku, qty, po_item=ln.po_item)
            if po is not None
            else []
        )
        # Work bought for a job's garments (subcontracted decoration) is not
        # shelved, so it must not move the item's cost either: averaging its
        # price against units that never arrived would shift cost of goods.
        work_only = bool(credits) and all(
            receiving.service_lines(db, line, ln.sku) for line, _ in credits
        )

        # Update inventory stock
        inv = db.query(InventoryItem).filter_by(sku=ln.sku).first()
        if inv and not work_only:
            # Captured before the movement lands, because the moving average
            # below weights the new cost against the stock held until now.
            prev_qty = inv.stock or 0
            if ln.unit_cost and float(ln.unit_cost) > 0:
                inv.unit_cost = ln.unit_cost

            landed = landed_by_line.get(id(ln))
            if landed is not None:
                # Cost = supplier price; COG = landed cost per unit.
                inv.last_cost = landed.unit_cost
                inv.last_cog = landed.cog_unit
                prior_cog = Decimal(str(inv.avg_cog or inv.unit_cost or 0))
                total_qty = prev_qty + qty
                # Moving weighted average over the stock we now hold.
                inv.avg_cog = (
                    ((Decimal(prev_qty) * prior_cog) + (Decimal(qty) * landed.cog_unit))
                    / Decimal(total_qty)
                    if total_qty > 0
                    else landed.cog_unit
                )
                inv.max_cog = max(Decimal(str(inv.max_cog or 0)), landed.cog_unit)

        if credits:
            receiving.receive(
                db,
                sku=ln.sku,
                credits=credits,
                movement_type="GR",
                branch=gr.branch,
                reference=reference,
                notes=notes,
                date=today,
            )
        else:
            post_movement(
                db,
                sku=ln.sku,
                movement_type="GR",
                branch=gr.branch,
                quantity=qty,
                date=today,
                reference=reference,
                po_id=gr.po_id,
                notes=notes,
            )
        prefer_jobs.setdefault(ln.sku, []).extend(line.job_id for line, _ in credits)

    gr.status = "Accepted"

    # Newly received stock goes to the job lines waiting for it.
    for sku, job_ids in prefer_jobs.items():
        receiving.fill_back_orders(db, sku, job_ids)

    if po is not None:
        receiving.settle_po_status(po, today)

    db.commit()
    db.refresh(gr)
    return _row(gr)


@router.post("/{receipt_id}/reject")
def reject_receipt(
    receipt_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_staff),
):
    gr = db.get(GoodsReceipt, receipt_id)
    if not gr:
        raise HTTPException(status_code=404, detail="Goods receipt not found")
    if gr.status in ("Accepted", "Rejected"):
        raise HTTPException(status_code=409, detail=f"Receipt is already {gr.status}")
    gr.status = "Rejected"
    db.commit()
    db.refresh(gr)
    return _row(gr)


@router.delete("/{receipt_id}", status_code=204)
def delete_receipt(
    receipt_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    gr = db.get(GoodsReceipt, receipt_id)
    if not gr:
        raise HTTPException(status_code=404, detail="Goods receipt not found")
    if gr.status == "Accepted":
        raise HTTPException(
            status_code=409,
            detail="Cannot delete an accepted goods receipt — reverse via stock adjustment",
        )
    db.delete(gr)
    db.commit()

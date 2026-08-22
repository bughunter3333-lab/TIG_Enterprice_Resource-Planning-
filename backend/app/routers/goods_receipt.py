from datetime import date
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user, require_role
from app.core.landed_cost import LandedCharge, ReceiptLine, apportion_landed_costs
from app.core.reservations import committed_total
from app.core.stock_ledger import post_movement
from app.models.goods_receipt import GoodsReceipt, GoodsReceiptLine, GoodsReceiptCharge
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.inventory import InventoryItem
from app.models.job import Job, JobItem

router = APIRouter(prefix="/goods-receipts", tags=["goods-receipts"])

VALID_STATUSES = {"Pending", "Inspecting", "Accepted", "Rejected"}


class GRLineIn(BaseModel):
    sku: str
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
    _=Depends(require_role("admin", "staff")),
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
    _=Depends(require_role("admin", "staff")),
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
    _=Depends(require_role("admin", "staff")),
):
    # Derive supplier info from PO if provided
    supplier_name = body.supplier_name
    supplier_id = body.supplier_id
    if body.po_id:
        po = db.get(PurchaseOrder, body.po_id)
        if not po:
            raise HTTPException(
                status_code=404, detail=f"Purchase order {body.po_id} not found"
            )
        supplier_name = supplier_name or po.supplier_name
        supplier_id = supplier_id or po.supplier_id

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
    _=Depends(require_role("admin", "staff")),
):
    gr = db.get(GoodsReceipt, receipt_id)
    if not gr:
        raise HTTPException(status_code=404, detail="Goods receipt not found")

    if body.status and body.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=422, detail=f"Invalid status. Valid: {sorted(VALID_STATUSES)}"
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
    _=Depends(require_role("admin", "staff")),
):
    """Accept a goods receipt: update stock on hand, update PO qty_received, mark Accepted."""
    gr = db.get(GoodsReceipt, receipt_id)
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

    for ln in gr.lines:
        qty = ln.qty_received or 0
        if qty <= 0:
            continue

        # Update inventory stock
        inv = db.query(InventoryItem).filter_by(sku=ln.sku).first()
        if inv:
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
            post_movement(
                db,
                sku=ln.sku,
                movement_type="GR",
                branch=gr.branch,
                quantity=qty,
                date=today,
                reference=f"GR-{gr.id}" + (f" / {gr.po_id}" if gr.po_id else ""),
                notes=f"Goods receipt from {gr.supplier_name or 'supplier'}",
            )

        # Update PO line qty_received if linked
        if gr.po_id:
            po_line = (
                db.query(PurchaseOrderItem)
                .filter_by(order_id=gr.po_id, sku=ln.sku)
                .first()
            )
            if po_line:
                po_line.qty_received = min(
                    (po_line.qty_received or 0) + qty,
                    po_line.qty_ordered or 0,
                )

    gr.status = "Accepted"

    # Auto-allocate newly received stock to back-ordered job items
    _auto_allocate_backorders(gr, db)

    # Auto-advance PO to Received if all lines fulfilled
    if gr.po_id:
        po = db.get(PurchaseOrder, gr.po_id)
        if po and po.status not in ("Received", "Cancelled"):
            all_received = all(
                (item.qty_received or 0) >= (item.qty_ordered or 0) for item in po.items
            )
            if all_received:
                po.status = "Received"
                po.received_date = today

    db.commit()
    db.refresh(gr)
    return _row(gr)


def _auto_allocate_backorders(gr: GoodsReceipt, db: Session) -> None:
    """After accepting a GR, reduce b_ord on active jobs using newly received stock."""
    _ACTIVE = {"ORDER", "In Progress", "PROOF", "PRINT", "Pick/Pack", "FINISH"}
    for ln in gr.lines:
        if not ln.sku or (ln.qty_received or 0) <= 0:
            continue
        inv = db.query(InventoryItem).filter_by(sku=ln.sku).first()
        if not inv:
            continue
        # Available = on-hand minus committed, where committed is derived from
        # the open jobs rather than read off the stored counter. Reading the
        # counter understated availability for anything sitting between INVOICE
        # and PAID, so a backorder could be refused stock that was free.
        available = max(0, (inv.stock or 0) - committed_total(db, ln.sku))
        if available <= 0:
            continue
        # Find active job items with back-orders for this SKU, oldest due first
        b_ord_items = (
            db.query(JobItem, Job)
            .join(Job, Job.id == JobItem.job_id)
            .filter(
                JobItem.stock_code == ln.sku,
                JobItem.b_ord > 0,
                Job.status.in_(_ACTIVE),
            )
            .order_by(Job.due.asc().nullslast(), Job.id.asc())
            .all()
        )
        remaining = available
        for item, _job in b_ord_items:
            if remaining <= 0:
                break
            fill = min(item.b_ord, remaining)
            item.b_ord = item.b_ord - fill
            # Move the filled qty from back-order into supply (now on hand),
            # keeping the invariant order_qty = supply_qty + b_ord.
            item.supply_qty = (item.supply_qty or 0) + fill
            remaining -= fill


@router.post("/{receipt_id}/reject")
def reject_receipt(
    receipt_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_role("admin", "staff")),
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
    _=Depends(require_role("admin")),
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

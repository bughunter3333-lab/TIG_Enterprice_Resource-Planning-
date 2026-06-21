import csv
import io
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from typing import Any

MAX_CSV_BYTES = 10 * 1024 * 1024  # 10 MB


async def _read_csv_file(file: UploadFile) -> bytes:
    data = await file.read()
    if len(data) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")
    return data


from app.database import get_db
from app.core.dependencies import require_staff
from app.models.user import User
from app.models.customer import Customer
from app.models.supplier import Supplier
from app.models.inventory import InventoryItem
from app.models.job import Job
from app.models.card_file import CardFile

router = APIRouter(prefix="/import", tags=["import"])


# ── Jim2 status translation ───────────────────────────────────────────────────

JIM2_STATUS_MAP = {
    # Jim2 native statuses → TIG system statuses
    "booked": "ORDER",
    "active": "In Progress",
    "ready": "FINISH",
    "finish": "FINISH",
    "finished": "FINISH",
    "invoice": "INVOICE",
    "invoiced": "INVOICE",
    "paid": "PAID",
    "quote": "QUOTE",
    "order": "ORDER",
    "in progress": "In Progress",
    "proof": "PROOF",
    "print": "PRINT",
    "pick/pack": "Pick/Pack",
    "pick pack": "Pick/Pack",
    "cancel": "CANCEL",
    "cancelled": "CANCEL",
    "canceled": "CANCEL",
    "rai.nr": "CANCEL",
    "rai.us": "CANCEL",
    "new": "New",
}

VALID_STATUSES = {
    "QUOTE",
    "New",
    "ORDER",
    "In Progress",
    "PROOF",
    "PRINT",
    "Pick/Pack",
    "FINISH",
    "INVOICE",
    "PAID",
    "CANCEL",
}


def translate_status(raw: str | None) -> str:
    if not raw:
        return "FINISH"
    norm = raw.strip().lower()
    if norm in JIM2_STATUS_MAP:
        return JIM2_STATUS_MAP[norm]
    # Already a valid system status
    for vs in VALID_STATUSES:
        if vs.lower() == norm:
            return vs
    return "FINISH"


# ── Column alias maps ─────────────────────────────────────────────────────────
# Each key is the canonical DB column name.
# Values are the possible CSV header variants after lowercasing + space→underscore.
# Jim2 actual column names are noted in comments.

CUSTOMER_MAP = {
    # Jim2: "Card Code", "Cust#", "Code"
    "id": [
        "id",
        "customer_id",
        "customerid",
        "code",
        "customer_code",
        "account_no",
        "accountno",
        "cust#",
        "cust_no",
        "card_code",
        "card#",
        "cardcode",
    ],
    # Jim2: "Name"
    "name": [
        "name",
        "customer_name",
        "customername",
        "company",
        "company_name",
        "business_name",
        "businessname",
        "trading_name",
    ],
    # Jim2: "Contact Person"
    "contact": [
        "contact",
        "contact_person",
        "contactperson",
        "contact_name",
        "contactname",
        "contact_person",
    ],
    "email": ["email", "email_address", "emailaddress"],
    "phone": ["phone", "phone_number", "phonenumber", "telephone", "tel", "ph"],
    "mobile": ["mobile", "mobile_number", "mobilenumber", "cell", "cellphone"],
    # Jim2: "Postal Address" or multi-field address
    "address": [
        "address",
        "billing_address",
        "billingaddress",
        "street_address",
        "postal_address",
        "postaladdress",
    ],
    "abn": ["abn", "abn_number", "tax_number", "taxnumber", "gst_number"],
    # Jim2: "Card Type"
    "account_type": ["account_type", "accounttype", "type", "card_type", "cardtype"],
    "payment_terms": ["payment_terms", "paymentterms", "terms", "credit_terms"],
    # Jim2: "Credit Limit $"
    "credit_limit": [
        "credit_limit",
        "creditlimit",
        "credit",
        "credit_limit_$",
        "credit_limit$",
    ],
    # Jim2: "Account Manager" / "Acc. Mgr" / "Acc Mgr"
    "account_manager": [
        "account_manager",
        "accountmanager",
        "rep",
        "sales_rep",
        "salesrep",
        "acc_mgr",
        "acc._mgr",
        "acc.mgr",
        "account_mgr",
        "acct_mgr",
    ],
    "status": ["status", "active", "account_status"],
}

SUPPLIER_MAP = {
    "id": [
        "id",
        "supplier_id",
        "supplierid",
        "code",
        "supplier_code",
        "suppliercode",
        "vend#",
        "vendor_code",
        "vendor#",
    ],
    "name": [
        "name",
        "supplier_name",
        "suppliername",
        "company",
        "company_name",
        "vendor_name",
        "vendorname",
    ],
    "contact": ["contact", "contact_person", "contactperson", "contact_name"],
    "email": ["email", "email_address"],
    "phone": ["phone", "phone_number", "telephone", "tel"],
    "address": ["address", "street_address", "supplier_address"],
    "payment_terms": ["payment_terms", "paymentterms", "terms"],
    "currency": ["currency", "currency_code"],
    "status": ["status"],
}

INVENTORY_MAP = {
    # Jim2: "Stock Code"
    "sku": [
        "sku",
        "code",
        "product_code",
        "productcode",
        "item_code",
        "itemcode",
        "part_number",
        "partno",
        "stock_code",
        "stockcode",
    ],
    # Jim2: "ShortDesc" / "Desc" / "Description"
    "name": [
        "name",
        "description",
        "item_name",
        "itemname",
        "product_name",
        "productname",
        "item_description",
        "shortdesc",
        "short_desc",
        "item_desc",
        "desc",
        "title",
    ],
    # Jim2: "StockGroup1"
    "category": [
        "category",
        "product_category",
        "type",
        "group",
        "stockgroup1",
        "stock_group1",
        "stockgroup",
        "stock_group",
        "prod_group",
        "item_group",
    ],
    "supplier": ["supplier", "supplier_name", "vendor", "vendor_name", "supplier_code"],
    # Jim2: "On Hand"
    "stock": [
        "stock",
        "qty",
        "quantity",
        "on_hand",
        "onhand",
        "stock_qty",
        "current_stock",
        "qty_on_hand",
    ],
    # Jim2: "Reorder Level"
    "min_stock": [
        "min_stock",
        "minstock",
        "reorder_level",
        "reorderlevel",
        "reorder",
        "minimum_stock",
        "min_qty",
    ],
    # Jim2: "SupplierPrice" / "Cost Price"
    "unit_cost": [
        "unit_cost",
        "unitcost",
        "cost",
        "buy_price",
        "buyprice",
        "cost_price",
        "costprice",
        "supplierprice",
        "supplier_price",
    ],
    # Jim2: "RRPInc" / "Sell Price"
    "sell_price": [
        "sell_price",
        "sellprice",
        "unit_price",
        "unitprice",
        "price",
        "selling_price",
        "rrpinc",
        "rrp_inc",
        "rrp",
        "retail_price",
    ],
    "location": [
        "location",
        "bin",
        "bin_location",
        "binlocation",
        "warehouse_location",
        "slot",
    ],
    "status": ["status"],
}

JOB_MAP = {
    # Jim2: "Job#"
    "id": [
        "id",
        "job_id",
        "jobid",
        "job_number",
        "jobnumber",
        "job_no",
        "jobno",
        "job#",
    ],
    # Jim2: "Cust#"
    "customer_id": [
        "customer_id",
        "customerid",
        "customer_code",
        "customercode",
        "account_no",
        "cust#",
        "cust_no",
        "card_code",
    ],
    "customer_name": [
        "customer_name",
        "customername",
        "customer",
        "company",
        "client",
        "cust_name",
    ],
    "status": ["status", "job_status"],
    # Jim2: "Inv#"
    "invoice": [
        "invoice",
        "invoice_number",
        "invoicenumber",
        "invoice_no",
        "invoice#",
        "inv#",
        "inv_no",
    ],
    # Jim2: "Date In"
    "date_in": [
        "date_in",
        "datein",
        "date",
        "order_date",
        "orderdate",
        "start_date",
        "date_created",
    ],
    # Jim2: "Date Due"
    "due": [
        "due",
        "due_date",
        "duedate",
        "delivery_date",
        "required_date",
        "date_due",
        "datedue",
    ],
    # Jim2: "Date Out"
    "out": [
        "out",
        "out_date",
        "dispatch_date",
        "dispatched",
        "shipped_date",
        "date_out",
    ],
    "priority": ["priority"],
    "type": ["type", "job_type", "jobtype"],
    # Jim2: "Name" (responsible staff) / "Acc. Mgr"
    "assigned_to": [
        "assigned_to",
        "assignedto",
        "assignee",
        "staff",
        "acc_mgr",
        "acc._mgr",
        "acc.mgr",
        "account_manager",
        "acct_mgr",
        "name",
        "responsible",
    ],
    # Jim2: "Total Ex."
    "total_ex": [
        "total_ex",
        "totalex",
        "subtotal",
        "subtotal_$",
        "amount_ex",
        "net_amount",
        "total_ex.",
        "sub_total",
        "ex_gst",
        "ex_tax",
    ],
    # Jim2: "Tax Paid" / "TaxContent"
    "tax": [
        "tax",
        "gst",
        "tax_amount",
        "tax_$",
        "tax_paid",
        "taxcontent",
        "tax_content",
        "gst_amount",
    ],
    # Jim2: "Total Inc."
    "total_inc": [
        "total_inc",
        "totalinc",
        "total",
        "total_$_(aud)",
        "total_$(aud)",
        "amount_inc",
        "gross_amount",
        "invoice_amount",
        "total_inc.",
        "inc_gst",
        "inc_tax",
        "total_including_tax",
    ],
    # Jim2: "Invoice Paid $"
    "deposit": [
        "deposit",
        "paid",
        "invoice_paid",
        "amount_paid",
        "payment_received",
        "invoice_paid_$",
        "invoice_paid$",
        "paid_$",
    ],
    # Jim2: "Balance Due $"
    "balance_due": [
        "balance_due",
        "balancedue",
        "balance",
        "outstanding",
        "balance_due_$",
        "balance_due$",
        "amount_outstanding",
    ],
    "payment_method": ["payment_method", "paymentmethod", "payment_type"],
    "shipping_address": [
        "shipping_address",
        "shippingaddress",
        "ship_address",
        "delivery_address",
    ],
    "notes": ["notes", "note", "comments", "remarks", "instructions", "job_notes"],
    # Jim2: "Cust Ref#"
    "cust_ref": [
        "cust_ref",
        "custref",
        "cust_ref#",
        "customer_reference",
        "customer_ref",
        "cust_ref_no",
        "po_number",
        "cust_po",
    ],
    # Jim2: "OurRef"
    "our_ref": [
        "our_ref",
        "ourref",
        "our_ref#",
        "our_reference",
        "our_ref_no",
        "internal_ref",
    ],
    # Jim2: "Item Desc" / "Invoice Description"
    "description": [
        "description",
        "desc",
        "desc.",
        "job_description",
        "job_desc",
        "item_desc",
        "invoice_description",
        "invoice_desc",
    ],
    # Jim2: "Ship#"
    "ship_to": ["ship_to", "shipto", "ship#", "ship_no", "ship_code", "shipping_code"],
    # Jim2: "Project#" (not directly in Jim2 job list but used in custom exports)
    "project_no": ["project_no", "projectno", "project#", "project_number", "project"],
    "serial_no": ["serial_no", "serialno", "serial#", "serial_number", "serial"],
    # Jim2: "Name/Contact" (customer contact on job)
    "name_contact": [
        "name_contact",
        "name/contact",
        "contact_name",
        "contactname",
        "customer_contact",
    ],
}

CARD_FILE_MAP = {
    # Jim2 ship card: "Card Code"
    "ship_code": [
        "ship_code",
        "shipcode",
        "ship#",
        "card_code",
        "code",
        "ship_to_code",
        "delivery_code",
    ],
    # Billing customer code: "Cust#" or derived
    "customer_code": [
        "customer_code",
        "cust#",
        "cust_code",
        "account_code",
        "billing_code",
        "customer_id",
    ],
    # Jim2: "Name"
    "company_name": [
        "company_name",
        "name",
        "company",
        "business_name",
        "ship_to_name",
    ],
    # Jim2: "Contact Person"
    "contact_name": ["contact_name", "contact_person", "contact", "contactname"],
    "address1": [
        "address1",
        "address_1",
        "address",
        "street",
        "street_address",
        "postal_address",
        "delivery_address",
    ],
    "address2": ["address2", "address_2", "street2"],
    "suburb": ["suburb", "city", "town", "locality"],
    "state": ["state", "province"],
    "postcode": ["postcode", "post_code", "zip", "zipcode"],
    "country": ["country", "country_code"],
    "phone": ["phone", "telephone", "tel", "ph"],
    "email": ["email", "email_address"],
    "notes": ["notes", "note", "comments"],
}


# ── CSV parsing helpers ───────────────────────────────────────────────────────


def parse_csv(content: bytes) -> list[dict]:
    """Decode and parse CSV, handling BOM and common encodings."""
    for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


def normalise_key(k: str) -> str:
    """Normalise a CSV header to a lookup key: lowercase, spaces→_, strip."""
    return k.strip().lower().replace(" ", "_")


def map_row(row: dict, field_map: dict[str, list[str]]) -> dict:
    """Map CSV row keys to canonical field names using alias map."""
    lowered = {
        normalise_key(k): (v.strip() if isinstance(v, str) else v)
        for k, v in row.items()
    }
    result = {}
    for canonical, aliases in field_map.items():
        for alias in aliases:
            if alias in lowered:
                val = lowered[alias]
                result[canonical] = val if val != "" else None
                break
    return result


def safe_float(val, default: float = 0.0) -> float:
    try:
        return (
            float(str(val).replace(",", "").replace("$", "").strip())
            if val
            else default
        )
    except (ValueError, TypeError):
        return default


def safe_int(val, default: int = 0) -> int:
    try:
        return int(float(str(val).replace(",", "").strip())) if val else default
    except (ValueError, TypeError):
        return default


# ── Download CSV templates ────────────────────────────────────────────────────


@router.get("/template/{entity}")
def download_template(entity: str, _: User = Depends(require_staff)):
    templates = {
        "customers": (
            "id,name,contact,email,phone,mobile,address,abn,account_type,payment_terms,credit_limit,account_manager,status\n"
            "CUST001,Acme Corporation,John Smith,john@acme.com,02 9999 0001,0400 000 001,"
            '"123 Example St, Sydney NSW 2000",12 345 678 901,Account,Net 30,5000,Jane Manager,Active\n'
            "\n"
            "# Jim2 tip: export CardFile list from Jim2 — column 'Card Code' maps to id, 'Acc. Mgr' maps to account_manager"
        ),
        "suppliers": (
            "id,name,contact,email,phone,address,payment_terms,currency,status\n"
            "SUP001,Example Supplier,Jane Contact,jane@supplier.com,02 8888 0001,"
            '"456 Supplier Rd, Melbourne VIC 3000",Net 30,AUD,Active'
        ),
        "inventory": (
            "sku,name,category,supplier,stock,min_stock,unit_cost,sell_price,location,status\n"
            "SKU001,Sample T-Shirt,Apparel,SUP001,100,20,12.50,25.00,A-01-1,Active\n"
            "\n"
            "# Jim2 tip: use 'Stock Code','ShortDesc','StockGroup1','On Hand','Cost Price','RRPInc'"
        ),
        "jobs": (
            "Job#,Cust#,Status,Inv#,Date In,Date Due,Ship#,Cust Ref#,OurRef,Item Desc,"
            "Name/Contact,Total Ex.,Tax,Total Inc.,Invoice Paid $,Balance Due $,Acc. Mgr,Notes\n"
            "100001,RESP.HO,Finish,INV-001,01/06/2025,15/06/2025,RESP.SYD,PO-1234,David,Polos,"
            "Jane Smith,100.00,10.00,110.00,110.00,0.00,John Manager,Rush order\n"
            "\n"
            "# Directly paste a Jim2 Job List export CSV — all Jim2 column names are recognised automatically"
        ),
        "card_files": (
            "ship_code,customer_code,company_name,contact_name,address1,address2,suburb,state,postcode,country,phone,email,notes\n"
            'RESP.SYD,RESP.HO,Respite Care Sydney,Jane Smith,"Level 3, 100 Market St",,Sydney,NSW,2000,AU,02 9000 0001,sydney@resp.com.au,\n'
            "\n"
            "# Jim2 tip: export CardFile list filtering by Ship# cards — 'Card Code' maps to ship_code"
        ),
    }
    if entity not in templates:
        raise HTTPException(status_code=404, detail="Unknown entity type")
    from fastapi.responses import Response

    return Response(
        content=templates[entity],
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={entity}_import_template.csv"
        },
    )


# ── Import endpoints ──────────────────────────────────────────────────────────


@router.post("/customers")
async def import_customers(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    rows = parse_csv(await _read_csv_file(file))
    inserted = updated = skipped = 0
    errors: list[dict] = []

    for i, row in enumerate(rows, 1):
        # Skip comment rows (Jim2 templates include comment lines)
        if not any(v and str(v).strip() for v in row.values()):
            continue
        raw_vals = list(row.values())
        if raw_vals and str(raw_vals[0]).startswith("#"):
            continue

        try:
            mapped = map_row(row, CUSTOMER_MAP)
            if not mapped.get("name"):
                errors.append({"row": i, "error": "Missing required field: name"})
                skipped += 1
                continue

            cust_id = mapped.get("id") or f"CUST-IMP-{i:04d}"
            existing = db.query(Customer).filter(Customer.id == cust_id).first()

            data: dict[str, Any] = {
                "id": cust_id,
                "name": mapped.get("name"),
                "contact": mapped.get("contact"),
                "email": mapped.get("email"),
                "phone": mapped.get("phone"),
                "mobile": mapped.get("mobile"),
                "address": mapped.get("address"),
                "abn": mapped.get("abn"),
                "account_type": mapped.get("account_type") or "Account",
                "payment_terms": mapped.get("payment_terms") or "Net 30",
                "credit_limit": safe_float(mapped.get("credit_limit")),
                "account_manager": mapped.get("account_manager"),
                "status": mapped.get("status") or "Active",
            }

            if existing:
                for k, v in data.items():
                    if k != "id" and v is not None:
                        setattr(existing, k, v)
                updated += 1
            else:
                db.add(Customer(**data))
                inserted += 1
        except Exception as e:
            errors.append({"row": i, "error": str(e)})
            skipped += 1

    db.commit()
    return {
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:20],
    }


@router.post("/suppliers")
async def import_suppliers(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    rows = parse_csv(await _read_csv_file(file))
    inserted = updated = skipped = 0
    errors: list[dict] = []

    for i, row in enumerate(rows, 1):
        raw_vals = list(row.values())
        if raw_vals and str(raw_vals[0]).startswith("#"):
            continue
        if not any(v and str(v).strip() for v in row.values()):
            continue

        try:
            mapped = map_row(row, SUPPLIER_MAP)
            if not mapped.get("name"):
                errors.append({"row": i, "error": "Missing required field: name"})
                skipped += 1
                continue

            sup_id = mapped.get("id") or f"SUP-IMP-{i:04d}"
            existing = db.query(Supplier).filter(Supplier.id == sup_id).first()

            data: dict[str, Any] = {
                "id": sup_id,
                "name": mapped.get("name"),
                "contact": mapped.get("contact"),
                "email": mapped.get("email"),
                "phone": mapped.get("phone"),
                "address": mapped.get("address"),
                "payment_terms": mapped.get("payment_terms") or "Net 30",
                "currency": mapped.get("currency") or "AUD",
                "status": mapped.get("status") or "Active",
            }

            if existing:
                for k, v in data.items():
                    if k != "id" and v is not None:
                        setattr(existing, k, v)
                updated += 1
            else:
                db.add(Supplier(**data))
                inserted += 1
        except Exception as e:
            errors.append({"row": i, "error": str(e)})
            skipped += 1

    db.commit()
    return {
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:20],
    }


@router.post("/inventory")
async def import_inventory(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    rows = parse_csv(await _read_csv_file(file))
    inserted = updated = skipped = 0
    errors: list[dict] = []

    for i, row in enumerate(rows, 1):
        raw_vals = list(row.values())
        if raw_vals and str(raw_vals[0]).startswith("#"):
            continue
        if not any(v and str(v).strip() for v in row.values()):
            continue

        try:
            mapped = map_row(row, INVENTORY_MAP)
            if not mapped.get("sku") or not mapped.get("name"):
                errors.append(
                    {"row": i, "error": "Missing required fields: sku or name"}
                )
                skipped += 1
                continue

            existing = (
                db.query(InventoryItem)
                .filter(InventoryItem.sku == mapped["sku"])
                .first()
            )

            data: dict[str, Any] = {
                "sku": mapped["sku"],
                "name": mapped["name"],
                "category": mapped.get("category"),
                "supplier": mapped.get("supplier"),
                "stock": safe_int(mapped.get("stock")),
                "min_stock": safe_int(mapped.get("min_stock")),
                "unit_cost": safe_float(mapped.get("unit_cost")),
                "sell_price": safe_float(mapped.get("sell_price")),
                "location": mapped.get("location"),
                "status": mapped.get("status") or "Active",
            }

            if existing:
                for k, v in data.items():
                    if k != "sku" and v is not None:
                        setattr(existing, k, v)
                updated += 1
            else:
                db.add(InventoryItem(**data))
                inserted += 1
        except Exception as e:
            errors.append({"row": i, "error": str(e)})
            skipped += 1

    db.commit()
    return {
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:20],
    }


@router.post("/jobs")
async def import_jobs(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    rows = parse_csv(await _read_csv_file(file))
    inserted = updated = skipped = 0
    errors: list[dict] = []

    for i, row in enumerate(rows, 1):
        raw_vals = list(row.values())
        if raw_vals and str(raw_vals[0]).startswith("#"):
            continue
        if not any(v and str(v).strip() for v in row.values()):
            continue

        try:
            mapped = map_row(row, JOB_MAP)
            if not mapped.get("customer_name") and not mapped.get("customer_id"):
                errors.append({"row": i, "error": "Missing customer_name or Cust#"})
                skipped += 1
                continue

            job_id = str(mapped.get("id") or f"IMP-{i:06d}")
            cust_id = mapped.get("customer_id") or "UNKNOWN"

            status = translate_status(mapped.get("status"))

            total_ex = safe_float(mapped.get("total_ex"))
            tax = safe_float(mapped.get("tax"))
            total_inc = safe_float(mapped.get("total_inc"))
            # If total_inc missing but total_ex present, derive it
            if total_inc == 0 and total_ex > 0:
                total_inc = round(total_ex + tax, 2)
            deposit = safe_float(mapped.get("deposit"))
            balance = safe_float(mapped.get("balance_due"), total_inc - deposit)

            existing = db.query(Job).filter(Job.id == job_id).first()

            data: dict[str, Any] = {
                "id": job_id,
                "customer_id": cust_id,
                "customer_name": mapped.get("customer_name") or cust_id,
                "status": status,
                "invoice": mapped.get("invoice"),
                "date_in": mapped.get("date_in"),
                "due": mapped.get("due"),
                "out": mapped.get("out"),
                "priority": mapped.get("priority") or "Normal",
                "type": mapped.get("type") or "Standard",
                "assigned_to": mapped.get("assigned_to"),
                "total_ex": total_ex,
                "tax": tax,
                "total_inc": total_inc,
                "deposit": deposit,
                "balance_due": balance,
                "payment_method": mapped.get("payment_method") or "Account",
                "shipping_address": mapped.get("shipping_address"),
                "notes": mapped.get("notes"),
                # Jim2-specific fields
                "cust_ref": mapped.get("cust_ref"),
                "our_ref": mapped.get("our_ref"),
                "description": mapped.get("description"),
                "ship_to": mapped.get("ship_to"),
                "project_no": mapped.get("project_no"),
                "serial_no": mapped.get("serial_no"),
                "name_contact": mapped.get("name_contact"),
            }

            if existing:
                for k, v in data.items():
                    if k != "id" and v is not None:
                        setattr(existing, k, v)
                updated += 1
            else:
                db.add(Job(**data))
                inserted += 1
        except Exception as e:
            errors.append({"row": i, "error": str(e)})
            skipped += 1

    db.commit()
    return {
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:20],
    }


@router.post("/card-files")
async def import_card_files(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Import ship-to addresses (Jim2 CardFile export for delivery cards)."""
    rows = parse_csv(await _read_csv_file(file))
    inserted = updated = skipped = 0
    errors: list[dict] = []

    for i, row in enumerate(rows, 1):
        raw_vals = list(row.values())
        if raw_vals and str(raw_vals[0]).startswith("#"):
            continue
        if not any(v and str(v).strip() for v in row.values()):
            continue

        try:
            mapped = map_row(row, CARD_FILE_MAP)
            ship_code = mapped.get("ship_code")
            if not ship_code:
                errors.append({"row": i, "error": "Missing ship_code / Card Code"})
                skipped += 1
                continue

            # Derive customer_code from ship_code prefix if not supplied
            customer_code = mapped.get("customer_code")
            if not customer_code:
                prefix = ship_code.split(".")[0]
                customer_code = prefix + ".HO"  # best guess

            existing = (
                db.query(CardFile).filter(CardFile.ship_code == ship_code).first()
            )

            data: dict[str, Any] = {
                "ship_code": ship_code,
                "customer_code": customer_code,
                "company_name": mapped.get("company_name"),
                "contact_name": mapped.get("contact_name"),
                "address1": mapped.get("address1"),
                "address2": mapped.get("address2"),
                "suburb": mapped.get("suburb"),
                "state": mapped.get("state"),
                "postcode": mapped.get("postcode"),
                "country": mapped.get("country") or "AU",
                "phone": mapped.get("phone"),
                "email": mapped.get("email"),
                "notes": mapped.get("notes"),
            }

            if existing:
                for k, v in data.items():
                    if k != "ship_code" and v is not None:
                        setattr(existing, k, v)
                updated += 1
            else:
                db.add(CardFile(**data))
                inserted += 1
        except Exception as e:
            errors.append({"row": i, "error": str(e)})
            skipped += 1

    db.commit()
    return {
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:20],
    }


@router.post("/preview")
async def preview_csv(file: UploadFile = File(...), _: User = Depends(require_staff)):
    """Return first 10 rows + detected columns + auto-detected entity type."""
    rows = parse_csv(await _read_csv_file(file))
    # Skip comment/blank rows for preview
    data_rows = [
        r
        for r in rows
        if any(v and str(v).strip() for v in r.values())
        and not (list(r.values()) and str(list(r.values())[0]).startswith("#"))
    ]
    columns = list(rows[0].keys()) if rows else []

    # Auto-detect entity type from column names
    col_set = {normalise_key(c) for c in columns}
    detected = "unknown"
    if any(c in col_set for c in ("job#", "job_id", "job_no")):
        detected = "jobs"
    elif any(c in col_set for c in ("stock_code", "sku", "shortdesc")):
        detected = "inventory"
    elif any(c in col_set for c in ("cust#", "card_code", "card#")):
        detected = "customers"
    elif any(c in col_set for c in ("vend#", "supplier_id", "supplier_code")):
        detected = "suppliers"
    elif any(c in col_set for c in ("ship_code", "ship#", "ship_to_code")):
        detected = "card_files"

    return {
        "columns": columns,
        "row_count": len(data_rows),
        "preview": data_rows[:10],
        "detected_type": detected,
    }

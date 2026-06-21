"""
Seed realistic demo / test data for the testing period.

Idempotent and additive: every row is created only if its primary key does not
already exist, so this is safe to run repeatedly and will never clobber real
data or create duplicates. Run it against a fresh database before the testing
period so staff exercise the system against a realistic dataset.

Usage:
    cd backend
    python seed_data.py
"""

from decimal import Decimal, ROUND_HALF_UP

from app.database import SessionLocal
from app.models.customer import Customer
from app.models.supplier import Supplier
from app.models.inventory import InventoryItem
from app.models.job import Job, JobItem, JobComment

GST = Decimal("0.10")


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

CUSTOMERS = [
    dict(
        id="SYD.CRICKE",
        name="Sydney Cricket Venues NSW",
        contact="Max Brightwell",
        email="maxbasixmax@example.com",
        phone="02 9360 6601",
        mobile="0405 140 090",
        address="GPO Box 150, Sydney NSW 2001",
        account_type="Account",
        payment_terms="Net 30",
        credit_limit=25000,
        balance=0,
        ytd_sales=84200,
        account_manager="Ann N.",
        customer_group="Sport",
        territory="NSW",
    ),
    dict(
        id="ZONE.BOWL",
        name="Zone Bowling Australia",
        contact="Priya Sharma",
        email="priya@example.com",
        phone="03 9001 2200",
        mobile="0412 880 145",
        address="44 Latrobe St, Melbourne VIC 3000",
        account_type="Account",
        payment_terms="Net 30",
        credit_limit=40000,
        balance=1320.00,
        ytd_sales=152900,
        account_manager="Dan K.",
        customer_group="Hospitality",
        territory="VIC",
    ),
    dict(
        id="BLUE.EARTH",
        name="Blue Earth Landscaping",
        contact="Tom Reilly",
        email="tom@example.com",
        phone="07 3220 7788",
        mobile="0438 220 991",
        address="9 Kingsford Smith Dr, Hamilton QLD 4007",
        account_type="Account",
        payment_terms="Net 14",
        credit_limit=8000,
        balance=0,
        ytd_sales=18650,
        account_manager="Ann N.",
        customer_group="Trade",
        territory="QLD",
    ),
    dict(
        id="WESTPAC.FC",
        name="Westpac Junior FC",
        contact="Janelle Wu",
        email="janelle@example.com",
        phone="02 9881 4500",
        mobile="0401 553 207",
        address="2 Olympic Blvd, Sydney Olympic Park NSW 2127",
        account_type="Account",
        payment_terms="Net 30",
        credit_limit=12000,
        balance=550.00,
        ytd_sales=42100,
        account_manager="Dan K.",
        customer_group="Sport",
        territory="NSW",
    ),
    dict(
        id="OUTBACK.MIN",
        name="Outback Mining Services",
        contact="Greg Pearson",
        email="greg@example.com",
        phone="08 9100 3344",
        mobile="0419 770 332",
        address="Lot 5 Great Eastern Hwy, Kalgoorlie WA 6430",
        account_type="Account",
        payment_terms="Net 60",
        credit_limit=60000,
        balance=4870.00,
        ytd_sales=233400,
        account_manager="Ann N.",
        customer_group="Industrial",
        territory="WA",
    ),
    dict(
        id="CASH.SALE",
        name="Cash Sale (Walk-in)",
        contact="",
        email="",
        phone="",
        mobile="",
        address="",
        account_type="Cash",
        payment_terms="COD",
        credit_limit=0,
        balance=0,
        ytd_sales=6120,
        account_manager="",
        customer_group="Retail",
        territory="NSW",
    ),
]

SUPPLIERS = [
    dict(
        id="AS.COLOUR",
        name="AS Colour Wholesale",
        contact="Orders Desk",
        email="orders@example.com",
        phone="02 8000 1100",
        address="120 Bourke Rd, Alexandria NSW 2015",
        payment_terms="Net 30",
    ),
    dict(
        id="BIZ.COLLEC",
        name="Biz Collection",
        contact="Sales",
        email="sales@example.com",
        phone="07 3200 9090",
        address="33 Boniface St, Archerfield QLD 4108",
        payment_terms="Net 30",
    ),
    dict(
        id="MADEIRA.TH",
        name="Madeira Threads AU",
        contact="Account Manager",
        email="hello@example.com",
        phone="03 9555 4242",
        address="6 Suttor St, Notting Hill VIC 3168",
        payment_terms="Net 14",
    ),
]

# sku, name, category, supplier, stock, min_stock, unit_cost, sell_price, location, weight
INVENTORY = [
    (
        "AS5026-BLK-M",
        "AS Colour Staple Tee Black M",
        "Apparel",
        "AS Colour Wholesale",
        480,
        100,
        6.20,
        18.00,
        "A-01-03",
        0.180,
    ),
    (
        "AS5026-BLK-L",
        "AS Colour Staple Tee Black L",
        "Apparel",
        "AS Colour Wholesale",
        65,
        100,
        6.20,
        18.00,
        "A-01-04",
        0.195,
    ),
    (
        "AS5026-WHT-L",
        "AS Colour Staple Tee White L",
        "Apparel",
        "AS Colour Wholesale",
        510,
        100,
        6.20,
        18.00,
        "A-02-01",
        0.195,
    ),
    (
        "BZ-P244-NVY",
        "Biz Polo Navy",
        "Apparel",
        "Biz Collection",
        240,
        60,
        9.80,
        28.00,
        "B-03-02",
        0.230,
    ),
    (
        "BZ-HIVIS-ORG",
        "Biz Hi-Vis Day Polo Orange",
        "Workwear",
        "Biz Collection",
        38,
        50,
        12.40,
        34.00,
        "B-05-01",
        0.260,
    ),
    (
        "CAP-5PNL-BLK",
        "5-Panel Trucker Cap Black",
        "Headwear",
        "AS Colour Wholesale",
        320,
        80,
        4.10,
        14.00,
        "C-01-01",
        0.090,
    ),
    (
        "HOODIE-AS-GRY",
        "AS Colour Supply Hood Grey",
        "Apparel",
        "AS Colour Wholesale",
        150,
        40,
        19.50,
        52.00,
        "A-04-02",
        0.620,
    ),
    (
        "EMB-THR-BLK",
        "Madeira Rayon Thread Black 1000m",
        "Consumable",
        "Madeira Threads AU",
        90,
        20,
        3.40,
        0.00,
        "D-01-01",
        0.080,
    ),
    (
        "DTF-FILM-A3",
        "DTF Transfer Film A3",
        "Consumable",
        "Madeira Threads AU",
        1200,
        200,
        0.85,
        0.00,
        "D-02-03",
        0.020,
    ),
    ("FREIGHT", "Freight / Delivery", "Service", "", 0, 0, 0.00, 0.00, "", 0.000),
    ("SETUP-SCRN", "Screen Setup Fee", "Service", "", 0, 0, 0.00, 35.00, "", 0.000),
    (
        "DEC-EMB-LEFT",
        "Embroidery - Left Chest",
        "Decoration",
        "",
        0,
        0,
        0.00,
        8.50,
        "",
        0.000,
    ),
]


def build_job(
    seq,
    cust,
    status,
    *,
    lines,
    due,
    date_in,
    cust_ref="",
    description="",
    decoration_summary=None,
    priority="Normal",
    acc_mgr="",
    comments=None,
    ship_contact="",
    ship_addr="",
    ship_to="",
):
    """Construct a Job + items with totals derived from the line items."""
    items = []
    total_ex = Decimal("0")
    weight_total = Decimal("0")
    for sort, ln in enumerate(lines):
        dt = ln.get("display_type", "product")
        qty = ln.get("qty", 0)
        price_ex = money(ln.get("price_ex", 0))
        line_total = money(price_ex * qty)
        unit_w = Decimal(str(ln.get("weight", 0)))
        if dt == "product":
            total_ex += line_total
            weight_total += unit_w * qty
        items.append(
            JobItem(
                sort=sort,
                display_type=dt,
                description=ln.get("description", ""),
                stock_code=ln.get("stock_code", ""),
                sizes=ln.get("sizes", ""),
                decoration_type=ln.get("decoration_type", "None"),
                dec_position=ln.get("dec_position", ""),
                order_qty=qty,
                qty=qty,
                supply_qty=qty,
                weight_kg=unit_w,
                purchase_price=money(ln.get("cost", 0)),
                price_ex=price_ex,
                price_inc=money(price_ex * (1 + GST)),
                total=line_total,
            )
        )

    tax = money(total_ex * GST)
    total_inc = money(total_ex + tax)

    paid = Decimal("0")
    if status == "PAID":
        paid = total_inc
        payment_status, invoice_status = "paid", "invoiced"
    elif status == "INVOICE":
        payment_status, invoice_status = "unpaid", "invoiced"
    elif status == "FINISH":
        payment_status, invoice_status = "unpaid", "to_invoice"
    else:
        payment_status, invoice_status = "unpaid", "not_invoiced"
    balance = money(total_inc - paid)

    job = Job(
        id=str(1207500 + seq),
        customer_id=cust["id"],
        customer_name=cust["name"],
        status=status,
        date_in=date_in,
        due=due,
        priority=priority,
        type="Normal",
        acc_mgr=acc_mgr or cust.get("account_manager", ""),
        assigned_to=acc_mgr or cust.get("account_manager", ""),
        cust_ref=cust_ref,
        our_ref=ship_contact or cust.get("contact", ""),
        description=description,
        name_contact=ship_contact or cust.get("contact", ""),
        ship_to=ship_to,
        shipping_address=ship_addr or cust.get("address", ""),
        price_level="1",
        branch="HQ",
        total_ex=total_ex,
        tax=tax,
        total_inc=total_inc,
        deposit=paid,
        balance_due=balance,
        payment_status=payment_status,
        invoice_status=invoice_status,
        payment_method=cust.get("account_type", "Account"),
        weight_total=money(weight_total) if weight_total else Decimal("0"),
        invoice="INV-" + str(1207500 + seq) if invoice_status == "invoiced" else None,
    )
    job.items = items
    for c in comments or []:
        job.comments.append(JobComment(**c))
    return job


def jobs_spec():
    c = {row["id"]: row for row in CUSTOMERS}
    return [
        build_job(
            1,
            c["WESTPAC.FC"],
            "QUOTE",
            cust_ref="2026 SEASON KIT",
            description="Junior FC playing shirts + training tees",
            due="04/07/2026 05:00 PM",
            date_in="18/06/2026",
            priority="Normal",
            acc_mgr="Dan K.",
            lines=[
                dict(display_type="section", description="Playing Kit"),
                dict(
                    description="Staple Tee White L",
                    stock_code="AS5026-WHT-L",
                    sizes="L x40",
                    decoration_type="DTF",
                    dec_position="Full Back",
                    qty=40,
                    price_ex=24.00,
                    cost=6.20,
                    weight=0.195,
                ),
                dict(
                    description="Screen Setup Fee",
                    stock_code="SETUP-SCRN",
                    qty=1,
                    price_ex=35.00,
                ),
            ],
            comments=[
                dict(
                    date="18/06/2026",
                    time="09:14",
                    initials="DK",
                    author_name="Dan K.",
                    status="QUOTE",
                    inc=True,
                    comment="Quote sent to Janelle for approval.",
                )
            ],
        ),
        build_job(
            2,
            c["SYD.CRICKE"],
            "ORDER",
            cust_ref="MAX BRIGHTWELL",
            description="Ad-Hoc Sale - staff polos",
            due="24/06/2026 04:53 PM",
            date_in="10/06/2026",
            acc_mgr="Ann N.",
            ship_contact="Max Brightwell",
            ship_addr="13 Lobb Crescent, Beverley Park NSW 2217",
            ship_to="HOME.DEL",
            lines=[
                dict(
                    description="Biz Polo Navy",
                    stock_code="BZ-P244-NVY",
                    sizes="M x12, L x12",
                    decoration_type="EMB",
                    dec_position="Left Chest",
                    qty=24,
                    price_ex=30.00,
                    cost=9.80,
                    weight=0.230,
                ),
                dict(
                    description="Embroidery - Left Chest",
                    stock_code="DEC-EMB-LEFT",
                    qty=24,
                    price_ex=0.00,
                ),
            ],
        ),
        build_job(
            3,
            c["ZONE.BOWL"],
            "In Progress",
            cust_ref="PO-44821",
            description="Crew uniforms - tees + caps",
            due="27/06/2026 12:00 PM",
            date_in="12/06/2026",
            acc_mgr="Dan K.",
            lines=[
                dict(
                    description="Staple Tee Black M",
                    stock_code="AS5026-BLK-M",
                    sizes="M x60",
                    decoration_type="Screen",
                    dec_position="Front + Back",
                    qty=60,
                    price_ex=22.00,
                    cost=6.20,
                    weight=0.180,
                ),
                dict(
                    description="Trucker Cap Black",
                    stock_code="CAP-5PNL-BLK",
                    sizes="OSFA x60",
                    decoration_type="EMB",
                    dec_position="Front",
                    qty=60,
                    price_ex=19.00,
                    cost=4.10,
                    weight=0.090,
                ),
            ],
            comments=[
                dict(
                    date="13/06/2026",
                    time="11:02",
                    initials="DK",
                    author_name="Dan K.",
                    status="In Progress",
                    inc=False,
                    is_internal=True,
                    comment="Screens burned, on press Monday.",
                )
            ],
        ),
        build_job(
            4,
            c["BLUE.EARTH"],
            "PROOF",
            cust_ref="QUOTE 1190",
            description="Hi-vis day polos for ground crew",
            due="30/06/2026 05:00 PM",
            date_in="16/06/2026",
            acc_mgr="Ann N.",
            lines=[
                dict(
                    description="Hi-Vis Day Polo Orange",
                    stock_code="BZ-HIVIS-ORG",
                    sizes="L x10, XL x10",
                    decoration_type="EMB",
                    dec_position="Left Chest + Back",
                    qty=20,
                    price_ex=38.00,
                    cost=12.40,
                    weight=0.260,
                ),
            ],
            comments=[
                dict(
                    date="17/06/2026",
                    time="15:40",
                    initials="AN",
                    author_name="Ann N.",
                    status="PROOF",
                    inc=True,
                    comment="Proof emailed - awaiting sign-off.",
                )
            ],
        ),
        build_job(
            5,
            c["OUTBACK.MIN"],
            "PRINT",
            cust_ref="REQ-9920",
            description="Site crew tees - bulk run",
            due="02/07/2026 05:00 PM",
            date_in="11/06/2026",
            priority="High",
            acc_mgr="Ann N.",
            lines=[
                dict(
                    description="Staple Tee Black M",
                    stock_code="AS5026-BLK-M",
                    sizes="M x120",
                    decoration_type="DTF",
                    dec_position="Left Chest + Back",
                    qty=120,
                    price_ex=21.00,
                    cost=6.20,
                    weight=0.180,
                ),
                dict(
                    description="Freight / Delivery",
                    stock_code="FREIGHT",
                    qty=1,
                    price_ex=64.00,
                ),
            ],
        ),
        build_job(
            6,
            c["ZONE.BOWL"],
            "Pick/Pack",
            cust_ref="PO-44712",
            description="Reorder - venue staff hoodies",
            due="26/06/2026 02:00 PM",
            date_in="09/06/2026",
            acc_mgr="Dan K.",
            lines=[
                dict(
                    description="Supply Hood Grey",
                    stock_code="HOODIE-AS-GRY",
                    sizes="M x15, L x15",
                    decoration_type="EMB",
                    dec_position="Left Chest",
                    qty=30,
                    price_ex=56.00,
                    cost=19.50,
                    weight=0.620,
                ),
            ],
        ),
        build_job(
            7,
            c["WESTPAC.FC"],
            "FINISH",
            cust_ref="2025 PRESENTATION",
            description="Presentation night polos",
            due="20/06/2026 05:00 PM",
            date_in="02/06/2026",
            acc_mgr="Dan K.",
            lines=[
                dict(
                    description="Biz Polo Navy",
                    stock_code="BZ-P244-NVY",
                    sizes="S x20, M x20",
                    decoration_type="EMB",
                    dec_position="Left Chest",
                    qty=40,
                    price_ex=29.00,
                    cost=9.80,
                    weight=0.230,
                ),
            ],
        ),
        build_job(
            8,
            c["SYD.CRICKE"],
            "INVOICE",
            cust_ref="VENUE MERCH",
            description="Retail merch tees",
            due="14/06/2026 05:00 PM",
            date_in="28/05/2026",
            acc_mgr="Ann N.",
            lines=[
                dict(
                    description="Staple Tee White L",
                    stock_code="AS5026-WHT-L",
                    sizes="L x80",
                    decoration_type="DTF",
                    dec_position="Full Front",
                    qty=80,
                    price_ex=23.00,
                    cost=6.20,
                    weight=0.195,
                ),
                dict(
                    description="Freight / Delivery",
                    stock_code="FREIGHT",
                    qty=1,
                    price_ex=48.00,
                ),
            ],
        ),
        build_job(
            9,
            c["OUTBACK.MIN"],
            "PAID",
            cust_ref="REQ-9810",
            description="Crew caps embroidered",
            due="06/06/2026 05:00 PM",
            date_in="22/05/2026",
            acc_mgr="Ann N.",
            lines=[
                dict(
                    description="Trucker Cap Black",
                    stock_code="CAP-5PNL-BLK",
                    sizes="OSFA x100",
                    decoration_type="EMB",
                    dec_position="Front",
                    qty=100,
                    price_ex=18.00,
                    cost=4.10,
                    weight=0.090,
                ),
            ],
            comments=[
                dict(
                    date="06/06/2026",
                    time="16:20",
                    initials="AN",
                    author_name="Ann N.",
                    status="PAID",
                    inc=True,
                    comment="Paid in full via EFT.",
                )
            ],
        ),
        build_job(
            10,
            c["CASH.SALE"],
            "PAID",
            cust_ref="",
            description="Walk-in - blank tees",
            due="05/06/2026 05:00 PM",
            date_in="05/06/2026",
            acc_mgr="",
            lines=[
                dict(
                    description="Staple Tee Black L",
                    stock_code="AS5026-BLK-L",
                    sizes="L x5",
                    qty=5,
                    price_ex=18.00,
                    cost=6.20,
                    weight=0.195,
                ),
            ],
        ),
        build_job(
            11,
            c["BLUE.EARTH"],
            "QUOTE",
            cust_ref="ENQUIRY",
            description="Embroidered workwear enquiry",
            due="10/07/2026 05:00 PM",
            date_in="19/06/2026",
            acc_mgr="Ann N.",
            lines=[
                dict(
                    description="Hi-Vis Day Polo Orange",
                    stock_code="BZ-HIVIS-ORG",
                    sizes="TBC x25",
                    decoration_type="EMB",
                    dec_position="Left Chest",
                    qty=25,
                    price_ex=37.00,
                    cost=12.40,
                    weight=0.260,
                ),
            ],
        ),
        build_job(
            12,
            c["ZONE.BOWL"],
            "CANCEL",
            cust_ref="PO-44099",
            description="Cancelled - duplicate order",
            due="—",
            date_in="01/06/2026",
            acc_mgr="Dan K.",
            lines=[
                dict(
                    description="Staple Tee Black M",
                    stock_code="AS5026-BLK-M",
                    sizes="M x30",
                    qty=30,
                    price_ex=22.00,
                    cost=6.20,
                    weight=0.180,
                ),
            ],
            comments=[
                dict(
                    date="03/06/2026",
                    time="10:05",
                    initials="DK",
                    author_name="Dan K.",
                    status="CANCEL",
                    inc=False,
                    is_internal=True,
                    comment="Customer placed duplicate - cancelled.",
                )
            ],
        ),
    ]


def seed():
    db = SessionLocal()
    created = {"customers": 0, "suppliers": 0, "inventory": 0, "jobs": 0}
    try:
        for row in CUSTOMERS:
            if not db.get(Customer, row["id"]):
                db.add(Customer(**row))
                created["customers"] += 1

        for row in SUPPLIERS:
            if not db.get(Supplier, row["id"]):
                db.add(Supplier(**row))
                created["suppliers"] += 1

        for sku, name, cat, sup, stock, mn, cost, sell, loc, wt in INVENTORY:
            if not db.get(InventoryItem, sku):
                db.add(
                    InventoryItem(
                        sku=sku,
                        name=name,
                        category=cat,
                        supplier=sup,
                        stock=stock,
                        min_stock=mn,
                        unit_cost=money(cost),
                        sell_price=money(sell),
                        location=loc,
                        weight_kg=Decimal(str(wt)),
                        status="Active",
                    )
                )
                created["inventory"] += 1

        # Customers must be flushed before jobs (FK on customer_id).
        db.flush()

        for job in jobs_spec():
            if not db.get(Job, job.id):
                db.add(job)
                created["jobs"] += 1

        db.commit()
        print("Seed complete (additive - existing rows left untouched):")
        for k, v in created.items():
            print(f"  {k:>10}: +{v}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()

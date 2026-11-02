"""Load demo data modelled on Total Image Group's customers, through the API.

Every record goes in through the app's own routes, acting as the first active
admin, so it passes the rules a person at the screen would: the status gate,
reservations, the proof gate, receiving, despatch, invoice numbers and the
ledger. (seed_data.py writes rows directly and skips all of that.)

The customers are TIG clients named on its public website (client stores and
case studies) or already named in docs/backlog.md. Their contacts, phones and
emails are left empty: the repository is public.

Usage, on a database at `alembic upgrade head` with an admin made by
seed_admin.py:

    cd backend
    python seed_demo.py

Re-running completes the customers, suppliers, stock and logos: each, and each
step on it (sites, opening stock, price breaks, proof), only if missing. The
jobs, purchase orders and bills go in once: the run skips them when the demo's
first job exists. Load it on a database seed_data.py has not been run on.
"""

import sys
from datetime import date, timedelta

from app.models.customer import Customer
from app.models.customer_ship_to import CustomerShipTo
from app.models.inventory import InventoryItem, StockMovement
from app.models.job import Job
from app.models.logo import Logo
from app.models.stock_pricing import StockPriceLevel
from app.models.supplier import Supplier

# The data reads as tables, a record a row.
# fmt: off

# code, name, group, state, terms, credit limit, account manager
CUSTOMERS = [
    ("SUTH.SHIRE", "Sutherland Shire Council", "Council", "NSW", "30DAYSINV", 120000, "Ann N."),
    ("ARCARE", "Arcare Aged Care", "Aged Care", "VIC", "30 EOM", 90000, "Dan K."),
    ("GOODSTART", "Goodstart Early Learning", "Childcare", "QLD", "30DAYSINV", 60000, "Ann N."),
    ("YHA", "YHA Australia", "Hospitality", "NSW", "30DAYSINV", 30000, "Dan K."),
    ("AVEO", "Aveo Group", "Retirement Living", "QLD", "30 EOM", 40000, "Ann N."),
    ("BANK.SYD", "Bank of Sydney", "Finance", "NSW", "30 EOM", 25000, "Dan K."),
    ("RICOH", "Ricoh Australia", "Corporate", "NSW", "Net 30", 50000, "Ann N."),
    ("ZONE.BOWL", "Zone Bowling", "Entertainment", "NSW", "Net 30", 30000, "Dan K."),
    ("TIMEZONE", "Timezone", "Entertainment", "NSW", "Net 30", 30000, "Dan K."),
    ("MERRY.RSL", "Merrylands RSL", "Club", "NSW", "Net 14", 15000, "Ann N."),
]

# customer, code, name, city, state, postcode
SHIP_TOS = [
    ("SUTH.SHIRE", "SSC.DEPOT", "Works Depot", "Sutherland", "NSW", "2232"),
    ("SUTH.SHIRE", "SSC.ADMIN", "Administration Centre", "Sutherland", "NSW", "2232"),
    ("ARCARE", "AR.KNO", "Arcare Knox", "Wantirna South", "VIC", "3152"),
    ("ARCARE", "AR.PAR", "Arcare Parkville", "Parkville", "VIC", "3052"),
    ("ARCARE", "AR.HEL", "Arcare Helensvale", "Helensvale", "QLD", "4212"),
    ("GOODSTART", "GS.SUTH", "Goodstart Sutherland", "Sutherland", "NSW", "2232"),
]

# code, name, terms
SUPPLIERS = [
    ("AS.COLOUR", "AS Colour Wholesale", "Net 30"),
    ("BIZ.COLLEC", "Biz Collection", "Net 30"),
    ("KING.GEE", "King Gee Workwear", "30 EOM"),
    ("STITCHWORKS", "Stitchworks Embroidery (subcontract)", "Net 14"),
]

# sku, name, category, supplier, opening stock, min, cost, sell, weight kg
STOCK = [
    ("AS5001-WHT-M", "AS Colour Staple Tee White M", "Apparel", "AS Colour Wholesale", 140, 60, 6.20, 18.00, 0.19),
    ("AS5001-WHT-L", "AS Colour Staple Tee White L", "Apparel", "AS Colour Wholesale", 110, 60, 6.20, 18.00, 0.20),
    ("AS5001-BLK-M", "AS Colour Staple Tee Black M", "Apparel", "AS Colour Wholesale", 90, 60, 6.20, 18.00, 0.19),
    ("AS1105-BLK", "AS Colour Access Cap Black", "Headwear", "AS Colour Wholesale", 200, 50, 4.10, 14.00, 0.09),
    ("BZ-P400-NVY-M", "Biz Crew Polo Navy M", "Apparel", "Biz Collection", 120, 40, 11.50, 32.00, 0.23),
    ("BZ-P400-NVY-L", "Biz Crew Polo Navy L", "Apparel", "Biz Collection", 80, 40, 11.50, 32.00, 0.24),
    ("BZ-P400-NVY-XL", "Biz Crew Polo Navy XL", "Apparel", "Biz Collection", 30, 20, 11.50, 32.00, 0.25),
    ("BZ-J307-BLK-L", "Biz Soft Shell Jacket Black L", "Outerwear", "Biz Collection", 25, 10, 38.00, 89.00, 0.62),
    ("KG-HV-ORG-L", "King Gee Hi-Vis D/N Shirt Orange L", "Workwear", "King Gee Workwear", 30, 20, 24.00, 58.00, 0.30),
    ("KG-HV-ORG-XL", "King Gee Hi-Vis D/N Shirt Orange XL", "Workwear", "King Gee Workwear", 6, 20, 24.00, 58.00, 0.32),
    # A charge: category Service, so it is never reserved, bought or picked.
    ("FREIGHT", "Freight - metro satchel", "Service", None, 0, 0, 9.00, 15.00, 0),
]

# The polo's price breaks: price level 1, by the line's own quantity.
POLO_BREAKS = [(1, 32.00), (25, 29.50), (100, 27.00)]

# code, customer, name, decoration type, position, price ex, cost ex, decorator
LOGOS = [
    ("EMB.SSC", "SUTH.SHIRE", "Council crest", "Embroidery", "LHC", 9.00, 2.80, None),
    ("EMB.ARCARE", "ARCARE", "Arcare logo", "Embroidery", "LHC", 9.00, 2.80, None),
    ("EMB.GOODSTART", "GOODSTART", "Goodstart logo", "Embroidery", "LHC", 8.50, 2.60, None),
    ("EMB.YHA", "YHA", "YHA logo", "Embroidery", "LHC", 8.50, 2.60, None),
    ("EMB.AVEO", "AVEO", "Aveo logo", "Embroidery", "LHC", 9.00, 2.80, None),
    ("EMB.BANKSYD", "BANK.SYD", "Bank of Sydney logo", "Embroidery", "LHC", 9.50, 3.00, None),
    ("EMB.RIC", "RICOH", "Ricoh logo", "Embroidery", "LHC", 8.00, 2.50, "STITCHWORKS"),
    ("EMB.TIMEZONE", "TIMEZONE", "Timezone logo", "Embroidery", "LHC", 8.50, 2.60, None),
]

# fmt: on

# Still with the customer: a job using it waits at PROOF.
PROOF_SENT_ONLY = {"EMB.TIMEZONE"}

LADDER = ["ORDER", "In Progress", "PROOF", "PRINT", "Pick/Pack", "Desp/Ready"]

# The council's order is the demo's first job: once it exists, the work is in.
FIRST_JOB_REF = "PO 4410-OUTDOOR"

# Every call commits, so a run that stops leaves what went before it.
AFTER_A_STOP = (
    "What went in before this step stays in. Running again completes the "
    "customers, suppliers, stock and logos; if the jobs had started, reset "
    "the database and run again to load them whole."
)


class SeedError(RuntimeError):
    pass


def day(offset: int) -> str:
    return (date.today() + timedelta(days=offset)).isoformat()


def call(client, method: str, path: str, body=None, params=None):
    r = client.request(method, path, json=body, params=params)
    if r.status_code >= 400:
        raise SeedError(f"{method} {path} -> {r.status_code}: {r.text}")
    return r.json() if r.content else None


# ── Masters ──────────────────────────────────────────────────────────────────


def load_masters(client, db) -> dict:
    """Each record, and each thing done to it, only if it is not there yet:
    a run stopped part way is completed by the next."""
    added = dict.fromkeys(("customers", "suppliers", "stock", "logos"), 0)
    for code, name, group, state, terms, limit, manager in CUSTOMERS:
        if not db.get(Customer, code):
            call(
                client,
                "POST",
                "/customers",
                {
                    "id": code,
                    "name": name,
                    "account_type": "Account",
                    "payment_terms": terms,
                    "credit_limit": limit,
                    "account_manager": manager,
                    "customer_group": group,
                    "territory": state,
                },
            )
            added["customers"] += 1
        for cust, ship, ship_name, city, st, postcode in SHIP_TOS:
            if cust == code and not _site(db, cust, ship):
                call(
                    client,
                    "POST",
                    f"/customers/{code}/ship-tos",
                    {
                        "code": ship,
                        "name": ship_name,
                        "city": city,
                        "state": st,
                        "postcode": postcode,
                    },
                )

    for code, name, terms in SUPPLIERS:
        if not db.get(Supplier, code):
            call(
                client,
                "POST",
                "/suppliers",
                {"id": code, "name": name, "payment_terms": terms},
            )
            added["suppliers"] += 1

    for sku, name, cat, supplier, opening, mn, cost, sell, kg in STOCK:
        if not db.query(InventoryItem).filter(InventoryItem.sku == sku).first():
            call(
                client,
                "POST",
                "/inventory",
                {
                    "sku": sku,
                    "name": name,
                    "category": cat,
                    "supplier": supplier,
                    "min_stock": mn,
                    "unit_cost": cost,
                    "sell_price": sell,
                    "weight_kg": kg,
                },
            )
            added["stock"] += 1
        moved = db.query(StockMovement.id).filter(StockMovement.sku == sku).first()
        if opening and not moved:
            # Opening stock through the shared movement path, so the branch
            # position and the movement history agree with the item.
            call(
                client,
                "POST",
                f"/inventory/{sku}/adjust",
                {
                    "adjustment": opening,
                    "reason": "Opening stock",
                    "branch": "HQ",
                },
            )
        priced = db.query(StockPriceLevel.id).filter(StockPriceLevel.sku == sku).first()
        if sku.startswith("BZ-P400") and not priced:
            call(
                client,
                "POST",
                f"/inventory/{sku}/pricing/levels",
                {
                    "price_level": "1",
                    "breakpoints": [
                        {"min_qty": q, "price_ex": p, "price_inc": round(p * 1.1, 2)}
                        for q, p in POLO_BREAKS
                    ],
                },
            )

    for code, cust, name, kind, pos, price, cost, decorator in LOGOS:
        logo = db.query(Logo).filter(Logo.code == code).first()
        if logo:
            logo_id, proof = logo.id, logo.proof_status
        else:
            made = call(
                client,
                "POST",
                "/logos",
                {
                    "code": code,
                    "customer_id": cust,
                    "name": name,
                    "decoration_type": kind,
                    "position": pos,
                    "price_ex": price,
                    "cost_ex": cost,
                    "made_by": "subcontract" if decorator else "in_house",
                    "supplier_id": decorator,
                },
            )
            logo_id, proof = made["id"], made.get("proof_status")
            added["logos"] += 1
        wanted = "sent" if code in PROOF_SENT_ONLY else "approved"
        if proof != wanted:
            call(client, "POST", f"/logos/{logo_id}/proof", {"status": wanted})
    return added


def _site(db, customer: str, code: str):
    return (
        db.query(CustomerShipTo)
        .filter(CustomerShipTo.customer_id == customer, CustomerShipTo.code == code)
        .first()
    )


def site(db, customer: str, code: str) -> dict:
    """A job's delivery site: the code, the record, and the address it prints."""
    found = _site(db, customer, code)
    place = " ".join(p for p in (found.city, found.state, found.postcode) if p)
    return {
        "ship_to": code,
        "ship_to_id": found.id,
        "shipping_address": f"{found.name}, {place}",
    }


# ── The work in hand ─────────────────────────────────────────────────────────


def new_job(client, customer, lines, *, days_ago, due_in, **header) -> dict:
    """A job booked `days_ago`, its lines as (stock code, qty[, applies to])."""
    items = []
    for sort, line in enumerate(lines):
        code, qty, *on = line
        item = {"sort": sort, "stock_code": code, "order_qty": qty}
        if on:
            item["applies_to_line"] = on[0]
        items.append(item)
    return call(
        client,
        "POST",
        "/jobs",
        {
            "customer_id": customer,
            "date_in": day(-days_ago),
            "due": day(due_in),
            "price_level": "1",
            "items": items,
            **header,
        },
    )


def climb(client, job_id: str, start: str, to: str) -> None:
    """Up the ladder one step at a time, as the floor would, from `start` to `to`."""
    steps = ("QUOTE", *LADDER, "FINISH", "INVOICE", "PAID")
    for status in steps[steps.index(start) + 1 : steps.index(to) + 1]:
        call(client, "POST", f"/jobs/{job_id}/status", {"status": status})


def pay(client, job: dict, method="EFT", ref=None) -> None:
    owed = call(client, "GET", f"/jobs/{job['id']}")["balance_due"]
    call(
        client,
        "POST",
        f"/jobs/{job['id']}/payment",
        {
            "amount": owed,
            "method": method,
            "reference": ref or f"Remit {job['id']}",
            "received_date": day(0),
        },
    )


def load_work(client, db) -> dict:
    jobs = {}

    # Council outdoor crews: hi-vis with the crest. Six XL are short, so a
    # PO to King Gee is raised from the back-order and received.
    ssc = new_job(
        client,
        "SUTH.SHIRE",
        [
            ("KG-HV-ORG-L", 20),
            ("EMB.SSC", 20, 0),
            ("KG-HV-ORG-XL", 12),
            ("EMB.SSC", 12, 2),
        ],
        days_ago=21,
        due_in=-2,
        status="ORDER",
        cust_ref=FIRST_JOB_REF,
        description="Outdoor crew hi-vis, council crest LHC",
        **site(db, "SUTH.SHIRE", "SSC.DEPOT"),
    )
    jobs["council"] = ssc["id"]
    po = call(
        client,
        "POST",
        "/purchase-orders/from-back-orders",
        {
            "id": "PO-DEMO-001",
            "supplier_id": "KING.GEE",
            "supplier_name": "King Gee Workwear",
            # Raised today (the route dates it), due in two days, here early.
            "expected_date": day(2),
            "items": [
                {
                    "sku": "KG-HV-ORG-XL",
                    "qty": 6,
                    "unit_cost": 24.00,
                    "job_ids": [ssc["id"]],
                }
            ],
        },
    )
    line = next(i for i in po["items"] if i["sku"] == "KG-HV-ORG-XL")
    call(
        client,
        "POST",
        f"/purchase-orders/{po['id']}/receive",
        {"items": [{"id": line["id"], "qty_received": 6}]},
    )
    bill = call(
        client,
        "POST",
        "/ap/bills",
        {
            "supplier_id": "KING.GEE",
            "supplier_name": "King Gee Workwear",
            "po_id": po["id"],
            "bill_number": "KG-881204",
            "bill_date": day(0),
            "due_date": day(30),
            "amount_ex": 144.00,
            "tax": 14.40,
            "amount_inc": 158.40,
        },
    )
    call(
        client,
        "POST",
        f"/ap/bills/{bill['id']}/pay",
        {"paid_amount": 158.40, "paid_date": day(0), "reference": "EFT 77120"},
    )
    climb(client, ssc["id"], "ORDER", "Pick/Pack")
    call(client, "POST", "/jobs/auto-pick", {"job_ids": [ssc["id"]]})
    climb(client, ssc["id"], "Pick/Pack", "Desp/Ready")

    # Aged care: one head office, residences receiving.
    knox = new_job(
        client,
        "ARCARE",
        [
            ("BZ-P400-NVY-M", 30),
            ("EMB.ARCARE", 30, 0),
            ("BZ-P400-NVY-L", 20),
            ("EMB.ARCARE", 20, 2),
        ],
        days_ago=18,
        due_in=4,
        status="ORDER",
        cust_ref="ARC-HO-2291",
        description="Care staff polos, Knox",
        **site(db, "ARCARE", "AR.KNO"),
    )
    jobs["arcare_knox"] = knox["id"]
    climb(client, knox["id"], "ORDER", "Pick/Pack")
    call(client, "POST", "/jobs/auto-pick", {"job_ids": [knox["id"]]})
    climb(client, knox["id"], "Pick/Pack", "Desp/Ready")

    parkville = new_job(
        client,
        "ARCARE",
        [("BZ-P400-NVY-M", 10), ("EMB.ARCARE", 10, 0)],
        days_ago=9,
        due_in=6,
        status="ORDER",
        cust_ref="ARC-HO-2304",
        description="Care staff polos, Parkville",
        **site(db, "ARCARE", "AR.PAR"),
    )
    jobs["arcare_parkville"] = parkville["id"]
    climb(client, parkville["id"], "ORDER", "PRINT")

    # One consignment run: both ready jobs go with StarTrack today.
    call(
        client,
        "POST",
        "/dispatch-sessions",
        {
            "despatch_date": day(0),
            "lines": [
                {
                    "job_id": ssc["id"],
                    "ship_via": "StarTrack",
                    "ship_ref": "ST-50231",
                    "cartons": 3,
                },
                {
                    "job_id": knox["id"],
                    "ship_via": "StarTrack",
                    "ship_ref": "ST-50232",
                    "cartons": 4,
                },
            ],
        },
    )
    climb(client, ssc["id"], "Desp/Ready", "INVOICE")
    pay(client, ssc)
    climb(client, ssc["id"], "INVOICE", "PAID")
    climb(client, knox["id"], "Desp/Ready", "INVOICE")  # on 30 EOM, still owing

    # Childcare: an online-store order, priced inc GST.
    gs = call(
        client,
        "POST",
        "/jobs",
        {
            "customer_id": "GOODSTART",
            "date_in": day(-6),
            "due": day(8),
            "status": "ORDER",
            "item_no": "NOP.ONLINE",
            "serial_no": "GS-100231",
            "description": "Online store order - educator tees",
            **site(db, "GOODSTART", "GS.SUTH"),
            "items": [
                {
                    "sort": 0,
                    "stock_code": "AS5001-WHT-M",
                    "order_qty": 4,
                    "price_inc": 24.20,
                },
                {
                    "sort": 1,
                    "stock_code": "EMB.GOODSTART",
                    "order_qty": 4,
                    "applies_to_line": 0,
                    "price_inc": 9.35,
                },
                {"sort": 2, "stock_code": "FREIGHT", "order_qty": 1, "price_inc": 9.95},
            ],
        },
    )
    jobs["goodstart"] = gs["id"]
    climb(client, gs["id"], "ORDER", "Pick/Pack")
    call(client, "POST", "/jobs/auto-pick", {"job_ids": [gs["id"]]})

    # Hostels: finished, waiting to be invoiced.
    yha = new_job(
        client,
        "YHA",
        [("AS5001-BLK-M", 15), ("EMB.YHA", 15, 0)],
        days_ago=14,
        due_in=-1,
        status="ORDER",
        cust_ref="YHA-OPS-77",
        description="Reception crew tees",
    )
    jobs["yha"] = yha["id"]
    climb(client, yha["id"], "ORDER", "Pick/Pack")
    call(client, "POST", "/jobs/auto-pick", {"job_ids": [yha["id"]]})
    climb(client, yha["id"], "Pick/Pack", "Desp/Ready")
    call(
        client,
        "POST",
        f"/jobs/{yha['id']}/dispatch",
        {
            "ship_via": "Toll",
            "ship_ref": "TL-88120",
            "cartons": 1,
            "despatch_date": day(-1),
        },
    )
    climb(client, yha["id"], "Desp/Ready", "FINISH")

    # Two invoices to Zone Bowling, settled by one remittance.
    zone = []
    for n, (cap_qty, days_ago) in enumerate(((60, 30), (40, 16)), start=1):
        z = new_job(
            client,
            "ZONE.BOWL",
            [("AS1105-BLK", cap_qty), ("FREIGHT", 1)],
            days_ago=days_ago,
            due_in=-days_ago + 7,
            status="ORDER",
            cust_ref=f"ZB-CAPS-{n}",
            description="Lane crew caps",
        )
        climb(client, z["id"], "ORDER", "Pick/Pack")
        call(client, "POST", "/jobs/auto-pick", {"job_ids": [z["id"]]})
        climb(client, z["id"], "Pick/Pack", "Desp/Ready")
        call(
            client,
            "POST",
            f"/jobs/{z['id']}/dispatch",
            {
                "ship_via": "Couriers Please",
                "ship_ref": f"CP-4410{n}",
                "cartons": 1,
                "despatch_date": day(-days_ago + 5),
            },
        )
        climb(client, z["id"], "Desp/Ready", "INVOICE")
        zone.append(z["id"])
    owed = sum(call(client, "GET", f"/jobs/{j}")["balance_due"] for j in zone)
    call(
        client,
        "POST",
        "/customers/ZONE.BOWL/remittances",
        {
            "amount": round(owed, 2),
            "method": "EFT",
            "reference": "ZB REMIT 0912",
            "received_date": day(0),
        },
    )
    for j in zone:
        climb(client, j, "INVOICE", "PAID")
    jobs["zone_bowling"] = zone

    # Corporate packs: jackets with a subcontracted logo, in production.
    ricoh = new_job(
        client,
        "RICOH",
        [("BZ-J307-BLK-L", 4), ("EMB.RIC", 4, 0)],
        days_ago=5,
        due_in=12,
        status="ORDER",
        cust_ref="RIC-NEWSTARTERS",
        description="New starter packs - soft shell jackets",
    )
    jobs["ricoh"] = ricoh["id"]
    climb(client, ricoh["id"], "ORDER", "In Progress")

    # Waiting on the customer's proof.
    tz = new_job(
        client,
        "TIMEZONE",
        [("AS5001-BLK-M", 24), ("EMB.TIMEZONE", 24, 0)],
        days_ago=4,
        due_in=10,
        status="ORDER",
        cust_ref="TZ-CREW-SPRING",
        description="Crew tees - spring promo",
    )
    jobs["timezone"] = tz["id"]
    climb(client, tz["id"], "ORDER", "PROOF")

    # Booked and reserved, not started.
    rsl = new_job(
        client,
        "MERRY.RSL",
        [("AS5001-WHT-L", 12), ("AS1105-BLK", 12), ("FREIGHT", 1)],
        days_ago=2,
        due_in=14,
        status="ORDER",
        cust_ref="RSL-BAR",
        description="Bar staff tees and caps",
    )
    jobs["merrylands"] = rsl["id"]

    # Quotes: priced from the polo's breaks (25 or more at $29.50).
    jobs["bank_quote"] = new_job(
        client,
        "BANK.SYD",
        [("BZ-P400-NVY-M", 25), ("EMB.BANKSYD", 25, 0), ("FREIGHT", 1)],
        days_ago=3,
        due_in=21,
        cust_ref="BOS-BRANCH-REFRESH",
        description="Branch staff polos - quote",
    )["id"]
    jobs["aveo_quote"] = new_job(
        client,
        "AVEO",
        [("BZ-P400-NVY-L", 12), ("EMB.AVEO", 12, 0)],
        days_ago=1,
        due_in=28,
        cust_ref="AVEO-VILLAGE-TEAM",
        description="Village team polos - quote",
    )["id"]

    # Buying for stock: an open order with AS Colour.
    call(
        client,
        "POST",
        "/purchase-orders",
        {
            "id": "PO-DEMO-002",
            "supplier_id": "AS.COLOUR",
            "supplier_name": "AS Colour Wholesale",
            "order_date": day(-2),
            "expected_date": day(5),
            "status": "Draft",
            "items": [
                {
                    "sku": "AS5001-BLK-M",
                    "qty_ordered": 120,
                    "unit_cost": 6.20,
                    "total": 744.00,
                },
                {
                    "sku": "AS5001-WHT-L",
                    "qty_ordered": 72,
                    "unit_cost": 6.20,
                    "total": 446.40,
                },
            ],
        },
    )

    # A Biz Collection bill with a credit note for a short shipment.
    biz = call(
        client,
        "POST",
        "/ap/bills",
        {
            "supplier_id": "BIZ.COLLEC",
            "supplier_name": "Biz Collection",
            "bill_number": "BIZ-552301",
            "bill_date": day(-20),
            "due_date": day(10),
            "description": "Crew polos restock",
            "amount_ex": 1380.00,
            "tax": 138.00,
            "amount_inc": 1518.00,
        },
    )
    credit = call(
        client,
        "POST",
        "/ap/bills",
        {
            "supplier_id": "BIZ.COLLEC",
            "supplier_name": "Biz Collection",
            "bill_number": "BIZ-CN-1187",
            "bill_date": day(-8),
            "description": "Credit - 6 polos short shipped",
            "amount_ex": -69.00,
            "tax": -6.90,
            "amount_inc": -75.90,
        },
    )
    call(client, "POST", f"/ap/bills/{credit['id']}/apply", {"bill_id": biz["id"]})
    return jobs


def load(client, db) -> dict:
    """Masters always (what is missing); the work once."""
    added = load_masters(client, db)
    # The demo's own first job, not any job of these customers: seed_data.py
    # has jobs for ZONE.BOWL too.
    if db.query(Job.id).filter(Job.cust_ref == FIRST_JOB_REF).first():
        return {**added, "jobs": "already loaded - skipped"}
    return {**added, "jobs": load_work(client, db)}


def main() -> int:
    from fastapi.testclient import TestClient

    from app.core.dependencies import get_current_user, get_signed_in_user
    from app.database import SessionLocal
    from app.main import app
    from app.models.user import User

    with SessionLocal() as db:
        admin = (
            db.query(User)
            .filter(User.role == "admin", User.is_active.is_(True))
            .order_by(User.id)
            .first()
        )
        if admin is None:
            print("No active admin: run seed_admin.py first.", file=sys.stderr)
            return 1
        db.expunge(admin)

    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_signed_in_user] = lambda: admin
    try:
        with TestClient(app) as client, SessionLocal() as db:
            result = load(client, db)
    except SeedError as exc:
        print(f"Stopped: {exc}\n{AFTER_A_STOP}", file=sys.stderr)
        return 1
    except Exception:
        print(f"Stopped by the error below.\n{AFTER_A_STOP}", file=sys.stderr)
        raise
    finally:
        app.dependency_overrides.clear()
    # Not the admin's name: the Actions log of a public repository is public.
    print("Demo data loaded:")
    for key, value in result.items():
        print(f"  {key}: {value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

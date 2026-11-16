"""Two requests at once on real Postgres: nothing lost, and no deadlock.

The lock order (app/core/row_locks.py): the document-number sequence, then a
document header (a purchase order, a credit note), then jobs by id, then
customers by id, then stock — the item, then its position — by SKU. Every path
takes what it needs in that order, so two requests can wait on each other but
never on each other at once.
"""

import pytest

from app.core.stock_location import DEFAULT_BRANCH
from app.models.customer import Customer
from app.models.inventory import InventoryItem
from app.models.stock_location import StockLocation

from .conftest import failures, race

pytestmark = pytest.mark.postgres

INVENTORY_LOCKED = (
    r"^\s*(UPDATE inventory\b|SELECT\b.*\bFROM inventory\b.*\bFOR (NO KEY )?UPDATE)"
)
INVENTORY_READ = r"^\s*SELECT\b.*\bFROM inventory\b"


def _stock(pg_session, sku, on_hand=50):
    with pg_session() as db:
        db.add(
            InventoryItem(
                sku=sku,
                name=f"Polo {sku}",
                category="Apparel",
                stock=on_hand,
                unit_cost=10,
                sell_price=25,
                status="Active",
            )
        )
        db.add(
            StockLocation(
                sku=sku,
                branch=DEFAULT_BRANCH,
                qty_on_hand=on_hand,
                committed_qty=0,
                backorder_qty=0,
                on_po_qty=0,
            )
        )
        db.commit()


def _customer(pg_session, customer_id):
    with pg_session() as db:
        db.add(
            Customer(
                id=customer_id,
                name=f"School {customer_id}",
                payment_terms="Net 30",
                credit_limit=1_000_000,
                status="Active",
            )
        )
        db.commit()


def _job(pg_session, admin, customer_id, sku, qty, status):
    from app.routers.jobs import JobCreate, create_job

    body = JobCreate(
        customer_id=customer_id,
        status=status,
        items=[{"stock_code": sku, "order_qty": qty, "price_ex": 20}],
    )
    with pg_session() as db:
        return create_job(body, db=db, current_user=admin).id


def _status(pg_session, admin, job_id, status):
    from app.routers.jobs import StatusUpdate, update_status

    def work():
        with pg_session() as db:
            return update_status(
                job_id, StatusUpdate(status=status), db=db, current_user=admin
            ).status

    return work


def _on_hand(pg_session, sku):
    with pg_session() as db:
        item = db.query(InventoryItem).filter_by(sku=sku).one()
        place = db.query(StockLocation).filter_by(sku=sku).one()
        return item.stock, place.qty_on_hand


class TestStockIsNeverLost:
    def test_two_movements_of_one_sku_both_count(
        self, pg_engine, pg_session, pg_admin, tag
    ):
        """Each read the count, added its own, and wrote it back: one was lost."""
        from app.core.stock_ledger import post_movement

        sku = f"LOST-{tag}"
        _stock(pg_session, sku, on_hand=50)

        def add(qty):
            def work():
                with pg_session() as db:
                    post_movement(db, sku=sku, movement_type="Adjustment", quantity=qty)
                    db.commit()

            return work

        results = race(
            pg_engine, add(5), add(7), pause_after=INVENTORY_READ, b_waits=False
        )
        assert failures(results) == []
        assert _on_hand(pg_session, sku) == (62, 62)

    def test_two_moves_between_branches_both_count(
        self, pg_engine, pg_session, pg_admin, tag
    ):
        """Only the shelves move in a relocation: each read its position, moved
        it and wrote it back, and one move was lost (HQ left at 45, not 38)."""
        from app.core.stock_ledger import post_relocation

        sku = f"MOVE-{tag}"
        _stock(pg_session, sku, on_hand=50)

        def move(qty):
            def work():
                with pg_session() as db:
                    post_relocation(
                        db, sku=sku, quantity=qty, from_branch="HQ", to_branch="MELB"
                    )
                    db.commit()

            return work

        results = race(
            pg_engine,
            move(5),
            move(7),
            pause_after=r"^\s*SELECT\b.*\bFROM stock_locations\b",
        )
        assert failures(results) == []
        with pg_session() as db:
            places = {
                p.branch: p.qty_on_hand
                for p in db.query(StockLocation).filter_by(sku=sku)
            }
        assert places == {"HQ": 38, "MELB": 12}


class TestWaitsAreBounded:
    def test_a_request_waits_at_most_the_lock_timeout(self, pg_session):
        """Unbounded, a request queued behind a held row waited past Vercel's
        limit; bounded, it is told to try again (a 409, app/main.py)."""
        from app.database import LOCK_TIMEOUT
        from sqlalchemy import text

        with pg_session() as db:
            assert db.execute(text("SHOW lock_timeout")).scalar() == LOCK_TIMEOUT


class TestNoDeadlock:
    def test_invoicing_while_another_order_for_the_customer_is_confirmed(
        self, pg_engine, pg_session, pg_admin, tag
    ):
        """The likeliest one: despatch invoices a school's job while the office
        confirms another order of theirs for the same polo. Invoicing wrote the
        stock and then wanted the customer; confirming held the customer and
        then wanted the stock."""
        sku, customer = f"POLO-{tag}", f"C{tag}"
        _stock(pg_session, sku)
        _customer(pg_session, customer)
        finished = _job(pg_session, pg_admin, customer, sku, 2, "FINISH")
        quote = _job(pg_session, pg_admin, customer, sku, 1, "QUOTE")

        results = race(
            pg_engine,
            _status(pg_session, pg_admin, finished, "INVOICE"),
            _status(pg_session, pg_admin, quote, "ORDER"),
            pause_after=INVENTORY_LOCKED,
        )
        assert failures(results) == []
        assert results == {"A": (True, "INVOICE"), "B": (True, "ORDER")}

    def test_two_remittances_naming_the_same_invoices(
        self, pg_engine, pg_session, pg_admin, tag
    ):
        """One allocated by hand (jobs by id), one paid oldest invoice first
        (jobs by invoice date): an older invoice with the higher number was
        locked first by one and last by the other."""
        from app.models.job import Job
        from app.routers.remittances import RemittanceIn, record_remittance

        sku, customer = f"REM-{tag}", f"R{tag}"
        _stock(pg_session, sku)
        _customer(pg_session, customer)
        low = _job(pg_session, pg_admin, customer, sku, 1, "INVOICE")
        high = _job(pg_session, pg_admin, customer, sku, 1, "INVOICE")
        with pg_session() as db:
            # The higher-numbered job was invoiced first.
            db.get(Job, low).invoice_date = "2026-11-05"
            db.get(Job, high).invoice_date = "2026-11-01"
            db.commit()

        def remit(allocations=None, amount=10.0):
            def work():
                body = RemittanceIn(amount=amount, allocations=allocations)
                with pg_session() as db:
                    return record_remittance(
                        customer, body, db=db, current_user=pg_admin
                    )

            return work

        results = race(
            pg_engine,
            remit([{"job_id": low, "amount": 5}, {"job_id": high, "amount": 5}]),
            remit(amount=30.0),
            pause_after=r"^\s*SELECT\b.*\bFROM jobs\b.*\bFOR (NO KEY )?UPDATE",
        )
        assert failures(results) == []

    def test_two_jobs_booked_at_once_get_two_numbers(
        self, pg_engine, pg_session, pg_admin, tag
    ):
        """Both read the highest number and took the next: the second was
        refused as a job that already exists."""
        sku, customer = f"NUM-{tag}", f"N{tag}"
        _stock(pg_session, sku)
        _customer(pg_session, customer)

        def book():
            return _job(pg_session, pg_admin, customer, sku, 1, "QUOTE")

        results = race(
            pg_engine, book, book, pause_after=r"\bmax\(CAST\(jobs\.id AS INTEGER\)\)"
        )
        assert failures(results) == []
        assert results["A"][1] != results["B"][1]

    def test_a_delivery_filling_a_job_while_the_job_is_cancelled(
        self, pg_engine, pg_session, pg_admin, tag
    ):
        """A receipt shelves the stock and then gives it to the jobs waiting for
        it; cancelling one of those jobs locks the job and then its stock."""
        from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
        from app.routers.purchase_orders import ReceiveItems, receive_items

        sku, customer = f"RCV-{tag}", f"D{tag}"
        _stock(pg_session, sku, on_hand=2)
        _customer(pg_session, customer)
        job = _job(pg_session, pg_admin, customer, sku, 5, "ORDER")  # 2 held, 3 owed
        with pg_session() as db:
            po = PurchaseOrder(id=f"PO-{tag}", supplier_name="Fly", status="Sent")
            line = PurchaseOrderItem(
                order_id=po.id, sku=sku, job_id=job, qty_ordered=3, qty_received=0
            )
            db.add_all([po, line])
            db.commit()
            po_id, line_id = po.id, line.id

        def deliver():
            body = ReceiveItems(items=[{"id": line_id, "qty_received": 3}])
            with pg_session() as db:
                return receive_items(po_id, body, db=db, _=pg_admin)

        results = race(
            pg_engine,
            deliver,
            _status(pg_session, pg_admin, job, "CANCEL"),
            pause_after=INVENTORY_LOCKED,
        )
        assert failures(results) == []

    def test_two_bulk_changes_naming_the_same_jobs_in_opposite_orders(
        self, pg_engine, pg_session, pg_admin, tag
    ):
        """Each batch moved its jobs in the order it was given them."""
        from app.routers.jobs import BulkStatusRequest, bulk_status

        sku, customer = f"BLK-{tag}", f"B{tag}"
        _stock(pg_session, sku)
        _customer(pg_session, customer)
        one = _job(pg_session, pg_admin, customer, sku, 1, "ORDER")
        two = _job(pg_session, pg_admin, customer, sku, 1, "ORDER")

        def bulk(job_ids):
            def work():
                body = BulkStatusRequest(job_ids=job_ids, status="In Progress")
                with pg_session() as db:
                    return bulk_status(body, db=db, current_user=pg_admin)

            return work

        results = race(
            pg_engine,
            bulk([two, one]),
            bulk([one, two]),
            pause_after=r"^\s*(UPDATE jobs\b|SELECT\b.*\bFROM jobs\b.*\bFOR (NO KEY )?UPDATE)",
        )
        assert failures(results) == []
        # The second finds them moved already: nothing refused, nothing lost.
        assert results["A"][1]["failed"] == results["B"][1]["failed"] == []

    def test_a_stocktake_placing_unlocated_stock_while_the_sku_moves(
        self, pg_engine, pg_session, pg_admin, tag
    ):
        """Stock from before positions has a total but no shelf. Counting it
        placed it — the position written before its item — while an ordinary
        movement writes the item, then the position."""
        from app.core.stock_ledger import post_movement
        from app.routers.inventory import StocktakeRequest, stocktake

        sku = f"COUNT-{tag}"
        _stock(pg_session, sku, on_hand=10)
        with pg_session() as db:
            db.query(StockLocation).filter_by(sku=sku).one().qty_on_hand = 6
            db.commit()

        def count():
            body = StocktakeRequest(
                branch="HQ", items=[{"sku": sku, "counted_qty": 12}]
            )
            with pg_session() as db:
                return stocktake(body, db=db, _=pg_admin)

        def sell():
            with pg_session() as db:
                post_movement(db, sku=sku, movement_type="Adjustment", quantity=-1)
                db.commit()

        results = race(
            pg_engine,
            count,
            sell,
            pause_after=r"^\s*(UPDATE (inventory|stock_locations)\b|SELECT\b.*\bFROM (inventory|stock_locations)\b.*\bFOR (NO KEY )?UPDATE)",
        )
        assert failures(results) == []

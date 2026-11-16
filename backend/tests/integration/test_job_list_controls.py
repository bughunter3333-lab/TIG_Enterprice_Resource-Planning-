"""The job list's daily controls Jim2 gives TIG (JIM24, JIM26).

Staff find the jobs a purchase order buys for by its number, and act on the
jobs they select: move their due date together, and raise the purchase orders
their short lines need.
"""

import pytest

from app.models.customer import Customer
from app.models.job import Job, JobItem

pytestmark = pytest.mark.integration


def _job(db, job_id, *items, status="ORDER", **fields):
    if not db.get(Customer, "JL-C"):
        db.add(Customer(id="JL-C", name="List Co", credit_limit=99999.0))
    db.add(
        Job(
            id=job_id,
            customer_id="JL-C",
            customer_name="List Co",
            status=status,
            items=list(items),
            **fields,
        )
    )
    db.commit()
    return db.get(Job, job_id)


class TestFindingJobsByPurchaseOrder:
    def test_search_finds_the_jobs_a_po_buys_for(self, client, db):
        _job(db, "JL-1", JobItem(sort=0, stock_code="POLO-M", po_no="PO-7781"))
        _job(db, "JL-2", JobItem(sort=0, stock_code="POLO-M", po_no="PO-9000"))
        _job(db, "JL-3", JobItem(sort=0, stock_code="POLO-M"))
        found = [j["id"] for j in client.get("/jobs?search=PO-7781").json()]
        assert found == ["JL-1"]
        found = [j["id"] for j in client.get("/jobs?search=7781").json()]
        assert found == ["JL-1"]

    def test_a_job_with_two_lines_on_the_po_is_found_once(self, client, db):
        _job(
            db,
            "JL-4",
            JobItem(sort=0, stock_code="POLO-M", po_no="PO-55"),
            JobItem(sort=1, stock_code="POLO-L", po_no="PO-55"),
        )
        found = [j["id"] for j in client.get("/jobs?search=PO-55").json()]
        assert found == ["JL-4"]


class TestMovingTheDueDateOfSelectedJobs:
    def test_every_selected_job_gets_the_new_due_date(self, client, db):
        _job(db, "JD-1", due="2026-11-10")
        _job(db, "JD-2", due="2026-11-12")
        _job(db, "JD-3", due="2026-11-12")
        r = client.post(
            "/jobs/bulk-due", json={"job_ids": ["JD-1", "JD-2"], "due": "2026-11-20"}
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"changed": 2, "failed": []}
        db.expire_all()
        assert db.get(Job, "JD-1").due == "2026-11-20"
        assert db.get(Job, "JD-2").due == "2026-11-20"
        assert db.get(Job, "JD-3").due == "2026-11-12"

    def test_the_trail_says_what_it_was(self, client, db):
        _job(db, "JD-4", due="2026-11-10")
        client.post("/jobs/bulk-due", json={"job_ids": ["JD-4"], "due": "2026-11-20"})
        db.expire_all()
        said = [c.comment for c in db.get(Job, "JD-4").comments]
        assert "Due date moved from 2026-11-10 to 2026-11-20" in said

    def test_a_job_that_is_not_there_does_not_stop_the_rest(self, client, db):
        _job(db, "JD-5", due="2026-11-10")
        r = client.post(
            "/jobs/bulk-due", json={"job_ids": ["NOPE", "JD-5"], "due": "2026-11-21"}
        )
        assert r.json()["changed"] == 1
        assert r.json()["failed"] == [{"job_id": "NOPE", "reason": "Job not found"}]

    def test_the_date_must_be_a_date(self, client, db):
        _job(db, "JD-6", due="2026-11-10")
        r = client.post("/jobs/bulk-due", json={"job_ids": ["JD-6"], "due": "soon"})
        assert r.status_code == 422


def _stock(db, sku, supplier):
    from app.models.inventory import InventoryItem

    db.add(InventoryItem(sku=sku, name=sku, supplier=supplier, unit_cost=10, stock=0))


class TestRaisingPurchaseOrdersForSelectedJobs:
    def _setup(self, db):
        from app.models.supplier import Supplier

        db.add(Supplier(id="KG", name="King Gee Workwear"))
        db.add(Supplier(id="BIZ", name="Biz Collection"))
        _stock(db, "HV-XL", "King Gee Workwear")
        _stock(db, "POLO-L", "Biz Collection")
        _stock(db, "ORPHAN", None)
        db.commit()
        _job(db, "JP-1", JobItem(sort=0, stock_code="HV-XL", order_qty=6, b_ord=6))
        _job(
            db,
            "JP-2",
            JobItem(sort=0, stock_code="HV-XL", order_qty=2, b_ord=2),
            JobItem(sort=1, stock_code="POLO-L", order_qty=4, b_ord=4),
            JobItem(sort=2, stock_code="POLO-L", order_qty=1, b_ord=1, po_no="PO-OLD"),
        )

    def test_one_po_per_supplier_with_a_line_per_job(self, client, db):
        self._setup(db)
        r = client.post(
            "/purchase-orders/from-jobs", json={"job_ids": ["JP-1", "JP-2"]}
        )
        assert r.status_code == 200, r.text
        made = {po["supplier_id"]: po for po in r.json()["created"]}
        assert set(made) == {"KG", "BIZ"}
        kg = sorted(
            (i["job_id"], i["sku"], i["qty_ordered"]) for i in made["KG"]["items"]
        )
        assert kg == [("JP-1", "HV-XL", 6), ("JP-2", "HV-XL", 2)]
        biz = [(i["job_id"], i["sku"], i["qty_ordered"]) for i in made["BIZ"]["items"]]
        assert biz == [
            ("JP-2", "POLO-L", 4)
        ]  # the line already on PO-OLD is not bought again
        assert r.json()["skipped"] == []

    def test_each_bought_line_names_its_po(self, client, db):
        self._setup(db)
        made = client.post(
            "/purchase-orders/from-jobs", json={"job_ids": ["JP-1"]}
        ).json()["created"]
        db.expire_all()
        assert db.get(Job, "JP-1").items[0].po_no == made[0]["id"]

    def test_po_numbers_are_new_and_unique(self, client, db):
        self._setup(db)
        made = client.post(
            "/purchase-orders/from-jobs", json={"job_ids": ["JP-1", "JP-2"]}
        ).json()["created"]
        ids = [po["id"] for po in made]
        assert len(set(ids)) == 2 and all(i.startswith("PO-") for i in ids)

    def test_a_line_with_no_supplier_or_a_job_not_on_order_is_named_not_bought(
        self, client, db
    ):
        self._setup(db)
        _job(db, "JP-3", JobItem(sort=0, stock_code="ORPHAN", order_qty=3, b_ord=3))
        _job(
            db,
            "JP-4",
            JobItem(sort=0, stock_code="HV-XL", order_qty=1, b_ord=1),
            status="QUOTE",
        )
        r = client.post(
            "/purchase-orders/from-jobs", json={"job_ids": ["JP-3", "JP-4"]}
        )
        assert r.status_code == 200, r.text
        assert r.json()["created"] == []
        skipped = {(s["job_id"], s["reason"]) for s in r.json()["skipped"]}
        assert ("JP-3", "ORPHAN has no supplier on its stock record") in skipped
        assert ("JP-4", "not an open order (QUOTE)") in skipped

    def test_nothing_short_buys_nothing(self, client, db):
        self._setup(db)
        _job(db, "JP-5", JobItem(sort=0, stock_code="HV-XL", order_qty=2, b_ord=0))
        r = client.post("/purchase-orders/from-jobs", json={"job_ids": ["JP-5"]})
        assert r.json() == {"created": [], "skipped": []}

"""TIG's status ladder (docs/superpowers/specs/2026-11-07-tig-status-ladder.md).

Booked (stored `New`) until released, Confirmed (`ORDER`) once released, then
the floor's own steps — Picked, Inco/Pick (incomplete pick), ProdExt (out at an
external decorator) — beside In Progress, PROOF and PRINT; FINISH when gone,
`Ready` when a person marks it ready to invoice, then invoiced.
"""

import pytest

from app.models.customer import Customer
from app.models.inventory import InventoryItem
from app.models.job import Job, JobItem
from app.models.logo import Logo
from app.routers.import_data import translate_status

pytestmark = pytest.mark.integration


def _job(db, job_id, status, *items):
    if not db.get(Customer, "LAD-C"):
        db.add(Customer(id="LAD-C", name="Ladder Co", credit_limit=99999.0))
    db.add(
        Job(
            id=job_id,
            customer_id="LAD-C",
            customer_name="Ladder Co",
            status=status,
            # Something to invoice: a job with no total is never invoiced.
            total_ex=100,
            tax=10,
            total_inc=110,
            deposit=0,
            balance_due=110,
            items=list(items),
        )
    )
    db.commit()


def _move(client, job_id, status):
    return client.post(f"/jobs/{job_id}/status", json={"status": status})


class TestTheFloorsSteps:
    """As staff: an admin may go further back than a step, which would hide a
    back-step missing from the ladder."""

    @pytest.mark.parametrize(
        "start,to",
        [
            ("New", "ORDER"),  # Booked released: Confirmed
            ("ORDER", "New"),  # and back to Booked
            ("ORDER", "Picked"),
            ("Picked", "Inco/Pick"),
            ("Inco/Pick", "Picked"),  # the rest arrived: picked in full
            ("PROOF", "Inco/Pick"),  # a part pick while the proof is out
            ("Inco/Pick", "PROOF"),  # and undone
            ("Picked", "ProdExt"),
            ("ProdExt", "Pick/Pack"),
            ("Picked", "Pick/Pack"),  # nothing to decorate
            ("Pick/Pack", "Picked"),  # and back the way it came
            ("Pick/Pack", "Inco/Pick"),  # packing finds a short
            ("FINISH", "Ready"),  # a person marks it ready to invoice
            ("Ready", "FINISH"),  # and back, a step
        ],
    )
    def test_each_step_is_a_move_the_floor_makes(self, client_as, db, start, to):
        staff = client_as("staff")
        _job(db, "LAD-1", start)
        r = _move(staff, "LAD-1", to)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == to

    def test_staff_do_not_jump_back_past_a_step(self, client_as, db):
        staff = client_as("staff")
        _job(db, "LAD-2", "Pick/Pack")
        assert _move(staff, "LAD-2", "ORDER").status_code == 422

    def test_ready_to_invoice_is_invoiced(self, client, db):
        _job(db, "LAD-3", "Ready")
        r = _move(client, "LAD-3", "INVOICE")
        assert r.status_code == 200, r.text
        assert r.json()["invoice"]

    def test_an_invoice_recalled_goes_back_to_finish(self, client, db):
        _job(db, "LAD-4", "Ready")
        _move(client, "LAD-4", "INVOICE")
        r = client.post("/jobs/LAD-4/unprint")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "FINISH"


class TestTheProofGateCoversTheDecorator:
    def test_a_logo_is_not_sent_out_unapproved(self, client, db):
        db.add(Logo(code="EMB.LAD", customer_id="LAD-C", decoration_type="EMB"))
        db.add(Customer(id="LAD-C", name="Ladder Co", credit_limit=99999.0))
        db.commit()
        logo = db.query(Logo).filter_by(code="EMB.LAD").one()
        _job(
            db,
            "LAD-5",
            "Picked",
            JobItem(sort=0, stock_code="EMB.LAD", logo_id=logo.id, order_qty=2),
        )
        r = _move(client, "LAD-5", "ProdExt")
        assert r.status_code == 422
        assert "proof" in r.json()["detail"]

    def test_picking_may_happen_while_the_proof_is_out(self, client, db):
        db.add(Customer(id="LAD-C", name="Ladder Co", credit_limit=99999.0))
        db.add(Logo(code="EMB.LAD2", customer_id="LAD-C", decoration_type="EMB"))
        db.commit()
        logo = db.query(Logo).filter_by(code="EMB.LAD2").one()
        _job(
            db,
            "LAD-6",
            "PROOF",
            JobItem(sort=0, stock_code="EMB.LAD2", logo_id=logo.id, order_qty=2),
        )
        assert _move(client, "LAD-6", "Picked").status_code == 200

    def _printed(self, db, job_id, code, status, proof_status):
        if not db.get(Customer, "LAD-C"):
            db.add(Customer(id="LAD-C", name="Ladder Co", credit_limit=99999.0))
        db.add(
            Logo(
                code=code,
                customer_id="LAD-C",
                decoration_type="EMB",
                artwork_ref="v1",
                proof_status=proof_status,
            )
        )
        db.commit()
        logo = db.query(Logo).filter_by(code=code).one()
        _job(
            db,
            job_id,
            status,
            JobItem(sort=0, stock_code=code, logo_id=logo.id, order_qty=2),
        )
        return logo

    def test_new_artwork_after_printing_is_proofed_before_it_goes_out(self, client, db):
        logo = self._printed(db, "LAD-7", "EMB.LAD7", "PRINT", "approved")
        # The customer's artwork changes while the job is at PRINT: the
        # approval no longer stands (logos.py `_PROOFED`).
        r = client.patch(f"/logos/{logo.id}", json={"artwork_ref": "v2"})
        assert r.status_code == 200, r.text
        r = _move(client, "LAD-7", "ProdExt")
        assert r.status_code == 422
        assert "proof" in r.json()["detail"]

    def test_sent_back_out_from_packing_is_checked_too(self, client, db):
        self._printed(db, "LAD-8", "EMB.LAD8", "Pick/Pack", "none")
        r = _move(client, "LAD-8", "ProdExt")
        assert r.status_code == 422
        assert "proof" in r.json()["detail"]

    def test_an_approved_logo_goes_out_from_print(self, client, db):
        self._printed(db, "LAD-9", "EMB.LAD9", "PRINT", "approved")
        assert _move(client, "LAD-9", "ProdExt").status_code == 200


class TestTheNewStepsKeepTheStockReserved:
    def test_reserved_through_every_new_step(self, client, db):
        db.add(Customer(id="LAD-C", name="Ladder Co", credit_limit=99999.0))
        db.add(InventoryItem(sku="LAD-TEE", name="Tee", stock=10, unit_cost=5))
        db.commit()
        made = client.post(
            "/jobs",
            json={
                "customer_id": "LAD-C",
                "status": "ORDER",
                "items": [{"sort": 0, "stock_code": "LAD-TEE", "order_qty": 4}],
            },
        )
        assert made.status_code == 200, made.text
        job_id = made.json()["id"]
        for step in ("Picked", "Inco/Pick", "ProdExt", "Pick/Pack"):
            assert _move(client, job_id, step).status_code == 200, step
            db.expire_all()
            item = db.query(InventoryItem).filter_by(sku="LAD-TEE").one()
            assert item.committed_qty == 4, step


class TestTheOrderCategory:
    """Jim2's order category, kept beside the urgency (JIM7)."""

    def _make(self, client, db, **extra):
        if not db.get(Customer, "LAD-C"):
            db.add(Customer(id="LAD-C", name="Ladder Co", credit_limit=99999.0))
            db.commit()
        return client.post(
            "/jobs", json={"customer_id": "LAD-C", "status": "New", **extra}
        )

    def test_a_job_is_a_normal_order_unless_told(self, client, db):
        r = self._make(client, db)
        assert r.status_code == 200, r.text
        assert r.json()["order_category"] == "Normal"

    def test_a_branch_order_keeps_its_urgency_apart(self, client, db):
        r = self._make(client, db, order_category="Branch", priority="Urgent")
        assert r.status_code == 200, r.text
        assert (r.json()["order_category"], r.json()["priority"]) == (
            "Branch",
            "Urgent",
        )

    def test_it_is_changed_on_the_job(self, client, db):
        job_id = self._make(client, db).json()["id"]
        r = client.patch(f"/jobs/{job_id}", json={"order_category": "Employee"})
        assert r.status_code == 200, r.text
        assert r.json()["order_category"] == "Employee"

    def test_a_category_jim2_has_not_is_refused(self, client, db):
        r = self._make(client, db, order_category="Wholesale")
        assert r.status_code == 422


class TestJim2PriorityIsTheOrderCategory:
    """Jim2's Priority holds Normal/Branch/Employee (JIM7); urgency stays ours."""

    def test_an_imported_branch_order_keeps_its_category(self, client, db):
        csv = (
            "Job#,Cust#,Customer,Status,Priority,Total Ex,Tax,Total Inc\n"
            "LAD-I1,LAD-IC,Import Co,Booked,Branch,100,10,110\n"
            "LAD-I2,LAD-IC,Import Co,Booked,Urgent,100,10,110\n"
        )
        r = client.post("/import/jobs", files={"file": ("jobs.csv", csv, "text/csv")})
        assert r.status_code == 200, r.text
        db.expire_all()
        branch, urgent = db.get(Job, "LAD-I1"), db.get(Job, "LAD-I2")
        assert (branch.order_category, branch.priority) == ("Branch", "Normal")
        assert (urgent.order_category, urgent.priority) == ("Normal", "Urgent")
        assert branch.status == "New"  # Booked: not yet released


class TestJim2StatusesImport:
    @pytest.mark.parametrize(
        "jim2,ours",
        [
            ("Booked", "New"),
            ("Confirmed", "ORDER"),
            ("Picked", "Picked"),
            ("Inco/Pick", "Inco/Pick"),
            ("ProdExt", "ProdExt"),
            ("Ready", "Ready"),
            ("FINISH", "FINISH"),
        ],
    )
    def test_each_comes_in_as_the_same_step(self, jim2, ours):
        assert translate_status(jim2) == ours

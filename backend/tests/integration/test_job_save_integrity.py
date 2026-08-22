"""Saving a job must not silently destroy work.

Two defects, one behind the other. Saving deleted every line and rebuilt the
list, so line identity was thrown away on every save — and order requirements
and the picking screen both hand out `item_id` and expect it to still mean
something. And because a save overwrites the whole job, two people editing the
same one meant the second save discarded the first's work with no error and no
trace.
"""

import pytest
from app.models.job import Job, JobItem


def _job(db, job_id="J-SV", lines=2):
    db.add(
        Job(
            id=job_id,
            customer_id="C-SV",
            customer_name="Cust",
            status="ORDER",
            branch="HQ",
            date_in="2026-08-01",
            invoice="INV-SV",
            total_inc=100,
        )
    )
    for index in range(lines):
        db.add(
            JobItem(
                job_id=job_id,
                display_type="product",
                stock_code=f"SKU-{index}",
                description=f"line {index}",
                order_qty=10,
                qty=10,
                supply_qty=10,
            )
        )
    db.commit()
    return job_id


def _line_payload(item, **overrides):
    payload = {
        "id": item["id"],
        "display_type": item["display_type"],
        "stock_code": item["stock_code"],
        "description": item["description"],
        "order_qty": item["order_qty"],
        "qty": item["qty"],
        "supply_qty": item["supply_qty"],
    }
    payload.update(overrides)
    return payload


@pytest.mark.integration
class TestLineIdentitySurvivesASave:
    def test_ids_are_stable_across_a_save(self, client, db):
        _job(db)
        # A second job holds the higher ids. Without it SQLite hands the deleted
        # rowids straight back on re-insert, so delete-and-recreate would look
        # like it preserved the ids and this test would pass over the bug.
        _job(db, job_id="J-SV2", lines=2)
        before = [i["id"] for i in client.get("/jobs/J-SV").json()["items"]]

        items = client.get("/jobs/J-SV").json()["items"]
        r = client.patch(
            "/jobs/J-SV",
            json={"items": [_line_payload(i, description="edited") for i in items]},
        )
        assert r.status_code == 200

        after = [i["id"] for i in client.get("/jobs/J-SV").json()["items"]]
        assert after == before, "a save must not replace the rows it edits"

    def test_fields_the_payload_omits_are_not_reset(self, client, db):
        """Requirements and picking write straight onto the line. Rebuilding the
        row dropped anything the save payload did not happen to carry — so the
        payload below deliberately omits both fields."""
        _job(db, lines=1)
        db.expire_all()
        line = db.query(JobItem).filter_by(job_id="J-SV").one()
        line.po_no, line.qty_pick = "PO-0042", 7
        db.commit()

        items = client.get("/jobs/J-SV").json()["items"]
        client.patch(
            "/jobs/J-SV",
            json={
                "items": [
                    {
                        "id": items[0]["id"],
                        "display_type": "product",
                        "stock_code": "SKU-0",
                        "description": "renamed",
                        "order_qty": 10,
                        "qty": 10,
                        "supply_qty": 10,
                    }
                ]
            },
        )

        db.expire_all()
        line = db.query(JobItem).filter_by(job_id="J-SV").one()
        assert (line.po_no, line.qty_pick) == ("PO-0042", 7)
        assert line.description == "renamed"

    def test_adding_a_line_keeps_the_others(self, client, db):
        _job(db, lines=2)
        items = client.get("/jobs/J-SV").json()["items"]
        existing = [_line_payload(i) for i in items]
        existing.append(
            {
                "display_type": "product",
                "stock_code": "SKU-NEW",
                "description": "added",
                "order_qty": 5,
                "qty": 5,
                "supply_qty": 5,
            }
        )
        client.patch("/jobs/J-SV", json={"items": existing})

        after = client.get("/jobs/J-SV").json()["items"]
        assert len(after) == 3
        assert [i["id"] for i in after[:2]] == [i["id"] for i in items]

    def test_removing_a_line_deletes_only_that_one(self, client, db):
        _job(db, lines=3)
        items = client.get("/jobs/J-SV").json()["items"]
        keep = [_line_payload(i) for i in items if i["stock_code"] != "SKU-1"]
        client.patch("/jobs/J-SV", json={"items": keep})

        after = client.get("/jobs/J-SV").json()["items"]
        assert sorted(i["stock_code"] for i in after) == ["SKU-0", "SKU-2"]
        assert [i["id"] for i in after] == [i["id"] for i in keep_ids(items)]


def keep_ids(items):
    return [i for i in items if i["stock_code"] != "SKU-1"]


@pytest.mark.integration
class TestConcurrentEditsConflict:
    def _version(self, client, job_id="J-SV"):
        return client.get(f"/jobs/{job_id}").json().get("updated_at") or ""

    def test_a_stale_save_is_refused(self, client, db):
        _job(db, lines=1)
        # Both users load the job and hold the same version.
        stale = self._version(client)

        items = client.get("/jobs/J-SV").json()["items"]
        first = client.patch(
            "/jobs/J-SV",
            json={
                "items": [_line_payload(i, description="first writer") for i in items]
            },
            headers={"If-Match": stale},
        )
        assert first.status_code == 200

        second = client.patch(
            "/jobs/J-SV",
            json={"description": "second writer"},
            headers={"If-Match": stale},
        )
        assert second.status_code == 409
        body = second.json()["detail"]
        assert body["error"] == "conflict"
        assert "changed by someone else" in body["message"]

        db.expire_all()
        line = db.query(JobItem).filter_by(job_id="J-SV").one()
        assert line.description == "first writer", "the first save must survive"

    def test_saving_with_the_current_version_succeeds(self, client, db):
        _job(db, lines=1)
        client.patch("/jobs/J-SV", json={"description": "one"})

        current = self._version(client)
        r = client.patch(
            "/jobs/J-SV",
            json={"description": "two"},
            headers={"If-Match": current},
        )
        assert r.status_code == 200

    def test_the_version_moves_when_only_lines_change(self, client, db):
        """`onupdate` fires on a column change, and an items-only save makes
        none — so without an explicit bump every later conflict goes undetected."""
        _job(db, lines=1)
        client.patch("/jobs/J-SV", json={"description": "seed"})
        before = self._version(client)

        items = client.get("/jobs/J-SV").json()["items"]
        client.patch(
            "/jobs/J-SV",
            json={"items": [_line_payload(i, qty=99) for i in items]},
        )

        assert self._version(client) != before

    def test_a_client_that_sends_no_token_is_not_held_to_one(self, client, db):
        """Opt-in by design: existing callers keep working unchanged."""
        _job(db, lines=1)
        client.patch("/jobs/J-SV", json={"description": "one"})
        assert (
            client.patch("/jobs/J-SV", json={"description": "two"}).status_code == 200
        )

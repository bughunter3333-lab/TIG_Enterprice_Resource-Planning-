"""A comment can be pinned to the top of the job's trail, as in Jim2 v4.6.

`job_comments.pinned_at` existed with nothing to set it: the one comment that
mattered ("customer wants the logo 5mm higher") sank under the system lines.
"""

import pytest

from app.models.customer import Customer
from app.models.job import Job, JobComment

pytestmark = pytest.mark.integration


def _job(db, job_id="PIN-1"):
    if not db.get(Customer, "PIN-C"):
        db.add(Customer(id="PIN-C", name="Pin Co", credit_limit=99999.0))
    db.add(
        Job(
            id=job_id,
            customer_id="PIN-C",
            customer_name="Pin Co",
            status="ORDER",
            comments=[JobComment(comment="Logo 5mm higher, please")],
        )
    )
    db.commit()
    return db.get(Job, job_id).comments[0].id


def test_a_comment_is_pinned_and_unpinned(client, db):
    cid = _job(db)
    r = client.post(f"/jobs/PIN-1/comments/{cid}/pin", json={"pinned": True})
    assert r.status_code == 200, r.text
    assert r.json()["pinned_at"]
    db.expire_all()
    assert db.get(JobComment, cid).pinned_at is not None

    r = client.post(f"/jobs/PIN-1/comments/{cid}/pin", json={"pinned": False})
    assert r.json()["pinned_at"] is None
    db.expire_all()
    assert db.get(JobComment, cid).pinned_at is None


def test_the_job_says_which_comment_is_pinned(client, db):
    cid = _job(db)
    client.post(f"/jobs/PIN-1/comments/{cid}/pin", json={"pinned": True})
    comments = client.get("/jobs/PIN-1").json()["comments"]
    assert [c["pinned_at"] is not None for c in comments] == [True]


def test_a_comment_is_pinned_only_through_its_own_job(client, db):
    cid = _job(db, "PIN-1")
    _job(db, "PIN-2")
    r = client.post(f"/jobs/PIN-2/comments/{cid}/pin", json={"pinned": True})
    assert r.status_code == 404


def test_the_online_store_cannot_pin(db, client_as):
    cid = _job(db)
    r = client_as("portal").post(
        f"/jobs/PIN-1/comments/{cid}/pin", json={"pinned": True}
    )
    assert r.status_code == 403

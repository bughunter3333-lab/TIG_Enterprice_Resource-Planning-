"""Rack sections: a stretch of one rack face marked for a customer.

"Bays 3-7 of aisle B belong to Zone Bowling." The 3D warehouse view paints
these onto the racking, so what is stored has to be one unambiguous rectangle:
two corners on the same face, kept smallest-first whichever order they were
clicked in, and never overlapping a section that is already there.

Odd bays are on one side of an aisle and even bays face them, so "the same
face" means the same parity, and distance along a face is (bay, box) compared
as a pair. Levels are letters counted up from the floor, shorter runs first.
"""

from datetime import datetime

import pytest
from starlette.testclient import TestClient

from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.database import get_db
from app.main import app
from app.models.rack_section import RackSection
from app.models.user import User

ZONE = "CUST001"
ACME = "CUST002"


def _mark(client, from_bin="B.3.A.1", to_bin="B.7.F.6", customer_id=ZONE, branch="HQ"):
    return client.post(
        "/rack-sections",
        json={
            "branch": branch,
            "customer_id": customer_id,
            "from_bin": from_bin,
            "to_bin": to_bin,
        },
    )


def _listed(client, branch="HQ"):
    r = client.get("/rack-sections", params={"branch": branch})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def customers(make_customer):
    make_customer(id=ZONE, name="Zone Bowling")
    make_customer(id=ACME, name="Acme Workwear")


@pytest.mark.integration
class TestListRackSections:
    def test_a_branch_with_nothing_marked_lists_nothing(self, client):
        assert _listed(client) == {"branch": "HQ", "sections": []}

    def test_only_the_branch_asked_for_is_listed(self, client, customers):
        assert _mark(client, branch="HQ").status_code == 201
        assert _mark(client, "A.1.A.1", "A.1.C.6", branch="MELB").status_code == 201

        hq = _listed(client, "HQ")
        assert [s["from_bin"] for s in hq["sections"]] == ["B.3.A.1"]
        # The branch is tidied the way every other stock screen tidies it.
        melb = _listed(client, " melb ")
        assert melb["branch"] == "MELB"
        assert [(s["branch"], s["from_bin"]) for s in melb["sections"]] == [
            ("MELB", "A.1.A.1")
        ]

    def test_sections_are_listed_in_walking_order(self, client, customers):
        """Aisle, then along the face, then up from the floor — bays and boxes
        as numbers (bay 4 before bay 10) and levels shortest first (B before
        AA), neither of which is the order the text sorts in."""
        for corners in (
            ("C.1.A.1", "C.1.A.6"),
            ("B.10.A.1", "B.10.A.6"),
            ("B.3.AA.1", "B.3.AB.6"),
            ("B.5.A.1", "B.5.C.6"),
            ("B.3.A.4", "B.3.A.6"),
            ("B.4.A.1", "B.4.A.6"),
            ("B.3.B.1", "B.3.B.6"),
            ("B.3.A.1", "B.3.A.3"),
        ):
            assert _mark(client, *corners).status_code == 201, corners

        assert [s["from_bin"] for s in _listed(client)["sections"]] == [
            "B.3.A.1",
            "B.3.B.1",
            "B.3.AA.1",
            "B.3.A.4",
            "B.4.A.1",
            "B.5.A.1",
            "B.10.A.1",
            "C.1.A.1",
        ]

    def test_an_unknown_branch_is_refused(self, client):
        r = client.get("/rack-sections", params={"branch": "NOWHERE"})
        assert r.status_code == 400
        assert r.json()["detail"] == "Unknown branch: NOWHERE"


@pytest.mark.integration
class TestMarkARackSection:
    def test_the_section_comes_back_in_the_agreed_shape(self, client, db, customers):
        r = _mark(client, "B.3.A.1", "B.7.L.6")
        assert r.status_code == 201, r.text
        body = r.json()

        created_at = body.pop("created_at")
        assert datetime.fromisoformat(created_at)
        section_id = body.pop("id")
        assert body == {
            "branch": "HQ",
            "customer_id": ZONE,
            "customer_name": "Zone Bowling",
            "aisle": "B",
            "bay_from": 3,
            "position_from": 1,
            "bay_to": 7,
            "position_to": 6,
            "level_from": "A",
            "level_to": "L",
            "from_bin": "B.3.A.1",
            "to_bin": "B.7.L.6",
            "created_by": "testadmin",
        }
        # What was returned is what was stored, and what the list hands back.
        row = db.query(RackSection).one()
        assert (row.id, row.branch, row.customer_id) == (section_id, "HQ", ZONE)
        assert (row.aisle, row.bay_from, row.position_from) == ("B", 3, 1)
        assert (row.bay_to, row.position_to) == (7, 6)
        assert (row.level_from, row.level_to) == ("A", "L")
        assert _listed(client)["sections"] == [r.json()]

    def test_who_marked_it_is_recorded(self, client, db, customers):
        assert _mark(client).json()["created_by"] == "testadmin"
        assert db.query(RackSection).one().created_by == "testadmin"

    def test_corners_given_the_other_way_round_are_the_same_section(
        self, client, customers
    ):
        body = _mark(client, "B.7.L.6", "B.3.A.1").json()
        assert (body["from_bin"], body["to_bin"]) == ("B.3.A.1", "B.7.L.6")

    def test_any_two_opposite_corners_describe_the_rectangle(self, client, customers):
        """Top-near and bottom-far are corners too. Along the face the pair
        (bay, box) is ordered as a pair — bay 3 box 5 comes before bay 7 box 2 —
        and the levels are ordered on their own."""
        body = _mark(client, "B.7.A.2", "B.3.L.5").json()
        assert (body["bay_from"], body["position_from"]) == (3, 5)
        assert (body["bay_to"], body["position_to"]) == (7, 2)
        assert (body["level_from"], body["level_to"]) == ("A", "L")
        assert (body["from_bin"], body["to_bin"]) == ("B.3.A.5", "B.7.L.2")

    def test_a_longer_level_is_higher_than_any_shorter_one(self, client, customers):
        """Levels count up A..Z then AA: as text "AA" sorts before "C"."""
        body = _mark(client, "B.3.AA.1", "B.3.C.6").json()
        assert (body["level_from"], body["level_to"]) == ("C", "AA")
        assert (body["from_bin"], body["to_bin"]) == ("B.3.C.1", "B.3.AA.6")

    def test_codes_are_stored_under_their_plain_spelling(self, client, db, customers):
        r = _mark(client, " b.03.a.01 ", "b.007.l.06", branch="hq")
        assert r.status_code == 201, r.text
        body = r.json()
        assert (body["branch"], body["aisle"]) == ("HQ", "B")
        assert (body["from_bin"], body["to_bin"]) == ("B.3.A.1", "B.7.L.6")
        row = db.query(RackSection).one()
        assert (row.branch, row.aisle, row.level_from, row.level_to) == (
            "HQ",
            "B",
            "A",
            "L",
        )

    def test_a_single_box_is_a_section(self, client, customers):
        body = _mark(client, "B.3.A.1", "B.3.A.1").json()
        assert (body["from_bin"], body["to_bin"]) == ("B.3.A.1", "B.3.A.1")


@pytest.mark.integration
class TestRefusedRackSections:
    def test_an_unknown_branch(self, client, db, customers):
        r = _mark(client, branch="NOWHERE")
        assert r.status_code == 400
        assert r.json()["detail"] == "Unknown branch: NOWHERE"
        assert db.query(RackSection).count() == 0

    def test_an_unknown_customer(self, client, db, customers):
        r = _mark(client, customer_id="NO-SUCH")
        assert r.status_code == 404
        assert r.json()["detail"] == "Customer not found"
        assert db.query(RackSection).count() == 0

    @pytest.mark.parametrize(
        "bad",
        [
            "A-01-04",  # the legacy shelf spelling
            "B.3.A",  # no box
            "B.0.A.1",  # bays are numbered from 1
            "B.3.A.0",  # boxes are numbered from 1
            "B.\uff13.A.1",  # a full-width 3
            "\u00df.3.A.1",  # not A-Z
        ],
    )
    def test_text_that_is_not_a_box_code_and_which_corner_it_was(
        self, client, db, customers, bad
    ):
        first = _mark(client, bad, "B.7.F.6")
        assert first.status_code == 400
        assert bad in first.json()["detail"]
        assert "B.7.F.6" not in first.json()["detail"]

        second = _mark(client, "B.3.A.1", bad)
        assert second.status_code == 400
        assert bad in second.json()["detail"]
        assert "B.3.A.1" not in second.json()["detail"]

        assert first.json()["detail"] != second.json()["detail"]
        assert db.query(RackSection).count() == 0

    def test_corners_in_different_aisles(self, client, db, customers):
        r = _mark(client, "B.3.A.1", "C.7.F.6")
        assert r.status_code == 400
        assert "aisle" in r.json()["detail"].lower()
        assert db.query(RackSection).count() == 0

    def test_corners_on_facing_sides_of_the_aisle(self, client, db, customers):
        r = _mark(client, "B.3.A.1", "B.4.F.6")
        assert r.status_code == 400
        detail = r.json()["detail"].lower()
        assert "odd" in detail and "even" in detail
        assert db.query(RackSection).count() == 0

    @pytest.mark.parametrize(
        "too_far, other",
        [
            ("B.1000.A.1", "B.2.A.1"),  # bay
            ("B.3.A.100", "B.3.A.2"),  # box
            ("B.3.ABC.1", "B.3.A.1"),  # level
            ("ABCDEFGHIJK.3.A.1", "B.3.A.1"),  # aisle
            # Far beyond what an integer column holds.
            ("B.99999999999999999999999999999999999999999.A.1", "B.3.A.1"),
            ("B.3.A.999999999999999999999999999999999999999999", "B.3.A.1"),
        ],
    )
    def test_a_number_or_letter_run_out_of_range_is_refused_not_stored(
        self, client, db, customers, too_far, other
    ):
        """A 400 that names the corner and says it is the range — never a
        database error, and not mistaken for a different complaint."""
        for corners in ((too_far, other), (other, too_far)):
            r = _mark(client, *corners)
            assert r.status_code == 400, r.text
            assert too_far in r.json()["detail"]
            assert "out of range" in r.json()["detail"]
        assert db.query(RackSection).count() == 0

    def test_the_largest_codes_in_range_are_accepted(self, client, db, customers):
        """The limits are the last values allowed, not the first refused."""
        r = _mark(client, "abcdefghij.999.zz.99", "ABCDEFGHIJ.1.A.1")
        assert r.status_code == 201, r.text
        row = db.query(RackSection).one()
        assert (row.aisle, row.bay_to, row.position_to, row.level_to) == (
            "ABCDEFGHIJ",
            999,
            99,
            "ZZ",
        )

    def test_text_longer_than_any_code_is_refused(self, client, db, customers):
        assert _mark(client, "B.3.A.1", "B" * 60 + ".7.F.6").status_code == 422
        assert _mark(client, customer_id="C" * 60).status_code == 422
        assert _mark(client, branch="H" * 60).status_code == 422
        assert db.query(RackSection).count() == 0


@pytest.mark.integration
class TestRackSectionsDoNotOverlap:
    """One box belongs to at most one section, whoever the sections belong to."""

    @pytest.fixture(autouse=True)
    def zone_bowling_has_bays_3_to_7(self, client, customers):
        assert _mark(client, "B.3.A.1", "B.7.F.6").status_code == 201

    def _refused_naming_zone_bowling(self, response):
        assert response.status_code == 409, response.text
        assert (
            response.json()["detail"]
            == "Overlaps Zone Bowling's section B.3.A.1 - B.7.F.6"
        )

    def test_a_part_overlap_along_the_face_and_in_height(self, client, db):
        # Shares bays 5-7 and levels D-F with it, and nothing else.
        self._refused_naming_zone_bowling(
            _mark(client, "B.5.D.1", "B.9.H.6", customer_id=ACME)
        )
        assert db.query(RackSection).count() == 1

    def test_the_same_section_again_even_for_the_same_customer(self, client, db):
        self._refused_naming_zone_bowling(_mark(client, "B.3.A.1", "B.7.F.6"))
        self._refused_naming_zone_bowling(_mark(client, "B.7.F.6", "B.3.A.1"))
        assert db.query(RackSection).count() == 1

    def test_a_section_inside_it_or_around_it(self, client, db):
        self._refused_naming_zone_bowling(
            _mark(client, "B.5.C.2", "B.5.C.3", customer_id=ACME)
        )
        self._refused_naming_zone_bowling(
            _mark(client, "B.1.A.1", "B.9.L.6", customer_id=ACME)
        )
        assert db.query(RackSection).count() == 1

    def test_sharing_a_single_corner_box_is_an_overlap(self, client, db):
        self._refused_naming_zone_bowling(
            _mark(client, "B.7.F.6", "B.9.H.6", customer_id=ACME)
        )
        assert db.query(RackSection).count() == 1

    def test_the_same_bays_above_it_are_free(self, client):
        r = _mark(client, "B.3.G.1", "B.7.L.6", customer_id=ACME)
        assert r.status_code == 201, r.text

    def test_the_facing_side_of_the_aisle_is_free(self, client):
        r = _mark(client, "B.4.A.1", "B.8.F.6", customer_id=ACME)
        assert r.status_code == 201, r.text

    def test_another_aisle_is_free(self, client):
        r = _mark(client, "C.3.A.1", "C.7.F.6", customer_id=ACME)
        assert r.status_code == 201, r.text

    def test_another_branch_is_free(self, client):
        r = _mark(client, "B.3.A.1", "B.7.F.6", customer_id=ACME, branch="MELB")
        assert r.status_code == 201, r.text

    def test_the_next_bays_along_the_face_are_free(self, client):
        # Bay 9 is the next bay on the odd side after bay 7; bay 1 the one before 3.
        assert _mark(client, "B.9.A.1", "B.11.F.6", customer_id=ACME).status_code == 201
        assert _mark(client, "B.1.A.1", "B.1.F.6", customer_id=ACME).status_code == 201

    def test_distance_along_a_face_is_bay_then_box(self, client):
        """A section from bay 3 box 4 to bay 5 box 2 holds bay 3 box 6 (further
        along than its start) but not bay 5 box 3 (past its end) — the reverse
        of what comparing the box numbers on their own would say."""
        assert _mark(client, "D.3.A.4", "D.5.A.2").status_code == 201

        r = _mark(client, "D.3.A.6", "D.3.A.6", customer_id=ACME)
        assert r.status_code == 409
        assert r.json()["detail"] == "Overlaps Zone Bowling's section D.3.A.4 - D.5.A.2"

        assert _mark(client, "D.5.A.3", "D.5.A.6", customer_id=ACME).status_code == 201
        assert _mark(client, "D.3.A.1", "D.3.A.3", customer_id=ACME).status_code == 201

    def test_height_is_compared_the_way_levels_count(self, client):
        """Z..AB is three levels (Z, AA, AB). As text, AA is outside "AB".."Z"."""
        assert _mark(client, "E.1.Z.1", "E.1.AB.6").status_code == 201

        r = _mark(client, "E.1.AA.1", "E.1.AA.6", customer_id=ACME)
        assert r.status_code == 409
        assert (
            r.json()["detail"] == "Overlaps Zone Bowling's section E.1.Z.1 - E.1.AB.6"
        )

        # Y is below Z; as text it sits between "AB" and "Z".
        assert _mark(client, "E.1.Y.1", "E.1.Y.6", customer_id=ACME).status_code == 201

    def test_the_refusal_names_whoever_holds_the_boxes(self, client):
        assert _mark(client, "C.1.A.1", "C.1.C.6", customer_id=ACME).status_code == 201
        r = _mark(client, "C.1.B.3", "C.1.B.4")
        assert r.status_code == 409
        assert (
            r.json()["detail"] == "Overlaps Acme Workwear's section C.1.A.1 - C.1.C.6"
        )


@pytest.fixture
def manager_client(test_db_session):
    user = User(
        username="testmanager",
        email="manager@test.com",
        full_name="Test Manager",
        hashed_password=hash_password("password123"),
        role="manager",
        is_active=True,
    )
    test_db_session.add(user)
    test_db_session.commit()

    def _override_db():
        yield test_db_session

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: user
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.mark.integration
class TestWhoMayMarkRackSections:
    """Marking racking is the same gate as editing a stock location."""

    def _section(self, db):
        row = RackSection(
            branch="HQ",
            customer_id=ZONE,
            aisle="B",
            bay_from=3,
            position_from=1,
            bay_to=7,
            position_to=6,
            level_from="A",
            level_to="F",
        )
        db.add(row)
        db.commit()
        return row.id

    def test_staff_can_see_the_sections(self, staff_client, db, customers):
        self._section(db)
        r = staff_client.get("/rack-sections", params={"branch": "HQ"})
        assert r.status_code == 200
        assert [s["from_bin"] for s in r.json()["sections"]] == ["B.3.A.1"]

    def test_staff_cannot_mark_one(self, staff_client, db, customers):
        assert _mark(staff_client).status_code == 403
        assert db.query(RackSection).count() == 0

    def test_staff_cannot_remove_one(self, staff_client, db, customers):
        section_id = self._section(db)
        assert staff_client.delete(f"/rack-sections/{section_id}").status_code == 403
        assert db.query(RackSection).count() == 1

    def test_a_manager_can_mark_and_remove(self, manager_client, db, customers):
        r = _mark(manager_client)
        assert r.status_code == 201, r.text
        assert r.json()["created_by"] == "testmanager"
        removed = manager_client.delete(f"/rack-sections/{r.json()['id']}")
        assert removed.status_code == 200
        assert db.query(RackSection).count() == 0


@pytest.mark.integration
class TestRemoveARackSection:
    def test_removing_a_section_frees_its_boxes(self, client, db, customers):
        section_id = _mark(client).json()["id"]
        keep = _mark(client, "C.1.A.1", "C.1.A.6").json()["id"]

        r = client.delete(f"/rack-sections/{section_id}")
        assert r.status_code == 200
        assert r.json() == {"ok": True}

        assert [s["id"] for s in _listed(client)["sections"]] == [keep]
        assert _mark(client, customer_id=ACME).status_code == 201

    def test_a_section_that_is_not_there(self, client, customers):
        section_id = _mark(client).json()["id"]
        assert client.delete(f"/rack-sections/{section_id}").status_code == 200

        again = client.delete(f"/rack-sections/{section_id}")
        assert again.status_code == 404
        assert again.json()["detail"] == "Section not found"

    def test_an_id_no_row_could_have_is_refused_without_a_lookup(self, client):
        """Larger than the id column: asking the database would be an error."""
        r = client.delete("/rack-sections/99999999999999999999")
        assert r.status_code == 422

    def test_deleting_the_customer_removes_its_sections(self, client, db, customers):
        assert _mark(client, "B.3.A.1", "B.7.F.6").status_code == 201
        assert _mark(client, "C.1.A.1", "C.1.A.6").status_code == 201
        kept = _mark(client, "D.1.A.1", "D.1.A.6", customer_id=ACME).json()["id"]

        assert client.delete(f"/customers/{ZONE}").status_code == 200

        assert [row.id for row in db.query(RackSection).all()] == [kept]
        assert [s["customer_id"] for s in _listed(client)["sections"]] == [ACME]
        # The racking Zone Bowling held can be marked for someone else.
        assert _mark(client, "B.3.A.1", "B.7.F.6", customer_id=ACME).status_code == 201


@pytest.mark.integration
class TestRackSectionsNeedASignIn:
    def test_nothing_is_listed_marked_or_removed_without_one(self, unauth_client):
        assert unauth_client.get("/rack-sections").status_code == 401
        assert _mark(unauth_client).status_code == 401
        assert unauth_client.delete("/rack-sections/1").status_code == 401


@pytest.mark.integration
class TestRackSectionsAtTheSameMoment:
    def test_a_save_that_slips_past_the_check_is_refused_by_the_database(
        self, client, db, customers, monkeypatch
    ):
        """Two saves at once can both pass the overlap check; the second must
        still be refused, and named, rather than stored or left as an error."""
        from app.routers import rack_sections

        assert _mark(client).status_code == 201
        real = rack_sections._marked_over
        calls = []

        def blind_the_first_time(db_, section):
            calls.append(section)
            return None if len(calls) == 1 else real(db_, section)

        monkeypatch.setattr(rack_sections, "_marked_over", blind_the_first_time)
        r = _mark(client, to_bin="B.9.C.2", customer_id=ACME)
        assert r.status_code == 409
        assert r.json()["detail"] == "Overlaps Zone Bowling's section B.3.A.1 - B.7.F.6"
        assert db.query(RackSection).count() == 1

    def test_the_database_holds_one_section_per_starting_box(self, db, customers):
        from sqlalchemy.exc import IntegrityError

        def starting_at_b3():
            return RackSection(
                branch="HQ",
                customer_id=ZONE,
                aisle="B",
                bay_from=3,
                position_from=1,
                bay_to=3,
                position_to=6,
                level_from="A",
                level_to="C",
            )

        db.add(starting_at_b3())
        db.commit()
        with pytest.raises(IntegrityError):
            with db.begin_nested():
                db.add(starting_at_b3())
                db.flush()
        assert db.query(RackSection).count() == 1


@pytest.mark.integration
class TestRackSectionRequestsAreBounded:
    def test_a_branch_longer_than_any_branch_is_refused_unread(self, client):
        assert (
            client.get("/rack-sections", params={"branch": "X" * 21}).status_code == 422
        )
        assert (
            client.get("/rack-sections", params={"branch": "X" * 20}).status_code == 400
        )

    def test_a_customer_number_the_database_could_not_be_asked_about(
        self, client, customers
    ):
        assert _mark(client, customer_id="CU\x00ST").status_code == 422
        assert _mark(client, customer_id="").status_code == 422


@pytest.mark.integration
class TestARefusalByTheDatabaseIsNamedForWhatItWas:
    def test_a_customer_deleted_in_that_same_moment_is_not_called_a_clash(
        self, client, db, customers, monkeypatch
    ):
        """The insert can be refused for want of its customer as well as for a
        section in the way. With no section in the way, look before answering."""
        from app.models.customer import Customer
        from app.routers import rack_sections

        # A row at the same starting box makes the database refuse the insert,
        # as it would for the missing customer where foreign keys are enforced.
        assert _mark(client, "B.3.A.1", "B.3.A.2").status_code == 201

        def nothing_in_the_way_and_the_customer_goes(db_, section):
            db_.query(Customer).filter(Customer.id == ACME).delete()
            return None

        monkeypatch.setattr(
            rack_sections, "_marked_over", nothing_in_the_way_and_the_customer_goes
        )
        r = _mark(client, "B.3.A.1", "B.3.A.2", customer_id=ACME)
        assert r.status_code == 404
        assert r.json()["detail"] == "Customer not found"

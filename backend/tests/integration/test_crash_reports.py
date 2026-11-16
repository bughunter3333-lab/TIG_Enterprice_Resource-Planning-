"""Crash reports (docs/superpowers/specs/2026-11-08-crash-reports.md): sent by
anyone signed in, with a checked screenshot; read by admins only; the first of
a kind emails the admins."""

import base64
import json
from datetime import datetime, timedelta, timezone

import pytest

from app.core import crash_reports as rules
from app.models.crash_report import CrashReport
from app.models.settings import EmailLog
from app.routers import crash_reports as router

pytestmark = pytest.mark.integration

# The smallest real images: a 1x1 PNG and the start of a JPEG.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def _data_url(data: bytes, kind: str = "png") -> str:
    return f"data:image/{kind};base64," + base64.b64encode(data).decode()


def _crash(**extra):
    return {
        "kind": "crash",
        "auto": True,
        "message": "TypeError: Cannot read properties of undefined (reading 'items') at job 1218774",
        "stack": "TypeError: x\n    at JobRecord (https://tig.app/assets/index-Bq3x9Zk.js:12:345)\n    at div",
        "module": "jobs",
        "job_id": "1218774",
        "app_build": "df665f1",
        "breadcrumbs": [
            {"at": "2026-11-08T09:00:00Z", "kind": "nav", "text": "Jobs"},
            {
                "at": "2026-11-08T09:00:05Z",
                "kind": "api",
                "text": "GET /jobs/1218774 → 200 (84 ms)",
            },
        ],
        **extra,
    }


class TestSendingAReport:
    def test_anyone_signed_in_may_send_one(self, client_as, db):
        floor = client_as("overseas_staff")
        r = floor.post("/crash-reports", json=_crash())
        assert r.status_code == 201, r.text
        report = db.get(CrashReport, r.json()["id"])
        assert report.role == "overseas_staff"
        assert report.auto is True
        assert json.loads(report.breadcrumbs)[1]["kind"] == "api"

    def test_with_a_screenshot_checked_by_its_bytes(self, client, db):
        r = client.post(
            "/crash-reports",
            json={
                "kind": "report",
                "description": "The total is wrong",
                "screenshot": _data_url(PNG),
            },
        )
        assert r.status_code == 201, r.text
        report = db.get(CrashReport, r.json()["id"])
        assert report.screenshot == PNG
        assert report.screenshot_type == "image/png"

    @pytest.mark.parametrize(
        "picture",
        [
            "data:image/svg+xml;base64," + base64.b64encode(b"<svg/>").decode(),
            _data_url(b"<script>alert(1)</script>", "png"),  # says png, is not
            "data:image/png;base64,not base64!!",
            "https://example.com/x.png",
        ],
    )
    def test_anything_but_a_real_png_jpeg_or_webp_is_refused(self, client, picture):
        r = client.post(
            "/crash-reports", json={"kind": "report", "screenshot": picture}
        )
        assert r.status_code == 422

    def test_a_picture_over_3_mb_is_refused(self, client):
        big = JPEG + b"\x00" * (rules.MAX_SCREENSHOT_BYTES + 1)
        r = client.post(
            "/crash-reports",
            json={"kind": "report", "screenshot": _data_url(big, "jpeg")},
        )
        assert r.status_code == 422

    def test_long_text_is_cut_to_fit_not_refused(self, client, db):
        r = client.post(
            "/crash-reports", json=_crash(stack="x" * 50000, message="m" * 9000)
        )
        assert r.status_code == 201, r.text
        report = db.get(CrashReport, r.json()["id"])
        assert len(report.stack) == rules.LIMITS["stack"]
        assert len(report.message) == rules.LIMITS["message"]

    def test_the_last_fifty_steps_are_kept(self, client, db):
        steps = [{"kind": "api", "text": f"GET /jobs/{n}"} for n in range(80)]
        r = client.post("/crash-reports", json=_crash(breadcrumbs=steps))
        report = db.get(CrashReport, r.json()["id"])
        kept = json.loads(report.breadcrumbs)
        assert len(kept) == 50
        assert kept[-1]["text"] == "GET /jobs/79"

    def test_a_flood_from_one_person_is_stopped(self, client, monkeypatch):
        monkeypatch.setattr(router, "PER_HOUR", 2)
        assert client.post("/crash-reports", json=_crash()).status_code == 201
        assert client.post("/crash-reports", json=_crash()).status_code == 201
        assert client.post("/crash-reports", json=_crash()).status_code == 429

    def test_the_portal_service_cannot_send(self, client_as):
        assert (
            client_as("portal").post("/crash-reports", json=_crash()).status_code == 403
        )


class TestTheSameCrashIsOneKind:
    def test_numbers_ids_and_build_hashes_do_not_split_a_kind(self):
        a = rules.fingerprint(
            "crash",
            "Cannot read 'items' of job 1218774",
            "at JobRecord (https://tig.app/assets/index-Bq3x9Zk.js:12:345)",
        )
        b = rules.fingerprint(
            "crash",
            "Cannot read 'items' of job 1218800",
            "at JobRecord (https://tig.app/assets/index-Zz81kQp.js:12:390)",
        )
        assert a == b

    def test_a_different_place_is_a_different_kind(self):
        a = rules.fingerprint("crash", "boom", "at JobRecord (x.js:1:1)")
        b = rules.fingerprint("crash", "boom", "at StockList (x.js:1:1)")
        assert a != b

    def test_each_persons_report_is_its_own(self):
        assert rules.fingerprint("report", "x", None) != rules.fingerprint(
            "report", "x", None
        )

    def test_the_list_counts_each_kinds_reports(self, client):
        for _ in range(3):
            client.post("/crash-reports", json=_crash())
        rows = client.get("/crash-reports").json()
        assert rows[0]["occurrences"] == 3


class TestAddingDetailsToARecordedCrash:
    def test_the_person_adds_their_words_and_picture(self, client, db):
        sent = client.post("/crash-reports", json=_crash()).json()
        r = client.patch(
            f"/crash-reports/{sent['id']}/details",
            json={
                "description": "I clicked Save",
                "screenshot": _data_url(JPEG, "jpeg"),
            },
        )
        assert r.status_code == 200, r.text
        report = db.get(CrashReport, sent["id"])
        assert (report.description, report.screenshot_type) == (
            "I clicked Save",
            "image/jpeg",
        )

    def test_only_once(self, client):
        sent = client.post("/crash-reports", json=_crash()).json()
        url = f"/crash-reports/{sent['id']}/details"
        assert client.patch(url, json={"description": "a"}).status_code == 200
        assert client.patch(url, json={"description": "b"}).status_code == 409

    def test_only_to_your_own(self, client, client_as):
        floor = client_as("staff")
        sent = floor.post("/crash-reports", json=_crash()).json()
        other = client_as("staff")
        r = other.patch(
            f"/crash-reports/{sent['id']}/details", json={"description": "x"}
        )
        assert r.status_code == 404

    def test_only_within_the_hour(self, client, db):
        sent = client.post("/crash-reports", json=_crash()).json()
        report = db.get(CrashReport, sent["id"])
        report.created_at = datetime.now(timezone.utc) - timedelta(hours=2)
        db.commit()
        r = client.patch(
            f"/crash-reports/{sent['id']}/details", json={"description": "x"}
        )
        assert r.status_code == 409


class TestReadingReports:
    def test_admins_only(self, client, client_as):
        client.post("/crash-reports", json=_crash())
        for role in ("manager", "staff", "overseas_staff"):
            reader = client_as(role)
            assert reader.get("/crash-reports").status_code == 403, role

    def test_the_list_leaves_the_pictures_behind(self, client):
        client.post(
            "/crash-reports", json={"kind": "report", "screenshot": _data_url(PNG)}
        )
        (row,) = client.get("/crash-reports").json()
        assert row["has_screenshot"] is True
        assert "screenshot" not in row

    def test_the_picture_is_served_as_what_its_bytes_are(self, client):
        sent = client.post(
            "/crash-reports", json={"kind": "report", "screenshot": _data_url(PNG)}
        ).json()
        r = client.get(f"/crash-reports/{sent['id']}/screenshot")
        assert r.status_code == 200
        assert r.headers["content-type"] == "image/png"
        assert r.headers["x-content-type-options"] == "nosniff"
        assert r.content == PNG

    def test_the_detail_carries_the_steps(self, client):
        sent = client.post("/crash-reports", json=_crash()).json()
        detail = client.get(f"/crash-reports/{sent['id']}").json()
        assert [s["kind"] for s in detail["breadcrumbs"]] == ["nav", "api"]
        assert detail["app_build"] == "df665f1"

    def test_marked_looking_then_fixed_with_a_note(self, client):
        sent = client.post("/crash-reports", json=_crash()).json()
        url = f"/crash-reports/{sent['id']}"
        assert (
            client.patch(url, json={"status": "looking"}).json()["status"] == "looking"
        )
        done = client.patch(
            url, json={"status": "fixed", "admin_note": "Fixed in df665f2"}
        ).json()
        assert (done["status"], done["admin_note"]) == ("fixed", "Fixed in df665f2")
        assert client.get("/crash-reports?status=fixed").json()[0]["id"] == sent["id"]

    def test_a_status_that_is_not_one_is_refused(self, client):
        sent = client.post("/crash-reports", json=_crash()).json()
        assert (
            client.patch(
                f"/crash-reports/{sent['id']}", json={"status": "gone"}
            ).status_code
            == 422
        )


class TestTellingTheAdmins:
    def _mail_server(self, db):
        from app.models.settings import CompanySettings

        settings = db.query(CompanySettings).first() or CompanySettings()
        settings.smtp_host, settings.smtp_user, settings.smtp_port = (
            "smtp.test",
            "erp@test.com",
            587,
        )
        db.add(settings)
        db.commit()

    def test_the_first_of_a_kind_is_emailed_and_logged(self, client, db, monkeypatch):
        self._mail_server(db)
        sent_to = []

        def fake_send(db_, smtp_config, recipients, msg_string, log_data):
            sent_to.append((recipients, log_data["subject"]))
            db_.add(
                EmailLog(
                    to_email=log_data["to_email"],
                    email_type="crash_report",
                    status="sent",
                )
            )
            db_.commit()
            return None

        monkeypatch.setattr(router, "_send_and_log", fake_send)
        first = client.post("/crash-reports", json=_crash()).json()
        again = client.post("/crash-reports", json=_crash()).json()
        assert first["first_of_kind"] is True and again["first_of_kind"] is False
        assert len(sent_to) == 1
        assert sent_to[0][1].startswith("A screen crashed")
        assert db.get(CrashReport, first["id"]).emailed is True

    def test_no_mail_server_never_fails_the_report(self, client):
        assert client.post("/crash-reports", json=_crash()).status_code == 201

    def test_a_failed_send_never_fails_the_report(self, client, db, monkeypatch):
        self._mail_server(db)

        def broken(*args, **kwargs):
            raise OSError("mail server down")

        monkeypatch.setattr(router, "_send_and_log", broken)
        r = client.post("/crash-reports", json=_crash())
        assert r.status_code == 201
        assert db.get(CrashReport, r.json()["id"]).emailed is False


class TestTheFolderOnThePC:
    def test_each_report_is_a_folder_and_the_index_lists_them(
        self, client, db, tmp_path
    ):
        import pull_crash_reports as puller

        client.post("/crash-reports", json=_crash())
        client.post(
            "/crash-reports",
            json={
                "kind": "report",
                "description": "Total wrong",
                "screenshot": _data_url(PNG),
            },
        )
        written = puller.pull(db, tmp_path)
        assert len(written) == 2
        shot = next(f for f in written if f.name.endswith("_report"))
        assert (shot / "screenshot.png").read_bytes() == PNG
        crash = next(f for f in written if f.name.endswith("_crash"))
        assert "GET /jobs/1218774" in (crash / "steps.txt").read_text(encoding="utf-8")
        data = json.loads((crash / "report.json").read_text(encoding="utf-8"))
        assert data["job_id"] == "1218774"
        index = (tmp_path / "INDEX.md").read_text(encoding="utf-8")
        assert shot.name in index and "Total wrong" in index

    def test_reports_already_pulled_are_left_alone(self, client, db, tmp_path):
        import pull_crash_reports as puller

        client.post("/crash-reports", json=_crash())
        assert len(puller.pull(db, tmp_path)) == 1
        assert puller.pull(db, tmp_path) == []

    def test_the_folder_is_never_committed(self):
        from pathlib import Path

        ignore = (Path(__file__).resolve().parents[3] / ".gitignore").read_text(
            encoding="utf-8"
        )
        assert "/crash-reports/" in ignore.splitlines()

    def test_the_crash_reports_code_is_not_ignored(self):
        # An unanchored rule once hid frontend/src/modules/crash-reports/ from
        # git: the build would have failed on a clean checkout.
        import subprocess
        from pathlib import Path

        root = Path(__file__).resolve().parents[3]
        code = "frontend/src/modules/crash-reports/CrashReporter.jsx"
        ignored = (
            subprocess.run(
                ["git", "check-ignore", "-q", code], cwd=root, check=False
            ).returncode
            == 0
        )
        assert not ignored


class TestWhatTheReviewFound:
    def test_a_report_pulled_before_its_words_is_pulled_again_after(
        self, client, db, tmp_path
    ):
        import pull_crash_reports as puller

        sent = client.post("/crash-reports", json=_crash()).json()
        (folder,) = puller.pull(db, tmp_path)
        client.patch(
            f"/crash-reports/{sent['id']}/details",
            json={"description": "Saving line 2", "screenshot": _data_url(PNG)},
        )
        db.expire_all()
        assert puller.pull(db, tmp_path) == [folder]
        assert (folder / "screenshot.png").read_bytes() == PNG
        data = json.loads((folder / "report.json").read_text(encoding="utf-8"))
        assert data["description"] == "Saving line 2"

    def test_a_server_error_answers_with_its_request_id(self, client):
        from app.main import app

        @app.get("/__boom_for_test")
        def boom():
            raise RuntimeError("boom")

        try:
            r = client.get("/__boom_for_test", headers={"X-Request-ID": "req-test-1"})
        finally:
            app.router.routes = [
                route
                for route in app.router.routes
                if getattr(route, "path", "") != "/__boom_for_test"
            ]
        assert r.status_code == 500
        assert r.headers["x-request-id"] == "req-test-1"
        assert r.json()["request_id"] == "req-test-1"

    def test_past_the_picture_allowance_the_words_still_go(
        self, client, db, monkeypatch
    ):
        monkeypatch.setattr(router, "PICTURES_PER_HOUR", 1)
        shot = {"kind": "report", "description": "x", "screenshot": _data_url(PNG)}
        first = client.post("/crash-reports", json=shot).json()
        second = client.post("/crash-reports", json=shot).json()
        assert db.get(CrashReport, first["id"]).screenshot == PNG
        assert db.get(CrashReport, second["id"]).screenshot is None

    def test_a_persons_own_report_is_not_emailed(self, client, db, monkeypatch):
        TestTellingTheAdmins()._mail_server(db)
        sent = []
        monkeypatch.setattr(router, "_send_and_log", lambda *a, **k: sent.append(1))
        client.post("/crash-reports", json={"kind": "report", "description": "x"})
        assert sent == []

    def test_the_admins_hear_of_so_many_new_kinds_an_hour(
        self, client, db, monkeypatch
    ):
        TestTellingTheAdmins()._mail_server(db)
        monkeypatch.setattr(router, "EMAILS_PER_HOUR", 2)
        sent = []

        def fake_send(db_, smtp_config, recipients, msg_string, log_data):
            sent.append(1)
            return None

        monkeypatch.setattr(router, "_send_and_log", fake_send)
        for n in range(4):
            client.post(
                "/crash-reports",
                json=_crash(message=f"Distinct fault kind {chr(65 + n)}"),
            )
        assert len(sent) == 2

    def test_an_admin_can_delete_a_report(self, client, client_as, db):
        sent = client.post("/crash-reports", json=_crash()).json()
        assert (
            client_as("staff").delete(f"/crash-reports/{sent['id']}").status_code == 403
        )
        assert (
            client_as("admin").delete(f"/crash-reports/{sent['id']}").status_code == 204
        )
        assert db.get(CrashReport, sent["id"]) is None

    def test_one_crash_across_builds_and_browsers_is_one_kind(self):
        chrome_a = "x\n    at JobRecord (https://tig/assets/index-a-b_c9Zk.js:12:345)"
        chrome_b = "x\n    at JobRecord (https://tig/assets/index-Zz81kQp.js:12:390)"
        assert rules.fingerprint("crash", "m", chrome_a) == rules.fingerprint(
            "crash", "m", chrome_b
        )
        # An address in the message is not a Firefox frame.
        mail = "Error: send to a@b.com failed\n    at f (x.js:1:2)"
        assert rules.top_frame(mail) == "at f (x.js"

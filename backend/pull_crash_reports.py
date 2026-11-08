"""Pull crash reports into a crash-reports/ folder on this PC.

docs/superpowers/specs/2026-11-08-crash-reports.md. One sub-folder per report —
`report.json`, the screenshot, `steps.txt` — and `INDEX.md` listing them all,
newest first. Reports already pulled are left alone.

    cd backend && python pull_crash_reports.py              # every report
    cd backend && python pull_crash_reports.py --status new

It reads the database DATABASE_URL names; set it to the live database to pull
live reports. The folder is git-ignored: reports show customers' details and
the repository is public.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.models.crash_report import CrashReport

DEFAULT_OUT = Path(__file__).resolve().parent.parent / "crash-reports"
_EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
_FIELDS = (
    "id",
    "created_at",
    "kind",
    "auto",
    "status",
    "fingerprint",
    "message",
    "description",
    "module",
    "job_id",
    "url",
    "app_build",
    "user_agent",
    "viewport",
    "request_id",
    "username",
    "role",
    "stack",
    "component_stack",
    "admin_note",
    "emailed",
)


def folder_name(report: CrashReport) -> str:
    when = (
        report.created_at.strftime("%Y-%m-%d_%H%M") if report.created_at else "undated"
    )
    # Only safe characters reach a folder name, whatever the database holds.
    kind = re.sub(r"[^a-z_]", "", str(report.kind or "report"))
    return f"{when}_{int(report.id)}_{kind}"


def _steps_text(report: CrashReport) -> str:
    try:
        steps = json.loads(report.breadcrumbs or "[]")
    except ValueError:
        steps = []
    return (
        "\n".join(
            f"{s.get('at') or '':<26} {s.get('kind') or '':<8} {s.get('text') or ''}"
            for s in steps
        )
        + "\n"
    )


def _report_json(report: CrashReport) -> str:
    data = {name: getattr(report, name) for name in _FIELDS}
    for when in ("created_at", "details_added_at"):
        value = getattr(report, when)
        data[when] = value.isoformat() if value else None
    return json.dumps(data, indent=2)


def _write(report: CrashReport, folder: Path, text: str) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "report.json").write_text(text, encoding="utf-8")
    (folder / "steps.txt").write_text(_steps_text(report), encoding="utf-8")
    if report.screenshot:
        ext = _EXTENSIONS.get(report.screenshot_type, "bin")
        (folder / f"screenshot.{ext}").write_bytes(report.screenshot)


def _index(out: Path) -> None:
    rows = []
    for folder in sorted((p for p in out.iterdir() if p.is_dir()), reverse=True):
        try:
            data = json.loads((folder / "report.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        what = (data.get("description") or data.get("message") or "").splitlines()
        rows.append(
            f"| [{folder.name}]({folder.name}/report.json) | {data.get('kind')} "
            f"| {data.get('status')} | {data.get('username') or ''} "
            f"| {(what[0] if what else '')[:90].replace('|', '/')} |"
        )
    head = "# Crash reports\n\n| Report | Kind | Status | Who | What |\n|---|---|---|---|---|\n"
    (out / "INDEX.md").write_text(head + "\n".join(rows) + "\n", encoding="utf-8")


def pull(
    db: Session, out: Path = DEFAULT_OUT, status: Optional[str] = None
) -> list[Path]:
    """Write the reports not yet pulled, and again any that changed since —
    the person's words and picture added later, a status, a note. Return the
    folders written."""
    out.mkdir(parents=True, exist_ok=True)
    q = db.query(CrashReport)
    if status:
        q = q.filter(CrashReport.status == status)
    written = []
    for report in q.order_by(CrashReport.id).yield_per(20):
        folder = out / folder_name(report)
        text = _report_json(report)
        saved = folder / "report.json"
        if saved.exists() and saved.read_text(encoding="utf-8") == text:
            continue
        _write(report, folder, text)
        written.append(folder)
    _index(out)
    return written


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--status", choices=("new", "looking", "fixed"))
    args = parser.parse_args(argv)
    from app.database import SessionLocal

    with SessionLocal() as db:
        written = pull(db, args.out, args.status)
    print(f"{len(written)} report(s) new or changed in {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Crash reports: sent by anyone signed in, read by admins.

docs/superpowers/specs/2026-11-08-crash-reports.md. The rules are in
`app/core/crash_reports.py`.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session, defer

from app.core import crash_reports as rules
from app.core.dependencies import require_admin, require_any
from app.database import get_db
from app.models.crash_report import CrashReport
from app.models.user import User
from app.routers.email_router import _get_settings, _send_and_log, smtp_config

router = APIRouter(prefix="/crash-reports", tags=["crash-reports"])
log = logging.getLogger(__name__)

# One person, one hour. Keyed on the account, not the address: the whole team
# reaches the API through one rewrite and shares an address.
PER_HOUR = 30
# Pictures are the weight: a person sends at most this many an hour, and a
# day; past that a report still goes, without its picture.
PICTURES_PER_HOUR = 10
PICTURES_PER_DAY = 40
# The admins hear of at most this many new kinds of crash an hour, whoever
# sends them — a fault that varies its words is not an email storm.
EMAILS_PER_HOUR = 10
# A recorded crash takes its person's words and picture for this long.
DETAILS_WINDOW = timedelta(hours=1)

Kind = Literal["crash", "error", "server_error", "report"]
Status = Literal["new", "looking", "fixed"]


class Step(BaseModel):
    at: Optional[str] = Field(None, max_length=40)
    kind: str = Field(max_length=20)
    text: str = ""

    @field_validator("text", mode="before")
    @classmethod
    def _clip_text(cls, value):
        return rules.clip(value, rules.MAX_STEP_TEXT) if value is not None else ""


class _Text(BaseModel):
    """Long text is cut to fit, never refused."""

    @field_validator(*rules.LIMITS, mode="before", check_fields=False)
    @classmethod
    def _clip(cls, value, info):
        return rules.clip(value, rules.LIMITS[info.field_name])


class CrashIn(_Text):
    model_config = ConfigDict(extra="forbid")

    kind: Kind
    auto: bool = False
    message: Optional[str] = None
    stack: Optional[str] = None
    component_stack: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    module: Optional[str] = None
    job_id: Optional[str] = None
    app_build: Optional[str] = None
    user_agent: Optional[str] = None
    viewport: Optional[str] = None
    request_id: Optional[str] = None
    breadcrumbs: List[Step] = Field(default_factory=list)
    # A data URL: data:image/jpeg;base64,…
    screenshot: Optional[str] = None

    @field_validator("breadcrumbs", mode="before")
    @classmethod
    def _last_steps(cls, value):
        return list(value or [])[-rules.MAX_STEPS :]


class DetailsIn(_Text):
    model_config = ConfigDict(extra="forbid")

    description: Optional[str] = None
    screenshot: Optional[str] = None


class Review(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Optional[Status] = None
    admin_note: Optional[str] = Field(None, max_length=2000)


class Sent(BaseModel):
    id: int
    fingerprint: str
    first_of_kind: bool


class ReportRow(BaseModel):
    id: int
    created_at: Optional[datetime] = None
    kind: str
    auto: bool
    fingerprint: str
    message: Optional[str] = None
    description: Optional[str] = None
    module: Optional[str] = None
    job_id: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None
    status: str
    has_screenshot: bool
    occurrences: int


class ReportDetail(ReportRow):
    stack: Optional[str] = None
    component_stack: Optional[str] = None
    url: Optional[str] = None
    app_build: Optional[str] = None
    user_agent: Optional[str] = None
    viewport: Optional[str] = None
    request_id: Optional[str] = None
    breadcrumbs: List[Step] = Field(default_factory=list)
    screenshot_type: Optional[str] = None
    details_added_at: Optional[datetime] = None
    admin_note: Optional[str] = None
    emailed: bool


def _picture(data_url: Optional[str]) -> tuple[Optional[bytes], Optional[str]]:
    if not data_url:
        return None, None
    try:
        return rules.decode_screenshot(data_url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


def _sent_since(db: Session, user: User, hours: int, *, pictures: bool = False) -> int:
    q = db.query(func.count(CrashReport.id)).filter(
        CrashReport.user_id == user.id,
        CrashReport.created_at >= datetime.now(timezone.utc) - timedelta(hours=hours),
    )
    if pictures:
        q = q.filter(CrashReport.screenshot_type.isnot(None))
    return q.scalar() or 0


def _within_limit(db: Session, user: User) -> None:
    # One person's reports are counted one at a time: their account row is
    # held until this report is in, so a burst sent at once cannot all pass.
    db.query(User.id).filter(User.id == user.id).with_for_update().first()
    if _sent_since(db, user, 1) >= PER_HOUR:
        raise HTTPException(
            status_code=429,
            detail="That is a lot of reports in an hour — thank you. Try again later.",
        )


def _may_add_picture(db: Session, user: User) -> bool:
    return (
        _sent_since(db, user, 1, pictures=True) < PICTURES_PER_HOUR
        and _sent_since(db, user, 24, pictures=True) < PICTURES_PER_DAY
    )


def _emails_this_hour(db: Session) -> int:
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    return (
        db.query(func.count(CrashReport.id))
        .filter(CrashReport.emailed.is_(True), CrashReport.created_at >= since)
        .scalar()
        or 0
    )


def _email_admins(db: Session, report: CrashReport) -> None:
    """Tell the admins about a new kind of crash. Never fails the report,
    which is already saved: nothing here is rolled back."""
    report_id = report.id
    try:
        if _emails_this_hour(db) >= EMAILS_PER_HOUR:
            return
        settings = _get_settings(db)
        if not settings.smtp_host:
            return
        admins = [
            u.email
            for u in db.query(User).filter(
                User.role == "admin", User.is_active.is_(True)
            )
            if u.email
        ]
        if not admins:
            return
        subject, body = rules.email_text(report)
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = (
            f"{settings.smtp_from_name or settings.company_name or 'TIG'} "
            f"<{settings.smtp_user}>"
        )
        msg["To"] = ", ".join(admins)
        error = _send_and_log(
            db,
            smtp_config=smtp_config(settings),
            recipients=admins,
            msg_string=msg.as_string(),
            log_data={
                "to_email": rules.clip(", ".join(admins), 200),
                "subject": subject,
                "email_type": "crash_report",
                "sent_by": rules.clip(report.username or "system", 50),
            },
        )
        if error is None:
            report.emailed = True
            db.commit()
    except Exception:  # the report is in; the email is a courtesy
        log.exception("crash report %s: emailing the admins failed", report_id)


@router.post("", response_model=Sent, status_code=201)
def send_report(
    body: CrashIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """A crash, an error or a person's own report — from anyone signed in."""
    _within_limit(db, current_user)
    picture, picture_type = _picture(body.screenshot)
    if picture is not None and not _may_add_picture(db, current_user):
        picture = picture_type = None  # the words still go
    fingerprint = rules.fingerprint(body.kind, body.message, body.stack)
    first_of_kind = (
        db.query(CrashReport.id).filter(CrashReport.fingerprint == fingerprint).first()
        is None
    )
    report = CrashReport(
        **body.model_dump(exclude={"breadcrumbs", "screenshot"}),
        fingerprint=fingerprint,
        breadcrumbs=json.dumps([s.model_dump() for s in body.breadcrumbs]),
        user_id=current_user.id,
        username=current_user.full_name or current_user.username,
        role=current_user.role,
        screenshot=picture,
        screenshot_type=picture_type,
        status="new",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    # A new kind of fault is news; a person's own report is read on the screen.
    if first_of_kind and report.kind != "report":
        _email_admins(db, report)
    return {"id": report.id, "fingerprint": fingerprint, "first_of_kind": first_of_kind}


@router.patch("/{report_id}/details", response_model=Sent)
def add_details(
    report_id: int,
    body: DetailsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """The person whose crash was recorded adds their words and picture: once,
    within the hour, to their own."""
    report = db.get(CrashReport, report_id)
    if not report or report.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Crash report not found")
    created = report.created_at
    if created is not None and created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    late = created is not None and datetime.now(timezone.utc) - created > DETAILS_WINDOW
    if report.details_added_at is not None or late:
        raise HTTPException(
            status_code=409,
            detail="This crash has had its details already — send a new report.",
        )
    picture, picture_type = _picture(body.screenshot)
    if picture is not None and not _may_add_picture(db, current_user):
        picture = picture_type = None
    report.description = body.description
    if picture is not None:
        report.screenshot, report.screenshot_type = picture, picture_type
    report.details_added_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": report.id, "fingerprint": report.fingerprint, "first_of_kind": False}


def _occurrences(db: Session, fingerprints: set[str]) -> dict[str, int]:
    if not fingerprints:
        return {}
    rows = (
        db.query(CrashReport.fingerprint, func.count(CrashReport.id))
        .filter(CrashReport.fingerprint.in_(fingerprints))
        .group_by(CrashReport.fingerprint)
        .all()
    )
    return dict(rows)


def _row(report: CrashReport, counts: dict[str, int], has_picture: bool) -> dict:
    return {
        "id": report.id,
        "created_at": report.created_at,
        "kind": report.kind,
        "auto": report.auto,
        "fingerprint": report.fingerprint,
        "message": report.message,
        "description": report.description,
        "module": report.module,
        "job_id": report.job_id,
        "username": report.username,
        "role": report.role,
        "status": report.status,
        "has_screenshot": has_picture,
        "occurrences": counts.get(report.fingerprint, 1),
    }


@router.get("", response_model=List[ReportRow])
def list_reports(
    status: Optional[Status] = None,
    kind: Optional[Kind] = None,
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Newest first, each with how many reports its kind has. The pictures
    stay behind (`/screenshot`)."""
    q = db.query(CrashReport, CrashReport.screenshot_type.isnot(None)).options(
        defer(CrashReport.screenshot),
        defer(CrashReport.stack),
        defer(CrashReport.component_stack),
        defer(CrashReport.breadcrumbs),
    )
    if status:
        q = q.filter(CrashReport.status == status)
    if kind:
        q = q.filter(CrashReport.kind == kind)
    rows = q.order_by(CrashReport.id.desc()).limit(limit).all()
    counts = _occurrences(db, {r.fingerprint for r, _ in rows})
    return [_row(r, counts, bool(has)) for r, has in rows]


def _get(db: Session, report_id: int) -> CrashReport:
    report = (
        db.query(CrashReport)
        .options(defer(CrashReport.screenshot))
        .filter(CrashReport.id == report_id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Crash report not found")
    return report


def _detail(db: Session, report: CrashReport) -> dict:
    counts = _occurrences(db, {report.fingerprint})
    try:
        steps = json.loads(report.breadcrumbs or "[]")
    except ValueError:
        steps = []
    return {
        **_row(report, counts, report.screenshot_type is not None),
        "stack": report.stack,
        "component_stack": report.component_stack,
        "url": report.url,
        "app_build": report.app_build,
        "user_agent": report.user_agent,
        "viewport": report.viewport,
        "request_id": report.request_id,
        "breadcrumbs": steps,
        "screenshot_type": report.screenshot_type,
        "details_added_at": report.details_added_at,
        "admin_note": report.admin_note,
        "emailed": report.emailed,
    }


@router.get("/{report_id}", response_model=ReportDetail)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return _detail(db, _get(db, report_id))


@router.get("/{report_id}/screenshot")
def get_screenshot(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """The picture, as the type its bytes were checked to be."""
    report = db.get(CrashReport, report_id)
    if not report or not report.screenshot:
        raise HTTPException(status_code=404, detail="No screenshot")
    return Response(
        content=report.screenshot,
        media_type=report.screenshot_type,
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": f'inline; filename="crash-{report.id}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.patch("/{report_id}", response_model=ReportDetail)
def review_report(
    report_id: int,
    body: Review,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Mark a report New, Looking or Fixed, and note what was found."""
    report = _get(db, report_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "status" and value is None:
            continue
        setattr(report, field, value)
    db.commit()
    return _detail(db, report)


@router.delete("/{report_id}", status_code=204)
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Remove a report and its picture for good — one that holds something it
    should not, or a fixed one no longer worth keeping."""
    report = db.get(CrashReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Crash report not found")
    db.delete(report)
    db.commit()
    return Response(status_code=204)

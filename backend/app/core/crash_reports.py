"""Crash reports: what makes two crashes the same, and what a picture may be.

docs/superpowers/specs/2026-11-08-crash-reports.md.
"""

import base64
import binascii
import hashlib
import re
import uuid
from typing import Optional

KINDS = ("crash", "error", "server_error", "report")
STATUSES = ("new", "looking", "fixed")

# Vercel takes 4.5 MB a request; the picture is base64 (a third larger) in JSON.
MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024

# Text is cut to fit, never refused: a crash must not fail to report because
# its stack is long.
LIMITS = {
    "message": 2000,
    "stack": 20000,
    "component_stack": 10000,
    "description": 4000,
    "url": 500,
    "module": 50,
    "job_id": 20,
    "app_build": 60,
    "user_agent": 500,
    "viewport": 20,
    "request_id": 64,
}
MAX_STEPS = 50
MAX_STEP_TEXT = 300

# What a picture's first bytes say it is — the type is believed from these,
# never from what the browser claims.
_SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
)
_DATA_URL = re.compile(r"^data:image/(png|jpeg|webp);base64,(.*)$", re.S)


def clip(value: Optional[str], limit: int) -> Optional[str]:
    if value is None:
        return None
    text = str(value)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def image_type(data: bytes) -> Optional[str]:
    for magic, kind in _SIGNATURES:
        if data.startswith(magic):
            return kind
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def decode_screenshot(data_url: str) -> tuple[bytes, str]:
    """The picture's bytes and type, or ValueError saying what is wrong."""
    found = _DATA_URL.match(data_url or "")
    if not found:
        raise ValueError("The screenshot must be a PNG, JPEG or WebP image.")
    try:
        data = base64.b64decode(found.group(2), validate=True)
    except (binascii.Error, ValueError) as e:
        raise ValueError("The screenshot could not be read.") from e
    if len(data) > MAX_SCREENSHOT_BYTES:
        raise ValueError("The screenshot is larger than 3 MB.")
    kind = image_type(data)
    if kind is None:
        raise ValueError("The screenshot is not a PNG, JPEG or WebP image.")
    return data, kind


# Numbers, ids and hashes vary between two of the same crash; take them out.
_VARYING = (
    (
        re.compile(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I
        ),
        "<id>",
    ),
    (re.compile(r"\b[0-9a-f]{10,}\b", re.I), "<hash>"),
    (re.compile(r"\d+"), "#"),
    (re.compile(r"\s+"), " "),
)
# A built file's name carries its build's hash, which may itself hold a dash:
# index-Bq3x9.js, dist--IBOn9rI.js.
_BUILT_FILE = re.compile(r"-[A-Za-z0-9_-]{6,}(?=\.(js|mjs|css)\b)")
_LOCATION = re.compile(r":\d+(:\d+)?\)?$")
# Chrome writes "    at fn (file:1:2)"; Firefox and Safari "fn@file:1:2".
_V8_FRAME = re.compile(r"^at\s")
_GECKO_FRAME = re.compile(r"^\S*@\S+:\d+:\d+$")


def _normalise(text: str) -> str:
    for pattern, put in _VARYING:
        text = pattern.sub(put, text)
    return text.strip()


def top_frame(stack: Optional[str]) -> str:
    """The first frame of a stack, without its line, column or build hash."""
    for line in (stack or "").splitlines():
        line = line.strip()
        if _V8_FRAME.match(line) or _GECKO_FRAME.match(line):
            line = re.sub(r"\?[^:)]*", "", line)  # ?v=… on a dev build
            line = _BUILT_FILE.sub("", line)
            return _normalise(_LOCATION.sub("", line).rstrip(")"))
    return ""


def fingerprint(kind: str, message: Optional[str], stack: Optional[str]) -> str:
    """The kind of fault: the same crash from many people shares it. A
    person's own report is a kind of its own."""
    if kind == "report":
        return uuid.uuid4().hex
    basis = "|".join((kind, _normalise(message or ""), top_frame(stack)))
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def email_text(report) -> tuple[str, str]:
    """The subject and body of the email to the admins on a new kind."""
    what = {
        "crash": "A screen crashed",
        "error": "An error in the app",
        "server_error": "A server error",
        "report": "A problem reported",
    }.get(report.kind, "A crash")
    where = " · ".join(
        part
        for part in (report.module, f"job {report.job_id}" if report.job_id else None)
        if part
    )
    subject = f"{what}{f' — {where}' if where else ''}"
    lines = [
        f"{what} for {report.username or 'someone'} ({report.role or 'unknown role'}).",
        "",
        f"Message: {report.message or '—'}",
        f"Their words: {report.description or '—'}",
        f"Screen: {where or '—'}",
        f"Build: {report.app_build or '—'}  Request: {report.request_id or '—'}",
        "",
        f"Open Admin → Crash reports, report #{report.id}, for the picture and the steps.",
    ]
    return clip(subject, 200), "\n".join(lines)

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    func,
)

from app.database import Base


class CrashReport(Base):
    """A crash, an uncaught error, a server error, or a person's own report.

    docs/superpowers/specs/2026-11-08-crash-reports.md. Recorded automatically
    or sent by the person who saw it, with what they were doing and, when they
    send one, a picture of the screen. Read by admins only.
    """

    __tablename__ = "crash_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    # crash · error · server_error · report
    kind = Column(String(20), nullable=False)
    # Recorded without the person sending it (a crash nobody reported).
    auto = Column(Boolean, nullable=False, default=False)
    # The kind of fault: the same crash from many people shares it.
    fingerprint = Column(String(64), nullable=False, index=True)
    message = Column(Text)
    stack = Column(Text)
    component_stack = Column(Text)
    description = Column(Text)
    # Where and on what: the page, the screen (module) and the job open.
    url = Column(String(500))
    module = Column(String(50))
    job_id = Column(String(20))
    app_build = Column(String(60))
    user_agent = Column(String(500))
    viewport = Column(String(20))
    request_id = Column(String(64))
    # The last steps before it, as JSON: [{at, kind, text}].
    breadcrumbs = Column(Text)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Who, as they were then: the account may be renamed or removed later.
    username = Column(String(100))
    role = Column(String(20))
    screenshot = Column(LargeBinary)
    screenshot_type = Column(String(20))
    # The person added their words and picture to a recorded crash.
    details_added_at = Column(DateTime(timezone=True))
    # new · looking · fixed
    status = Column(String(20), nullable=False, default="new")
    admin_note = Column(Text)
    # The first report of its kind emailed the admins.
    emailed = Column(Boolean, nullable=False, default=False)

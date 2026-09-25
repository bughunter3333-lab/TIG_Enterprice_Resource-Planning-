import uuid
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi.errors import RateLimitExceeded

from app.core.limiter import limiter
from app.core.config import settings
from app.core.logging_config import configure_logging, request_id_var
from app.routers import (
    accounting,
    auth,
    users,
    jobs,
    inventory,
    customers,
    suppliers,
    purchase_orders,
    ai,
    import_data,
    card_files,
    open_freight,
    reports,
    email_router,
    settings_router,
    styles,
    document_templates,
)
from app.routers import (
    health,
    pdf,
    ship_to,
    supplier_price_list,
    goods_receipt,
    accounts_payable,
    analytics,
    saved_lists,
    dispatch_sessions,
)
from app.routers.admin_settings import router as admin_settings_router

configure_logging(json_logs=settings.is_production)

# The interactive docs and the schema behind them are a complete, clickable map
# of every endpoint and payload. Useful in development; in production, on a
# public URL, they hand that map to anyone who asks. `openapi_url=None` turns
# off all three routes, since /docs and /redoc both read from it.
_docs = (
    {}
    if not settings.is_production
    else {
        "docs_url": None,
        "redoc_url": None,
        "openapi_url": None,
    }
)
app = FastAPI(title="Total Image ERP API", version="1.0.0", **_docs)

app.state.limiter = limiter


async def _rate_limited(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    # slowapi's own handler answers `{"error": ...}`. Every other error in this
    # API is `{"detail": ...}`, which is the one field the frontend reads — so a
    # rate-limited sign-in showed "Request failed: 429" instead of a reason.
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Wait a minute and try again."},
    )


app.add_exception_handler(RateLimitExceeded, _rate_limited)


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        token = request_id_var.set(request_id)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
        )
        return response


app.add_middleware(RequestIDMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(jobs.router)
app.include_router(inventory.router)
app.include_router(customers.router)
app.include_router(suppliers.router)
app.include_router(purchase_orders.router)
app.include_router(ai.router)
app.include_router(import_data.router)
app.include_router(card_files.router)
app.include_router(open_freight.router)
app.include_router(reports.router)
app.include_router(email_router.router)
app.include_router(settings_router.router)
app.include_router(styles.router)
app.include_router(pdf.router)
app.include_router(ship_to.router)
app.include_router(supplier_price_list.router)
app.include_router(goods_receipt.router)
app.include_router(document_templates.router)
app.include_router(accounts_payable.router)
app.include_router(analytics.router)
app.include_router(admin_settings_router)
app.include_router(saved_lists.router)
app.include_router(dispatch_sessions.router)
app.include_router(accounting.router)

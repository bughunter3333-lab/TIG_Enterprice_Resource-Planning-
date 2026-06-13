# Total Image Group ERP — Claude Code Guide

## Project layout

```text
backend/   FastAPI + SQLAlchemy + PostgreSQL
frontend/  React + Vite + TanStack Query (JSX/Tailwind)
```

## Backend — daily commands

```bash
cd backend

# Run all tests (SQLite in-memory, no PostgreSQL needed)
python -m pytest --no-cov -q

# Unit tests only (fast, ~1 s)
python -m pytest -m unit --no-cov -q

# Integration tests only
python -m pytest -m integration --no-cov -q

# With coverage report
python -m pytest

# Dev server (requires .env with DATABASE_URL + SECRET_KEY)
uvicorn app.main:app --reload --port 8000

# Apply pending DB migrations (PostgreSQL)
python -m alembic upgrade head

# Seed initial admin user
python seed_admin.py

# Lint / format
ruff check app tests
black --check app tests
```

## Key architecture

- `app/main.py` — FastAPI app, middleware (RequestID, SecurityHeaders, CORS, rate-limit)
- `app/core/abn.py` — ATO ABN checksum validation (`validate_abn`, `format_abn`, `clean_abn`)
- `app/core/fiscal.py` — Australian fiscal year helpers (July–June default)
- `app/core/logging_config.py` — JSON logs in production, plain in dev
- `app/routers/health.py` — `/health` (liveness) and `/health/ready` (readiness + DB check)
- `app/routers/pdf.py` — ReportLab PDF generator; `GET /jobs/{id}/pdf?type=invoice|quote|picking-slip|job-sheet`
- `app/routers/ship_to.py` — Customer ship-to address CRUD (`GET/POST/PATCH/DELETE /customers/{id}/ship-tos`)
- `app/routers/` — FastAPI routers (thin; business logic stays in core/)
- `app/models/` — SQLAlchemy ORM models
- `alembic/versions/` — DB migration history; latest head: `i3j4k5l6m7n8`
- `frontend/src/ui/` — design tokens (`tokens.js`), UI primitives (DataGrid, FilterBar, StatusBadge, Button, Field, Select, Tabs, Modal, KpiTile, Toast)
- `frontend/src/ui/shell/` — app chrome: ModuleBar (top), LiveTree (left), StatusBar (bottom), AppShell (composition)
- `frontend/src/modules/jobs/` — Jobs module (JobsModule, JobsList, jobsFilters) — first migrated module
- Frontend tests: `cd frontend && npm test` (vitest + testing-library)

## Test infrastructure

Tests live in `backend/tests/`. All tests use SQLite in-memory — no PostgreSQL required.

`conftest.py` provides: `client`, `db`, `make_customer`, `make_supplier`, `make_inventory`, `make_purchase_order`.

- `tests/unit/` — pure logic tests (ABN, fiscal year, model helpers)
- `tests/integration/` — full HTTP round-trips via FastAPI `TestClient`

## Australian compliance notes

- ABN validation uses the ATO 11-digit weighted checksum (weights: 10,1,3,5,7,9,11,13,15,17,19)
- GST is 10% — `total_inc = total_ex * 1.10`
- BAS labels: G1 = total sales inc GST, 1A = GST collected, 1B = GST on purchases
- Fiscal year: 1 July → 30 June

## Environment variables (see .env.example)

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL `postgresql://user:pass@host/db` |
| `SECRET_KEY` | yes | 64-char hex — `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ENVIRONMENT` | no | `production` enables JSON logs + secure cookies (default: `production`) |
| `ANTHROPIC_API_KEY` | no | Required for AI assistant features |

## CI

GitHub Actions: `.github/workflows/test.yml`

- Runs lint (ruff + black) then unit + integration tests on Python 3.11 and 3.12
- Coverage uploaded to Codecov

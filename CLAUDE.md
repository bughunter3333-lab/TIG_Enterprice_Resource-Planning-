# Total Image ERP — Claude Code Guide

## Always

- Check `docs/superpowers/plans/` and `docs/superpowers/specs/` before changing a module. The plans carry verified API shapes and line references — trust them rather than re-deriving.
- Follow the shape of `frontend/src/modules/stock/` when building a module: `<Name>Module.jsx`, a list, a pure filters module, `__tests__/`.
- Route stock changes through the shared paths. Anything that changes `InventoryItem.stock` must also call `adjust_location`; every `StockMovement` must be constructed with `location_branch` (the value is already in scope — it is what the adjacent `adjust_location` uses); and anything that changes a job's status must go through `_apply_status_transition`. Each has been forgotten on an individual path before, and each time it corrupted the ledger silently.
- Run the validation gate below before reporting work as done.

## Never

- Never sweep a colour across files with a regex. A palette sweep once rewrote 11 traffic-light lines where amber meant *warning*, not brand — and missed `index.css` entirely because the sweep only covered `.jsx`/`.js`.
- Never add a model `Column` with no writer. `tests/unit/test_schema_conventions.py` fails on one; if it is genuinely deliberate, add it to `unwritten_columns.json` with a real reason. Endpoints that return ORM rows without a `response_model` ship the column to the client, where a permanent zero reads as data.
- Never mock `../api` with a partial object literal in a component test. Use `renderWithQuery` from `src/test/renderWithQuery.jsx` — TanStack Query turns a missing method into an empty render, so the test passes while covering nothing.
- Never leave a second Alembic head. A deploy runs `upgrade head` and applies one branch only.
- Never add a *new* surface to `frontend/src/TotalImageERP.jsx`. Carve it into `frontend/src/modules/<name>/` instead; the monolith is shrinking, not growing.

## Ask First

- Changing `frontend/src/ui/tokens.js` or `STATUS_COLORS` — the palette cascades to ~47 files and the status colours are semantic.
- Changing an API response shape that `frontend/src/api.js` normalises.
- Adding a production dependency.
- Applying a migration to the live database. Commits should contain the migration file; running it is a deploy step.

## Validation Commands

Run in this order; stop at the first failure.

```bash
cd backend && python -m pytest --no-cov -q
cd backend && ruff check app tests && black --check app tests
cd frontend && npm test
cd frontend && npm run build
```

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

# Seed realistic demo data (idempotent; customers, stock, jobs across all statuses)
python seed_data.py

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
- `app/models/` — SQLAlchemy ORM models (incl. `stock_location.py`, `stock_pricing.py` for the Stock module)
- `app/routers/inventory.py` — Stock API: locations CRUD, pricing (cost + qty-break levels), `/transactions`, `/committed` (`/inventory/{sku}/...`)
- `alembic/versions/` — DB migration history; latest head: `a7b8c9d0e1f2` (users.must_change_password)
- `app/routers/saved_lists.py` — server-synced per-user nav-tree lists (`/saved-lists`, max 25 per node)
- `app/routers/dispatch_sessions.py` — recorded despatch batches (Jim2 "Dispatch #"); creating one dispatches its jobs + records reviewable lines (`/dispatch-sessions`)
- `app/routers/rack_sections.py` — racking marked for a customer on the 3D warehouse map: two corner boxes on one rack face, no overlaps (`GET/POST/DELETE /rack-sections`); bin codes are parsed in `app/core/bin_codes.py`
- `app/core/racking.py` — the racking a branch has, read on the server as the map reads it; a bin on a stock position must be a box in it (`checked_bin`)
- `app/routers/users.py` — accounts and roles, admin only; `app/core/access.py` builds "what each role can do" from the routes' own gates, and `tests/unit/test_access_gates.py` fails on a route with no gate or one that admits a junior role over a senior one
- `frontend/src/modules/users/` — Users and roles screen, mounted in the Admin section (`components/admin/AdminPanel.jsx`); spec: `docs/superpowers/specs/2026-10-12-users-and-roles.md`
- `frontend/src/ui/` — design tokens (`tokens.js`), UI primitives (DataGrid, FilterBar, StatusBadge, Button, Field, Select, Tabs, Modal, KpiTile, Toast)
- `frontend/src/ui/shell/` — app chrome: ModuleBar (top), LiveTree (left), StatusBar (bottom), AppShell (composition)
- `frontend/src/modules/jobs/` — Jobs module (JobsModule, JobsList, jobsFilters) — first migrated module; Quotes module reuses JobsModule via `lockedStatus="QUOTE"`
- `frontend/src/modules/stock/` — Stock module (StockModule master/detail, StockList, 5 tabs) on the Stock API; replaces the old flat inventory table
- `frontend/src/modules/purchase-orders/` — Purchase Orders module (POModule list + KPI/filter, poFilters); inline goods-receipt panel stays in the monolith
- `frontend/src/modules/customers/` — Customers module (CustomersModule list + KPI/search, customerAggregates); detail panel (tabs) stays in the monolith
- `frontend/src/modules/card-files/` — Card Files module (CardFilesModule list + search/group, cardFileFilters); detail panel + create/edit modal stay in the monolith
- Frontend tests: `cd frontend && npm test` (vitest + testing-library)
- Frontend scene probes: `cd frontend && npm run test:scene` — the real 3D warehouse scene with only the renderer faked, real pointer/wheel/key events, every frame's eye position checked (`frontend/scene-probes/`). A few minutes, not part of `npm test`; run after touching `Warehouse3D.jsx`, `Walk3D.jsx` or anything that moves the camera. Unit tests do not see these faults.
- Frontend E2E smoke: `cd frontend && npm run test:e2e` (Playwright; builds + serves the app and runs the boot smoke. Set `E2E_BASE_URL` + `E2E_USERNAME` + `E2E_PASSWORD` to also run the authenticated flow against a live deployment)

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
| `DATABASE_URL` | yes | PostgreSQL `postgresql://user:pass@host/db`; in production the Supabase transaction pooler (port 6543) |
| `MIGRATION_DATABASE_URL` | yes on Vercel | What Alembic migrates through when set (production: the Supabase session pooler, port 5432); `DATABASE_URL` otherwise |
| `SECRET_KEY` | yes | 64-char hex — `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ENVIRONMENT` | no | `production` enables JSON logs + secure cookies (default: `production`) |
| `ANTHROPIC_API_KEY` | no | Required for AI assistant features |

## Deploy

Vercel runs both halves, as two projects; the database is Supabase. `DEPLOY.md` is the runbook.

- Website: Root Directory `frontend`; `frontend/vercel.json` rewrites `/api/*` to the API. It points at the API project only once that project's production domain is confirmed (the repo is public: never rewrite to an address the owner does not already hold).
- API: Root Directory `backend`, a FastAPI Vercel Function in Sydney (`backend/vercel.json`, `.python-version`). It installs `requirements.txt` only — test and lint tools are in `requirements-dev.txt`. There is deliberately no `backend/pyproject.toml`: Vercel reads one as the package list and fails on it without a `[project]` table. Ruff's settings are in `backend/ruff.toml`; black runs on its defaults. A production build runs `migrate_on_deploy.py` (`alembic upgrade head`) before the deployment takes traffic, so a push to `main` is when a migration reaches the live database. Connections are per request (`NullPool`, `app/database.py`); request bodies are capped at 4.5 MB by Vercel. `.github/workflows/migrate.yml` (*Migrate database*) is manual only: migrations by hand, and the first admin without a terminal — never give it a push trigger, or it races the deploy.

## CI

GitHub Actions: `.github/workflows/test.yml`

- Runs lint (ruff + black) then unit + integration tests on Python 3.11 and 3.12
- Coverage uploaded to Codecov
- A separate `frontend` job runs `npm ci`, the vitest suite, and the production build

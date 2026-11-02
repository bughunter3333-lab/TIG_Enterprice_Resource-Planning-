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

# TIG demo data through the API as the first admin (invoices numbered, ledger
# agrees; test DBs only — tests/integration/test_seed_demo.py)
python seed_demo.py

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
- `app/routers/pdf.py` — ReportLab PDF generator; `GET /jobs/{id}/pdf?type=invoice|quote|proforma|picking-slip|job-sheet|delivery-note|ship-label|job-label` (invoice and proforma are `require_staff`; hidden lines never print); `GET /job-documents?type=…&job_id=…&job_id=…` prints many jobs in one PDF (it is not under `/jobs/`, where `GET /jobs/{job_id}` would swallow it). Despatch documents are built in `app/core/despatch_documents.py`, the purchase order in `app/core/purchase_order_document.py`
- `app/routers/ship_to.py` — Customer ship-to address CRUD (`GET/POST/PATCH/DELETE /customers/{id}/ship-tos`)
- `app/routers/` — FastAPI routers (thin; business logic stays in core/)
- `app/models/` — SQLAlchemy ORM models (incl. `stock_location.py`, `stock_pricing.py` for the Stock module)
- `app/routers/inventory.py` — Stock API: locations CRUD, pricing (cost + qty-break levels), `/transactions`, `/committed` (`/inventory/{sku}/...`)
- `alembic/versions/` — DB migration history; latest head: `e7f8a9b0c1d2` (invoice terms, inc-priced lines, supplier credit notes)
- Job status (`app/routers/jobs.py`): one gate, `_apply_status_transition`, for every path that changes a status — create (a new job is made as QUOTE and moved, so the credit check runs), duplicate, import, bulk, PATCH, despatch, unprint. Production ladder: `ORDER · In Progress · PROOF · PRINT · Pick/Pack · Desp/Ready · FINISH`, then `INVOICE · PAID`; anyone may skip forward or go back one step, an admin further back. Entering INVOICE/PAID issues the next invoice number (`app/core/invoice_numbers.py`); only staff and above may touch an invoiced status. The job total is the server's sum of its lines (`app/core/job_totals.py`), never the caller's
- Job lines: goods vs services. A decoration or alteration line (`JobItem.logo_id` or `applies_to_item_id` → `is_service`) is never reserved, bought, picked or shipped; nor is a charge — a stock code typed Service or Non-Depleting, or in the Service category, such as FREIGHT (`JobItem.is_charge`, `models/inventory.py` `is_charge`). Logos are a master per customer (`app/routers/logos.py`: `/logos`, proofed once with `POST /logos/{id}/proof`; `made_by` `in_house`/`subcontract`); a job goes from before PRINT to PRINT or past it only with every logo on it approved (`_require_approved_proofs`)
- Line prices: a line sent with `price_inc` and no `price_ex` (the online store) is `priced_inc` and totals its inc price to the cent (`app/core/job_totals.py`); one sent with no price takes the stock's price level break for its own quantity, else the sell price (`_stock_price`). An invoice stamps its terms and due date when issued (`invoice_terms`, `invoice_due_date`)
- `app/core/receiving.py` — the one receive path (goods receipts and the PO screen's inline receive): credits every open PO line of the SKU, settles the PO Partial/Received, fills back-orders for the PO lines' own jobs first; a code that is no stock item (an indent) goes straight to the PO line's job (`fill_bought_in`). Bills: `app/core/bill_matching.py` (PO ordered/received/billed), payments are rows in `supplier_bill_payments` with a ledger entry each (`app/core/ledger_postings.py`); a supplier credit note is a negative bill applied to one of its bills (`POST /ap/bills/{credit}/apply`, `applied_to_bill_id`), never paid — what is owed is `bill_outstanding`
- `app/routers/remittances.py` — `POST /customers/{id}/remittances`: one customer payment over many invoices, as allocated or oldest first, all or nothing
- `POST /purchase-orders/{id}/email` — the PO as a PDF to the supplier, logged; a Draft becomes Sent. `/reports/aged-payables` ages unpaid bills; open POs, less what is billed against them, are `committed` beside it
- `app/routers/saved_lists.py` — server-synced per-user nav-tree lists (`/saved-lists`, max 25 per node)
- `app/routers/dispatch_sessions.py` — recorded despatch batches (Jim2 "Dispatch #"); creating one dispatches its jobs + records reviewable lines (`/dispatch-sessions`). Each consignment records what went per job line (`dispatch_line_items`): what is picked (else supplied) less what earlier consignments took, so a further consignment of back-ordered sizes (`again: true`) prints only what is in the carton. A job already despatched goes again only with `again`. A batch is all or nothing, save a job with nothing left to send: it is left out and listed in `skipped`. A despatch goes on `despatch_date` (today unless given, 30 days back to 14 ahead — `despatch_day`), stored per consignment and printed on its delivery note
- `app/routers/rack_sections.py` — racking marked for a customer on the 3D warehouse map: two corner boxes on one rack face, no overlaps (`GET/POST/DELETE /rack-sections`); bin codes are parsed in `app/core/bin_codes.py`
- `app/core/racking.py` — the racking a branch has, read on the server as the map reads it; a bin on a stock position must be a box in it (`checked_bin`)
- `app/routers/users.py` — accounts and roles, admin only; `app/core/access.py` builds "what each role can do" from the routes' own gates, and `tests/unit/test_access_gates.py` fails on a route with no gate or one that admits a junior role over a senior one
- `GET /users/me/access` — the signed-in person's own role: their column of the access table plus `allowed`, every route their gate admits as `"METHOD /path-template"` (`role_access` in `app/core/access.py`). The frontend decides what to offer only from this: `frontend/src/lib/access.js` (`canCall`, `offers`) and `lib/useMyAccess.js`. Never decide visibility from a role's name.
- Money reads (reports with amounts, analytics, `/ap/*`, customer statements, the sales register, invoice/proforma PDFs) are `require_staff`: overseas_staff read only counts and days.
- `portal` is a service role (`SERVICE_ROLES` in `app/core/dependencies.py`), for the online store: it may only `POST /jobs` (`require_intake`, booked as New/QUOTE with its order number, a repeat order number is a 409 naming the job) and comment on jobs it booked (`require_commenter`). Spec: `docs/superpowers/specs/2026-10-12-users-and-roles.md`
- `app/core/payment_terms.py` — an invoice's due date from the customer's terms counted from the invoice date (`Net 30`, `30DAYSINV`, `COD`, `EOM`, `30 EOM`; unknown → company default → Net 30). `/reports/aged-receivables` buckets by days overdue: `current`, `days_1_30`, `days_31_60`, `days_61_90`, `over_90`.
- `frontend/src/modules/home/` — role-based Home, the landing module (`homeSections.js` is pure: the tiles per role are a content list, a tile shows only if `canSee` finds every route it reads in `allowed`); spec: `docs/superpowers/specs/2026-10-19-role-based-home.md`
- `frontend/src/modules/users/` — Users and roles screen, mounted in the Admin section (`components/admin/AdminPanel.jsx`), beside Company Settings (`modules/SettingsModule.jsx`); spec: `docs/superpowers/specs/2026-10-12-users-and-roles.md`
- `frontend/src/ui/` — design tokens (`palette.js` is the single source, read by `tokens.js` and `tailwind.config.js`; `index.css` mirrors a few, enforced by `paletteMirror.test`), UI primitives (DataGrid, FilterBar, StatusBadge, Button, IconButton, Card, SegmentedControl, DensityToggle, Field, Select, `fieldStyle.js`, Tabs, Modal, KpiTile, Toast). The look: `docs/superpowers/specs/2026-10-25-calm-product-look.md`
- `frontend/src/ui/shell/` — app chrome: Sidebar (left: modules in groups from `shellModules.js`, then LiveTree), TopBar (title, search, Ask, New job), StatusBar (bottom), AppShell (composition; its `<main>` is the only page landmark and padding)
- `frontend/src/modules/jobs/` — Jobs module (JobsModule, JobsList, jobsFilters, DispatchList) — first migrated module; Quotes module reuses JobsModule via `lockedStatus="QUOTE"`. The job record's header, stepper and cards are in `modules/jobs/record/` (`lifecycle.js` decides the next step)
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

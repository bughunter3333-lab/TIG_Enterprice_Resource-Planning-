# Total Image — ERP System

Internal enterprise resource planning system for Total Image. Built with FastAPI and React.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI · SQLAlchemy · PostgreSQL · Alembic |
| Frontend | React · Vite · TanStack Query · Tailwind CSS |
| Auth | JWT (access + refresh tokens) · bcrypt · TOTP 2FA · role-based access derived from the routes' own gates |
| Hosting | Vercel (website and API, two projects) · Supabase (PostgreSQL) — see `DEPLOY.md` |
| CI | GitHub Actions (Python 3.11 + 3.12, vitest, production build) |

---

## Modules

- **Home** — each role's own to-dos and figures; every tile opens exactly the list it counts
- **Jobs and Quotes** — job tracking, line items, decoration, proof status, despatch, PDF output (invoice / quote / picking slip / job sheet)
- **Customers and Card Files** — customer records, ship-to sites, credit hold, customer groups
- **Stock** — stock items, locations and bins, reorder, committed stock, and the 3D warehouse
- **Purchases** — purchase orders, goods receipts, supplier price matching
- **Accounts** — general ledger, payables (supplier bills), BAS
- **Reports** — aged receivables and payables, sales, GST, BAS, job profitability
- **Admin** — users and roles, company settings, job fields, status workflow, price levels, decoration types, print templates, Jim2 migration

Built but not yet reachable from any menu: Scheduling, Email, Styles, Analytics and Open Freight.

---

## Getting started (local development)

**Backend** — start it from `backend/`. Settings read `.env` relative to the working directory, so started anywhere else it silently falls back to a different database, and a correct password is refused.

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements-dev.txt

# Copy and fill in .env
cp ../.env.example .env
# Edit .env — set DATABASE_URL and SECRET_KEY

# Apply migrations
python -m alembic upgrade head

# Seed admin user
python seed_admin.py

# Start dev server (same as: uvicorn app.main:app --reload --port 8000)
python run.py
```

API docs: http://localhost:8000/docs

**Frontend**

```bash
cd frontend
npm ci
npm run dev
```

Frontend: http://localhost:3000 (it forwards `/api` to the backend on port 8000). Stop the dev server before running `npm ci` again — on Windows a running server holds a file `npm ci` needs to replace.

**Docker (optional).** `docker compose up --build` starts a database, the backend and an nginx-served frontend at http://localhost; seed the first admin with `docker compose exec backend python seed_admin.py`. Production does not use Docker.

---

## Environment variables

Copy `.env.example` to `.env` and fill in the required values.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://user:pass@host/db` (production: the Supabase transaction pooler, port 6543) |
| `MIGRATION_DATABASE_URL` | yes on Vercel | What Alembic migrates through (production: the Supabase session pooler, port 5432); `DATABASE_URL` otherwise |
| `SECRET_KEY` | yes | 64-char hex — `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ENVIRONMENT` | no | `production` enables JSON logs and secure cookies |
| `POSTGRES_DB` | docker only | Database name (default: `erp`) |
| `POSTGRES_USER` | docker only | Database user (default: `erp`) |
| `POSTGRES_PASSWORD` | docker only | Database password |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | Default: 30 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | no | Default: 7 |
| `ANTHROPIC_API_KEY` | no | Required for AI assistant features |
| `PORT` | no | Docker only: host port for the frontend (default: 80) |

---

## Running tests

No PostgreSQL required — backend tests use SQLite in-memory. Run them with the virtual environment's Python, which has the pinned versions.

```bash
cd backend

python -m pytest --no-cov -q           # all tests
python -m pytest -m unit   --no-cov    # unit tests only (~1 s)
python -m pytest -m integration --no-cov  # integration tests only
python -m pytest                        # with coverage report
```

```bash
cd frontend

npm test             # vitest
npm run build        # production build
npm run test:e2e     # Playwright smoke (builds and serves the app)
```

## Deploying

Pushing to `main` deploys both Vercel projects, and the API's production build runs `alembic upgrade head` against the live database first. The runbook is `DEPLOY.md`.

---

## Database migrations

```bash
cd backend

# Apply all pending migrations
python -m alembic upgrade head

# Generate a new migration after model changes
python -m alembic revision --autogenerate -m "describe change"

# Check current state
python -m alembic current
```

---

## Code quality

```bash
cd backend
ruff check app tests      # lint
black --check app tests   # format check
black app tests           # auto-format
```

---

## Australian compliance

- ABN validation uses the ATO 11-digit weighted checksum
- GST is 10% — totals stored as both ex-GST and inc-GST
- BAS labels: G1 = total sales inc GST · 1A = GST collected · 1B = GST on purchases
- Fiscal year: 1 July → 30 June

---

## Project structure

```
backend/
├── app/
│   ├── core/          # config, security, ABN, fiscal year, logging
│   ├── models/        # SQLAlchemy ORM models
│   └── routers/       # FastAPI route handlers
├── alembic/versions/  # migration history
└── tests/             # unit + integration tests

frontend/
├── src/
│   ├── modules/       # feature modules (home, jobs, stock, customers, …)
│   ├── ui/            # design tokens, primitives and the app shell
│   ├── lib/           # shared helpers (dates, access, notifications)
│   ├── TotalImageERP.jsx  # the original single-file app, being carved into modules/
│   └── api.js         # API client
└── vercel.json        # website project: rewrites /api to the API project

docs/                  # backlog, design specs and plans
DEPLOY.md              # Vercel + Supabase runbook
docker-compose.yml     # optional local stack: db + backend + frontend
.env.example           # environment variable template
```

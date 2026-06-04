# Total Image Group — ERP System

Internal enterprise resource planning system for Total Image Group. Built with FastAPI and React.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI · SQLAlchemy · PostgreSQL · Alembic |
| Frontend | React · Vite · TanStack Query · Tailwind CSS |
| Auth | JWT (access + refresh tokens) · bcrypt · TOTP 2FA |
| Infra | Docker · docker-compose · nginx |
| CI | GitHub Actions (Python 3.11 + 3.12) |

---

## Modules

- **Jobs** — job tracking, line items, decoration, proof status, PDF output (invoice / quote / picking slip / job sheet)
- **Customers** — customer records, ship-to addresses, credit hold, customer groups
- **Suppliers** — supplier records, ABN validation, price lists
- **Inventory** — stock items, reorder levels, committed stock, warehouse
- **Purchase Orders** — PO creation, goods receipts, supplier price matching
- **Accounts Payable** — supplier bills, AP aging, payment ledger
- **Styles** — garment styles, variant matrix (size × colour)
- **Open Freight** — freight account and parcel type management
- **Reports** — BAS summary (G1 / 1A / 1B), sales, GST, inventory, purchasing
- **Scheduling** — job calendar
- **Email** — email composer and send log
- **Settings** — company details, system configuration
- **Users** — user management, roles

---

## Getting started

### Option 1 — Docker (recommended)

```bash
# 1. Copy env and fill in values
cp .env.example .env

# 2. Build and start everything
docker compose up --build

# 3. Seed the first admin user (run once after first start)
docker compose exec backend python seed_admin.py
```

App is available at **http://localhost**

### Option 2 — Local development

**Backend**

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Copy and fill in .env
cp ../.env.example .env
# Edit .env — set DATABASE_URL and SECRET_KEY

# Apply migrations
python -m alembic upgrade head

# Seed admin user
python seed_admin.py

# Start dev server
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173

---

## Environment variables

Copy `.env.example` to `.env` and fill in the required values.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://user:pass@host/db` |
| `SECRET_KEY` | yes | 64-char hex — `python -c "import secrets; print(secrets.token_hex(32))"` |
| `POSTGRES_DB` | docker only | Database name (default: `erp`) |
| `POSTGRES_USER` | docker only | Database user (default: `erp`) |
| `POSTGRES_PASSWORD` | docker only | Database password |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | Default: 30 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | no | Default: 7 |
| `ANTHROPIC_API_KEY` | no | Required for AI assistant features |
| `PORT` | no | Host port for frontend (default: 80) |

---

## Running tests

No PostgreSQL required — tests use SQLite in-memory.

```bash
cd backend

python -m pytest --no-cov -q           # all tests
python -m pytest -m unit   --no-cov    # unit tests only (~1 s)
python -m pytest -m integration --no-cov  # integration tests only
python -m pytest                        # with coverage report
```

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
│   ├── modules/       # feature modules (Jobs, Customers, etc.)
│   ├── TotalImageERP.jsx  # main app shell
│   ├── LoginScreen.jsx
│   └── api.js         # API client
└── nginx.conf         # reverse proxy config

docker-compose.yml     # db + backend + frontend
.env.example           # environment variable template
```

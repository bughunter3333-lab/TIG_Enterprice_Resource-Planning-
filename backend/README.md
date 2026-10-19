# TIG ERP — Backend

FastAPI + SQLAlchemy + PostgreSQL backend for Total Image's internal ERP system.

## Quick start

```bash
# 1. Copy env and fill in values
cp ../.env.example .env

# 2. Install dependencies
pip install -r requirements.txt

# 3. Apply migrations
python -m alembic upgrade head

# 4. Seed admin user
python seed_admin.py

# 5. Start dev server
uvicorn app.main:app --reload --port 8000
```

API docs available at `http://localhost:8000/docs`

## Running tests

No PostgreSQL required — tests use SQLite in-memory.

```bash
python -m pytest --no-cov -q          # all tests
python -m pytest -m unit   --no-cov   # unit only
python -m pytest -m integration --no-cov  # integration only
python -m pytest                       # with coverage report
```

## Migrations

```bash
# Apply all pending migrations
python -m alembic upgrade head

# Generate a new migration after model changes
python -m alembic revision --autogenerate -m "describe the change"

# Check current state
python -m alembic current
python -m alembic heads
```

## Code quality

```bash
ruff check app tests      # lint
black --check app tests   # format check
black app tests           # auto-format
```

## Key endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Liveness probe |
| `GET /health/ready` | Readiness probe (checks DB) |
| `POST /auth/login` | Obtain JWT |
| `GET /customers/` | List customers |
| `GET /suppliers/` | List suppliers |
| `GET /jobs/` | List jobs |
| `GET /purchase-orders/` | List purchase orders |
| `GET /reports/bas-summary` | BAS summary (G1, 1A, 1B) |
| `GET /reports/sales-summary` | Sales by customer |
| `GET /reports/gst` | GST breakdown |

All routes (except `/health*` and `/auth/*`) require `Authorization: Bearer <token>`.

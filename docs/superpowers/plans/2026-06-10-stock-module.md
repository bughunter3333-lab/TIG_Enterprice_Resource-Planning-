# Stock Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Jim2-parity Stock module — master/detail split with 5 tabs (Details, Locations, Pricing, Transactions, Committed), multi-branch tracking, price levels with qty breakpoints, and stock movements linked to jobs and POs.

**Architecture:** Additive backend schema — keep `InventoryItem.stock` + `committed_qty` as aggregate totals (backwards compat), add `stock_locations`, `stock_price_levels`, `stock_price_breakpoints` tables, extend `StockMovement` with optional job/PO FKs. Frontend: extract `renderInventory()` from `TotalImageERP.jsx` into a dedicated `StockModule` component tree with master/detail split layout.

**Tech Stack:** React 18 + Vite + TanStack Query v5 (JSX, inline styles matching existing shell components), FastAPI + SQLAlchemy + Alembic + PostgreSQL, pytest with SQLite in-memory (existing conftest.py pattern).

**Spec:** `docs/superpowers/specs/2026-06-10-stock-module-design.md`

> **⚠ RECONCILED 2026-06-11 with the UI redesign spec** (`docs/superpowers/specs/2026-06-11-ui-redesign-dense-jim2-design.md`):
> - **Tasks 1–8 (backend + api.js) remain valid as written.** Task 1 (migration) is complete and committed, with one deviation from the June 10 spec: `stock_movements.job_id` is `String(20)` (matching `jobs.id`, the spec's `Integer` was wrong) and the spec'd indexes were added.
> - **Tasks 9–13 (frontend) are SUPERSEDED.** Do not build StockModule on inline styles in `TotalImageERP.jsx`. The Stock UI is built in `frontend/src/modules/stock/` on the `frontend/src/ui/` primitives (DataGrid, FilterBar, Tabs, etc.) inside the new shell, per the UI redesign spec §4 and its implementation plan.

---

## File Map

**Create:**
- `backend/alembic/versions/p0q1r2s3t4u5_stock_module_schema.py`
- `backend/app/models/stock_location.py`
- `backend/app/models/stock_pricing.py`
- `backend/tests/unit/test_stock_pricing.py`
- `backend/tests/integration/test_stock_module.py`
- `frontend/src/components/stock/StockModule.jsx`
- `frontend/src/components/stock/StockList.jsx`
- `frontend/src/components/stock/StockDetailPanel.jsx`
- `frontend/src/components/stock/tabs/StockDetailsTab.jsx`
- `frontend/src/components/stock/tabs/StockLocationsTab.jsx`
- `frontend/src/components/stock/tabs/StockPricingTab.jsx`
- `frontend/src/components/stock/tabs/StockTransactionsTab.jsx`
- `frontend/src/components/stock/tabs/StockCommittedTab.jsx`

**Modify:**
- `backend/app/models/inventory.py` — add columns to InventoryItem + StockMovement
- `backend/app/routers/inventory.py` — add 12 new endpoints + extend InventoryUpdate schema
- `backend/tests/conftest.py` — import new models so SQLite schema includes them
- `frontend/src/api.js` — extend normalizeInventory + add `stock` export
- `frontend/src/TotalImageERP.jsx` — import StockModule, replace renderInventory() call, delete renderInventory function

---

## Task 1: Alembic Migration

**Files:**
- Create: `backend/alembic/versions/p0q1r2s3t4u5_stock_module_schema.py`

- [ ] **Step 1: Write the migration file**

```python
# backend/alembic/versions/p0q1r2s3t4u5_stock_module_schema.py
"""stock_module_schema — stock_locations, stock_price_levels, stock_price_breakpoints, extend inventory + stock_movements

Revision ID: p0q1r2s3t4u5
Revises: o9p0q1r2s3t4
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = 'p0q1r2s3t4u5'
down_revision = 'o9p0q1r2s3t4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Extend inventory table
    op.add_column('inventory', sa.Column('item_type', sa.String(30), nullable=True, server_default='Depleting'))
    op.add_column('inventory', sa.Column('gl_group', sa.String(100), nullable=True))
    op.add_column('inventory', sa.Column('barcode', sa.String(100), nullable=True))
    op.add_column('inventory', sa.Column('buy_unit', sa.String(20), nullable=True))
    op.add_column('inventory', sa.Column('sell_unit', sa.String(20), nullable=True))
    op.add_column('inventory', sa.Column('buy_tax_pct', sa.Numeric(5, 2), nullable=True, server_default='10'))
    op.add_column('inventory', sa.Column('sell_tax_pct', sa.Numeric(5, 2), nullable=True, server_default='10'))
    op.add_column('inventory', sa.Column('last_cost', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('last_cog', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('avg_cost', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('avg_cog', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('max_cog', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('last_po_cogs', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('avg_po_cogs', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('last_ex', sa.Numeric(10, 4), nullable=True))
    op.add_column('inventory', sa.Column('last_effective_date', sa.String(20), nullable=True))
    op.add_column('inventory', sa.Column('price_template', sa.String(100), nullable=True))

    op.create_table(
        'stock_locations',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('sku', sa.String(50), sa.ForeignKey('inventory.sku', ondelete='CASCADE'), nullable=False),
        sa.Column('branch', sa.String(50), nullable=False),
        sa.Column('zone', sa.String(20), nullable=True),
        sa.Column('qty_on_hand', sa.Integer, nullable=False, server_default='0'),
        sa.Column('committed_qty', sa.Integer, nullable=False, server_default='0'),
        sa.Column('backorder_qty', sa.Integer, nullable=False, server_default='0'),
        sa.Column('on_po_qty', sa.Integer, nullable=False, server_default='0'),
        sa.Column('primary_bin_1', sa.String(50), nullable=True),
        sa.Column('max_qty_bin_1', sa.Integer, nullable=True),
        sa.Column('primary_bin_2', sa.String(50), nullable=True),
        sa.Column('max_qty_bin_2', sa.Integer, nullable=True),
        sa.UniqueConstraint('sku', 'branch', name='uq_stock_locations_sku_branch'),
    )

    op.create_table(
        'stock_price_levels',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('sku', sa.String(50), sa.ForeignKey('inventory.sku', ondelete='CASCADE'), nullable=False),
        sa.Column('price_level', sa.String(50), nullable=False),
        sa.Column('price_calc_method', sa.String(50), nullable=True, server_default='Fixed Price'),
        sa.Column('base_pl', sa.String(50), nullable=True),
        sa.Column('currency', sa.String(10), nullable=True, server_default='AUD'),
        sa.Column('tax_code', sa.String(10), nullable=True, server_default='G'),
        sa.UniqueConstraint('sku', 'price_level', name='uq_stock_price_levels_sku_level'),
    )

    op.create_table(
        'stock_price_breakpoints',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('price_level_id', sa.Integer, sa.ForeignKey('stock_price_levels.id', ondelete='CASCADE'), nullable=False),
        sa.Column('min_qty', sa.Integer, nullable=False, server_default='0'),
        sa.Column('price_ex', sa.Numeric(10, 4), nullable=False),
        sa.Column('price_inc', sa.Numeric(10, 4), nullable=False),
        sa.Column('pont_pct', sa.Numeric(5, 2), nullable=True),
    )

    # Extend stock_movements with optional FK links and location detail
    op.add_column('stock_movements', sa.Column('job_id', sa.String(20), sa.ForeignKey('jobs.id'), nullable=True))
    op.add_column('stock_movements', sa.Column('po_id', sa.String(50), sa.ForeignKey('purchase_orders.id'), nullable=True))
    op.add_column('stock_movements', sa.Column('po_line', sa.Integer, nullable=True))
    op.add_column('stock_movements', sa.Column('location_branch', sa.String(50), nullable=True))
    op.add_column('stock_movements', sa.Column('qty_bal', sa.Integer, nullable=True))
    op.add_column('stock_movements', sa.Column('pack_num', sa.String(50), nullable=True))
    op.add_column('stock_movements', sa.Column('bin', sa.String(50), nullable=True))
    op.add_column('stock_movements', sa.Column('link_tran_id', sa.Integer, sa.ForeignKey('stock_movements.id'), nullable=True))
    op.add_column('stock_movements', sa.Column('link_gl', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('stock_movements', 'link_gl')
    op.drop_column('stock_movements', 'link_tran_id')
    op.drop_column('stock_movements', 'bin')
    op.drop_column('stock_movements', 'pack_num')
    op.drop_column('stock_movements', 'qty_bal')
    op.drop_column('stock_movements', 'location_branch')
    op.drop_column('stock_movements', 'po_line')
    op.drop_column('stock_movements', 'po_id')
    op.drop_column('stock_movements', 'job_id')
    op.drop_table('stock_price_breakpoints')
    op.drop_table('stock_price_levels')
    op.drop_table('stock_locations')
    op.drop_column('inventory', 'price_template')
    op.drop_column('inventory', 'last_effective_date')
    op.drop_column('inventory', 'last_ex')
    op.drop_column('inventory', 'avg_po_cogs')
    op.drop_column('inventory', 'last_po_cogs')
    op.drop_column('inventory', 'max_cog')
    op.drop_column('inventory', 'avg_cog')
    op.drop_column('inventory', 'avg_cost')
    op.drop_column('inventory', 'last_cog')
    op.drop_column('inventory', 'last_cost')
    op.drop_column('inventory', 'sell_tax_pct')
    op.drop_column('inventory', 'buy_tax_pct')
    op.drop_column('inventory', 'sell_unit')
    op.drop_column('inventory', 'buy_unit')
    op.drop_column('inventory', 'barcode')
    op.drop_column('inventory', 'gl_group')
    op.drop_column('inventory', 'item_type')
```

- [ ] **Step 2: Apply migration to local PostgreSQL DB**

```bash
cd backend
python -m alembic upgrade head
```

Expected: `Running upgrade o9p0q1r2s3t4 -> p0q1r2s3t4u5, stock_module_schema`

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/p0q1r2s3t4u5_stock_module_schema.py
git commit -m "feat: stock module migration — stock_locations, price_levels, breakpoints, extend inventory + movements"
```

---

## Task 2: SQLAlchemy Models

**Files:**
- Create: `backend/app/models/stock_location.py`
- Create: `backend/app/models/stock_pricing.py`
- Modify: `backend/app/models/inventory.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Create `backend/app/models/stock_location.py`**

```python
from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class StockLocation(Base):
    __tablename__ = "stock_locations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(50), ForeignKey("inventory.sku", ondelete="CASCADE"), nullable=False, index=True)
    branch = Column(String(50), nullable=False)
    zone = Column(String(20), nullable=True)
    qty_on_hand = Column(Integer, default=0)
    committed_qty = Column(Integer, default=0)
    backorder_qty = Column(Integer, default=0)
    on_po_qty = Column(Integer, default=0)
    primary_bin_1 = Column(String(50), nullable=True)
    max_qty_bin_1 = Column(Integer, nullable=True)
    primary_bin_2 = Column(String(50), nullable=True)
    max_qty_bin_2 = Column(Integer, nullable=True)

    __table_args__ = (UniqueConstraint("sku", "branch", name="uq_stock_locations_sku_branch"),)

    @property
    def available_qty(self) -> int:
        return max(0, (self.qty_on_hand or 0) - (self.committed_qty or 0))
```

- [ ] **Step 2: Create `backend/app/models/stock_pricing.py`**

```python
from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class StockPriceLevel(Base):
    __tablename__ = "stock_price_levels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(50), ForeignKey("inventory.sku", ondelete="CASCADE"), nullable=False, index=True)
    price_level = Column(String(50), nullable=False)
    price_calc_method = Column(String(50), default="Fixed Price")
    base_pl = Column(String(50), nullable=True)
    currency = Column(String(10), default="AUD")
    tax_code = Column(String(10), default="G")

    breakpoints = relationship("StockPriceBreakpoint", back_populates="level", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("sku", "price_level", name="uq_stock_price_levels_sku_level"),)


class StockPriceBreakpoint(Base):
    __tablename__ = "stock_price_breakpoints"

    id = Column(Integer, primary_key=True, autoincrement=True)
    price_level_id = Column(Integer, ForeignKey("stock_price_levels.id", ondelete="CASCADE"), nullable=False)
    min_qty = Column(Integer, default=0)
    price_ex = Column(Numeric(10, 4), nullable=False)
    price_inc = Column(Numeric(10, 4), nullable=False)
    pont_pct = Column(Numeric(5, 2), nullable=True)

    level = relationship("StockPriceLevel", back_populates="breakpoints")
```

- [ ] **Step 3: Add new columns to `InventoryItem` and `StockMovement` in `backend/app/models/inventory.py`**

In `InventoryItem`, after the `created_at` line (before the `style_id` line), add:

```python
    # Jim2 item detail fields
    item_type = Column(String(30), default="Depleting")
    gl_group = Column(String(100), nullable=True)
    barcode = Column(String(100), nullable=True)
    buy_unit = Column(String(20), nullable=True)
    sell_unit = Column(String(20), nullable=True)
    buy_tax_pct = Column(Numeric(5, 2), default=10)
    sell_tax_pct = Column(Numeric(5, 2), default=10)

    # Cost tracking
    last_cost = Column(Numeric(10, 4), nullable=True)
    last_cog = Column(Numeric(10, 4), nullable=True)
    avg_cost = Column(Numeric(10, 4), nullable=True)
    avg_cog = Column(Numeric(10, 4), nullable=True)
    max_cog = Column(Numeric(10, 4), nullable=True)
    last_po_cogs = Column(Numeric(10, 4), nullable=True)
    avg_po_cogs = Column(Numeric(10, 4), nullable=True)
    last_ex = Column(Numeric(10, 4), nullable=True)
    last_effective_date = Column(String(20), nullable=True)
    price_template = Column(String(100), nullable=True)
```

In `StockMovement`, after `created_at`, add:

```python
    # Jim2 links and location detail (all nullable — no breaking change)
    job_id = Column(String(20), ForeignKey("jobs.id"), nullable=True, index=True)
    po_id = Column(String(50), ForeignKey("purchase_orders.id"), nullable=True)
    po_line = Column(Integer, nullable=True)
    location_branch = Column(String(50), nullable=True)
    qty_bal = Column(Integer, nullable=True)
    pack_num = Column(String(50), nullable=True)
    bin = Column(String(50), nullable=True)
    link_tran_id = Column(Integer, ForeignKey("stock_movements.id"), nullable=True)
    link_gl = Column(String(50), nullable=True)
```

- [ ] **Step 4: Register new models in `backend/tests/conftest.py`**

After the existing model imports (after line 27), add:

```python
from app.models.stock_location import StockLocation  # noqa: F401 — registers table
from app.models.stock_pricing import StockPriceLevel, StockPriceBreakpoint  # noqa: F401
```

- [ ] **Step 5: Verify models register correctly (SQLite creates all tables)**

```bash
cd backend
python -m pytest --no-cov -q --co 2>&1 | head -5
```

Expected: test collection succeeds with no import errors.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/stock_location.py backend/app/models/stock_pricing.py backend/app/models/inventory.py backend/tests/conftest.py
git commit -m "feat: stock module SQLAlchemy models — StockLocation, StockPriceLevel, StockPriceBreakpoint; extend InventoryItem + StockMovement"
```

---

## Task 3: Unit Tests (TDD — write RED tests first)

**Files:**
- Create: `backend/tests/unit/test_stock_pricing.py`

- [ ] **Step 1: Write the unit tests**

```python
# backend/tests/unit/test_stock_pricing.py
import pytest
from app.models.stock_location import StockLocation


@pytest.mark.unit
def test_available_qty_normal():
    loc = StockLocation(sku="SKU001", branch="HQ", qty_on_hand=10, committed_qty=3)
    assert loc.available_qty == 7


@pytest.mark.unit
def test_available_qty_no_negative():
    """Available should never go below zero even if committed exceeds on-hand."""
    loc = StockLocation(sku="SKU001", branch="HQ", qty_on_hand=2, committed_qty=5)
    assert loc.available_qty == 0


@pytest.mark.unit
def test_available_qty_zero_committed():
    loc = StockLocation(sku="SKU001", branch="HQ", qty_on_hand=8, committed_qty=0)
    assert loc.available_qty == 8


@pytest.mark.unit
def test_available_qty_none_values():
    """None values default to 0."""
    loc = StockLocation(sku="SKU001", branch="HQ", qty_on_hand=None, committed_qty=None)
    assert loc.available_qty == 0
```

- [ ] **Step 2: Run tests — expect PASS (models already implemented in Task 2)**

```bash
cd backend
python -m pytest tests/unit/test_stock_pricing.py -v --no-cov
```

Expected: `4 passed`

- [ ] **Step 3: Commit**

```bash
git add backend/tests/unit/test_stock_pricing.py
git commit -m "test: unit tests for StockLocation.available_qty"
```

---

## Task 4: Integration Tests (TDD — write RED tests first)

**Files:**
- Create: `backend/tests/integration/test_stock_module.py`

- [ ] **Step 1: Write the integration tests**

```python
# backend/tests/integration/test_stock_module.py
import pytest
from app.models.job import Job, JobItem
from app.models.inventory import StockMovement


@pytest.mark.integration
def test_list_locations_empty(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.get("/inventory/SKU001/locations")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.integration
def test_create_location(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.post("/inventory/SKU001/locations", json={"branch": "HQ", "qty_on_hand": 10})
    assert resp.status_code == 200
    data = resp.json()
    assert data["branch"] == "HQ"
    assert data["qty_on_hand"] == 10
    assert data["available_qty"] == 10


@pytest.mark.integration
def test_create_duplicate_location_fails(client, make_inventory):
    make_inventory(sku="SKU001")
    client.post("/inventory/SKU001/locations", json={"branch": "HQ", "qty_on_hand": 5})
    resp = client.post("/inventory/SKU001/locations", json={"branch": "HQ", "qty_on_hand": 3})
    assert resp.status_code == 409


@pytest.mark.integration
def test_list_locations(client, make_inventory):
    make_inventory(sku="SKU001")
    client.post("/inventory/SKU001/locations", json={"branch": "HQ", "qty_on_hand": 5})
    client.post("/inventory/SKU001/locations", json={"branch": "MELB", "qty_on_hand": 3})
    resp = client.get("/inventory/SKU001/locations")
    assert resp.status_code == 200
    branches = [r["branch"] for r in resp.json()]
    assert "HQ" in branches
    assert "MELB" in branches


@pytest.mark.integration
def test_update_location_bin(client, make_inventory):
    make_inventory(sku="SKU001")
    client.post("/inventory/SKU001/locations", json={"branch": "HQ", "qty_on_hand": 5})
    resp = client.patch("/inventory/SKU001/locations/HQ", json={"primary_bin_1": "Shelf-A1"})
    assert resp.status_code == 200
    assert resp.json()["primary_bin_1"] == "Shelf-A1"


@pytest.mark.integration
def test_delete_location(client, make_inventory):
    make_inventory(sku="SKU001")
    client.post("/inventory/SKU001/locations", json={"branch": "HQ", "qty_on_hand": 5})
    resp = client.delete("/inventory/SKU001/locations/HQ")
    assert resp.status_code == 200
    assert client.get("/inventory/SKU001/locations").json() == []


@pytest.mark.integration
def test_get_pricing_empty(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.get("/inventory/SKU001/pricing")
    assert resp.status_code == 200
    data = resp.json()
    assert "price_levels" in data
    assert data["price_levels"] == []


@pytest.mark.integration
def test_create_price_level_with_breakpoints(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.post("/inventory/SKU001/pricing/levels", json={
        "price_level": "1-Price A",
        "currency": "AUD",
        "tax_code": "G",
        "breakpoints": [{"min_qty": 0, "price_ex": 55.00, "price_inc": 60.50}],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["price_level"] == "1-Price A"
    assert len(data["breakpoints"]) == 1
    assert float(data["breakpoints"][0]["price_ex"]) == pytest.approx(55.00)


@pytest.mark.integration
def test_create_duplicate_price_level_fails(client, make_inventory):
    make_inventory(sku="SKU001")
    client.post("/inventory/SKU001/pricing/levels", json={"price_level": "1-Price A", "breakpoints": []})
    resp = client.post("/inventory/SKU001/pricing/levels", json={"price_level": "1-Price A", "breakpoints": []})
    assert resp.status_code == 409


@pytest.mark.integration
def test_get_pricing_with_levels(client, make_inventory):
    make_inventory(sku="SKU001", unit_cost=30.12)
    client.post("/inventory/SKU001/pricing/levels", json={
        "price_level": "1-Price A",
        "breakpoints": [{"min_qty": 0, "price_ex": 55.00, "price_inc": 60.50}],
    })
    resp = client.get("/inventory/SKU001/pricing")
    assert resp.status_code == 200
    assert len(resp.json()["price_levels"]) == 1


@pytest.mark.integration
def test_delete_price_level(client, make_inventory):
    make_inventory(sku="SKU001")
    create_resp = client.post("/inventory/SKU001/pricing/levels", json={"price_level": "1-Price A", "breakpoints": []})
    level_id = create_resp.json()["id"]
    resp = client.delete(f"/inventory/SKU001/pricing/levels/{level_id}")
    assert resp.status_code == 200
    assert client.get("/inventory/SKU001/pricing").json()["price_levels"] == []


@pytest.mark.integration
def test_update_cost_tracking(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.put("/inventory/SKU001/pricing/cost", json={"last_cost": 30.12, "avg_cost": 30.12})
    assert resp.status_code == 200
    pricing = client.get("/inventory/SKU001/pricing").json()
    assert float(pricing["last_cost"]) == pytest.approx(30.12)


@pytest.mark.integration
def test_transactions_empty(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.get("/inventory/SKU001/transactions")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.integration
def test_transactions_with_job_fk(client, make_inventory, make_customer, db):
    make_inventory(sku="SKU001")
    make_customer(id="CUST001")
    job = Job(id="J001", customer_id="CUST001", customer_name="Test Customer", status="ORDER")
    db.add(job)
    db.commit()
    mv = StockMovement(sku="SKU001", date="10/06/2026", type="Sale", quantity=-2, job_id="J001")
    db.add(mv)
    db.commit()
    resp = client.get("/inventory/SKU001/transactions")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["job_id"] == "J001"
    assert rows[0]["quantity"] == -2


@pytest.mark.integration
def test_committed_empty(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.get("/inventory/SKU001/committed")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.integration
def test_committed_from_job_items(client, make_inventory, make_customer, db):
    make_inventory(sku="SKU001")
    make_customer(id="CUST001")
    job = Job(id="J002", customer_id="CUST001", customer_name="Test Customer", status="ORDER")
    db.add(job)
    db.commit()
    item = JobItem(job_id="J002", stock_code="SKU001", order_qty=5, price_ex=58.00, price_inc=63.80, total=319.00)
    db.add(item)
    db.commit()
    resp = client.get("/inventory/SKU001/committed")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["job_id"] == "J002"
    assert rows[0]["qty"] == 5
    assert float(rows[0]["total_aud"]) == pytest.approx(319.00)


@pytest.mark.integration
def test_committed_excludes_paid_jobs(client, make_inventory, make_customer, db):
    make_inventory(sku="SKU001")
    make_customer(id="CUST001")
    job = Job(id="J003", customer_id="CUST001", customer_name="Test Customer", status="PAID")
    db.add(job)
    db.commit()
    item = JobItem(job_id="J003", stock_code="SKU001", order_qty=3)
    db.add(item)
    db.commit()
    resp = client.get("/inventory/SKU001/committed")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.integration
def test_inventory_update_new_detail_fields(client, make_inventory):
    make_inventory(sku="SKU001")
    resp = client.patch("/inventory/SKU001", json={
        "item_type": "Non-Depleting",
        "gl_group": "TIG - Apparel - Local",
        "barcode": "9325705135978",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["item_type"] == "Non-Depleting"
    assert data["gl_group"] == "TIG - Apparel - Local"
    assert data["barcode"] == "9325705135978"
```

- [ ] **Step 2: Run tests — expect FAIL (endpoints not implemented yet)**

```bash
cd backend
python -m pytest tests/integration/test_stock_module.py -v --no-cov 2>&1 | tail -10
```

Expected: Most tests fail with 404 or 405.

- [ ] **Step 3: Commit the failing tests**

```bash
git add backend/tests/integration/test_stock_module.py
git commit -m "test: integration tests for stock module endpoints (RED)"
```

---

## Task 5: Backend — Locations API

**Files:**
- Modify: `backend/app/routers/inventory.py`

- [ ] **Step 1: Add Pydantic schemas for locations to `backend/app/routers/inventory.py`**

After the existing `StocktakeRequest` schema (around line 66), add:

```python
class LocationCreate(BaseModel):
    branch: str
    zone: Optional[str] = None
    qty_on_hand: int = 0
    committed_qty: int = 0
    backorder_qty: int = 0
    on_po_qty: int = 0
    primary_bin_1: Optional[str] = None
    max_qty_bin_1: Optional[int] = None
    primary_bin_2: Optional[str] = None
    max_qty_bin_2: Optional[int] = None


class LocationUpdate(BaseModel):
    zone: Optional[str] = None
    qty_on_hand: Optional[int] = None
    committed_qty: Optional[int] = None
    backorder_qty: Optional[int] = None
    on_po_qty: Optional[int] = None
    primary_bin_1: Optional[str] = None
    max_qty_bin_1: Optional[int] = None
    primary_bin_2: Optional[str] = None
    max_qty_bin_2: Optional[int] = None
```

- [ ] **Step 2: Add location endpoints to `backend/app/routers/inventory.py`**

Add these four endpoints before the `@router.post("/transfer")` endpoint:

```python
@router.get("/{sku}/locations")
def get_locations(sku: str, db: Session = Depends(get_db), _: User = Depends(require_any)):
    from app.models.stock_location import StockLocation
    if not db.query(InventoryItem).filter(InventoryItem.sku == sku).first():
        raise HTTPException(status_code=404, detail="Item not found")
    locs = db.query(StockLocation).filter(StockLocation.sku == sku).order_by(StockLocation.branch).all()
    return [
        {
            "id": loc.id, "sku": loc.sku, "branch": loc.branch, "zone": loc.zone,
            "qty_on_hand": loc.qty_on_hand, "committed_qty": loc.committed_qty,
            "available_qty": loc.available_qty, "backorder_qty": loc.backorder_qty,
            "on_po_qty": loc.on_po_qty, "primary_bin_1": loc.primary_bin_1,
            "max_qty_bin_1": loc.max_qty_bin_1, "primary_bin_2": loc.primary_bin_2,
            "max_qty_bin_2": loc.max_qty_bin_2,
        }
        for loc in locs
    ]


@router.post("/{sku}/locations")
def add_location(sku: str, body: LocationCreate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    from app.models.stock_location import StockLocation
    if not db.query(InventoryItem).filter(InventoryItem.sku == sku).first():
        raise HTTPException(status_code=404, detail="Item not found")
    if db.query(StockLocation).filter(StockLocation.sku == sku, StockLocation.branch == body.branch).first():
        raise HTTPException(status_code=409, detail=f"Location '{body.branch}' already exists for this SKU")
    loc = StockLocation(sku=sku, **body.model_dump())
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return {
        "id": loc.id, "sku": loc.sku, "branch": loc.branch, "zone": loc.zone,
        "qty_on_hand": loc.qty_on_hand, "committed_qty": loc.committed_qty,
        "available_qty": loc.available_qty, "backorder_qty": loc.backorder_qty,
        "on_po_qty": loc.on_po_qty, "primary_bin_1": loc.primary_bin_1,
        "max_qty_bin_1": loc.max_qty_bin_1, "primary_bin_2": loc.primary_bin_2,
        "max_qty_bin_2": loc.max_qty_bin_2,
    }


@router.patch("/{sku}/locations/{branch}")
def update_location(sku: str, branch: str, body: LocationUpdate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    from app.models.stock_location import StockLocation
    loc = db.query(StockLocation).filter(StockLocation.sku == sku, StockLocation.branch == branch).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(loc, field, value)
    db.commit()
    db.refresh(loc)
    return {
        "id": loc.id, "sku": loc.sku, "branch": loc.branch, "zone": loc.zone,
        "qty_on_hand": loc.qty_on_hand, "committed_qty": loc.committed_qty,
        "available_qty": loc.available_qty, "backorder_qty": loc.backorder_qty,
        "on_po_qty": loc.on_po_qty, "primary_bin_1": loc.primary_bin_1,
        "max_qty_bin_1": loc.max_qty_bin_1, "primary_bin_2": loc.primary_bin_2,
        "max_qty_bin_2": loc.max_qty_bin_2,
    }


@router.delete("/{sku}/locations/{branch}")
def delete_location(sku: str, branch: str, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    from app.models.stock_location import StockLocation
    loc = db.query(StockLocation).filter(StockLocation.sku == sku, StockLocation.branch == branch).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    db.delete(loc)
    db.commit()
    return {"ok": True}
```

- [ ] **Step 3: Run location tests — expect PASS**

```bash
cd backend
python -m pytest tests/integration/test_stock_module.py -k "location" -v --no-cov
```

Expected: `6 passed`

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/inventory.py
git commit -m "feat: stock locations CRUD — GET/POST /inventory/{sku}/locations, PATCH/DELETE /{sku}/locations/{branch}"
```

---

## Task 6: Backend — Pricing API

**Files:**
- Modify: `backend/app/routers/inventory.py`

- [ ] **Step 1: Add Pydantic schemas for pricing**

After the `LocationUpdate` schema, add:

```python
class PriceBreakpointIn(BaseModel):
    min_qty: int = 0
    price_ex: float
    price_inc: float
    pont_pct: Optional[float] = None


class PriceLevelCreate(BaseModel):
    price_level: str
    price_calc_method: str = "Fixed Price"
    base_pl: Optional[str] = None
    currency: str = "AUD"
    tax_code: str = "G"
    breakpoints: List[PriceBreakpointIn] = []


class CostUpdate(BaseModel):
    last_cost: Optional[float] = None
    last_cog: Optional[float] = None
    avg_cost: Optional[float] = None
    avg_cog: Optional[float] = None
    max_cog: Optional[float] = None
    last_po_cogs: Optional[float] = None
    avg_po_cogs: Optional[float] = None
    last_ex: Optional[float] = None
    last_effective_date: Optional[str] = None
    price_template: Optional[str] = None
```

Also add `List` to the existing import at the top: `from typing import Optional, List`

- [ ] **Step 2: Add pricing endpoints**

Add these five endpoints before `@router.post("/transfer")`:

```python
@router.get("/{sku}/pricing")
def get_pricing(sku: str, db: Session = Depends(get_db), _: User = Depends(require_any)):
    from app.models.stock_pricing import StockPriceLevel
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    levels = (
        db.query(StockPriceLevel)
        .options(joinedload(StockPriceLevel.breakpoints))
        .filter(StockPriceLevel.sku == sku)
        .all()
    )
    return {
        "last_cost": float(item.last_cost) if item.last_cost is not None else None,
        "last_cog": float(item.last_cog) if item.last_cog is not None else None,
        "avg_cost": float(item.avg_cost) if item.avg_cost is not None else None,
        "avg_cog": float(item.avg_cog) if item.avg_cog is not None else None,
        "max_cog": float(item.max_cog) if item.max_cog is not None else None,
        "last_po_cogs": float(item.last_po_cogs) if item.last_po_cogs is not None else None,
        "avg_po_cogs": float(item.avg_po_cogs) if item.avg_po_cogs is not None else None,
        "last_ex": float(item.last_ex) if item.last_ex is not None else None,
        "last_effective_date": item.last_effective_date,
        "price_template": item.price_template,
        "price_levels": [
            {
                "id": pl.id,
                "price_level": pl.price_level,
                "price_calc_method": pl.price_calc_method,
                "base_pl": pl.base_pl,
                "currency": pl.currency,
                "tax_code": pl.tax_code,
                "breakpoints": [
                    {
                        "id": bp.id,
                        "min_qty": bp.min_qty,
                        "price_ex": float(bp.price_ex),
                        "price_inc": float(bp.price_inc),
                        "pont_pct": float(bp.pont_pct) if bp.pont_pct is not None else None,
                    }
                    for bp in pl.breakpoints
                ],
            }
            for pl in levels
        ],
    }


@router.put("/{sku}/pricing/cost")
def update_cost(sku: str, body: CostUpdate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    db.commit()
    return {"ok": True}


@router.post("/{sku}/pricing/levels")
def add_price_level(sku: str, body: PriceLevelCreate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    from app.models.stock_pricing import StockPriceLevel, StockPriceBreakpoint
    if not db.query(InventoryItem).filter(InventoryItem.sku == sku).first():
        raise HTTPException(status_code=404, detail="Item not found")
    if db.query(StockPriceLevel).filter(StockPriceLevel.sku == sku, StockPriceLevel.price_level == body.price_level).first():
        raise HTTPException(status_code=409, detail=f"Price level '{body.price_level}' already exists for this SKU")
    level = StockPriceLevel(
        sku=sku,
        price_level=body.price_level,
        price_calc_method=body.price_calc_method,
        base_pl=body.base_pl,
        currency=body.currency,
        tax_code=body.tax_code,
    )
    for bp in body.breakpoints:
        level.breakpoints.append(StockPriceBreakpoint(**bp.model_dump()))
    db.add(level)
    db.commit()
    db.refresh(level)
    return {
        "id": level.id,
        "price_level": level.price_level,
        "price_calc_method": level.price_calc_method,
        "currency": level.currency,
        "tax_code": level.tax_code,
        "breakpoints": [
            {"id": bp.id, "min_qty": bp.min_qty, "price_ex": float(bp.price_ex), "price_inc": float(bp.price_inc)}
            for bp in level.breakpoints
        ],
    }


@router.put("/{sku}/pricing/levels/{level_id}")
def update_price_level(sku: str, level_id: int, body: PriceLevelCreate, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    from app.models.stock_pricing import StockPriceLevel, StockPriceBreakpoint
    level = db.query(StockPriceLevel).filter(StockPriceLevel.id == level_id, StockPriceLevel.sku == sku).first()
    if not level:
        raise HTTPException(status_code=404, detail="Price level not found")
    level.price_level = body.price_level
    level.price_calc_method = body.price_calc_method
    level.base_pl = body.base_pl
    level.currency = body.currency
    level.tax_code = body.tax_code
    for bp in list(level.breakpoints):
        db.delete(bp)
    db.flush()
    level.breakpoints = [StockPriceBreakpoint(**bp.model_dump()) for bp in body.breakpoints]
    db.commit()
    db.refresh(level)
    return {
        "id": level.id,
        "price_level": level.price_level,
        "breakpoints": [
            {"id": bp.id, "min_qty": bp.min_qty, "price_ex": float(bp.price_ex), "price_inc": float(bp.price_inc)}
            for bp in level.breakpoints
        ],
    }


@router.delete("/{sku}/pricing/levels/{level_id}")
def delete_price_level(sku: str, level_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    from app.models.stock_pricing import StockPriceLevel
    level = db.query(StockPriceLevel).filter(StockPriceLevel.id == level_id, StockPriceLevel.sku == sku).first()
    if not level:
        raise HTTPException(status_code=404, detail="Price level not found")
    db.delete(level)
    db.commit()
    return {"ok": True}
```

Note: `joinedload` is already imported at the top of `inventory.py` (`from sqlalchemy.orm import Session, joinedload`).

- [ ] **Step 3: Run pricing tests — expect PASS**

```bash
cd backend
python -m pytest tests/integration/test_stock_module.py -k "pricing or price or cost" -v --no-cov
```

Expected: `6 passed`

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/inventory.py
git commit -m "feat: stock pricing API — GET/PUT cost tracking, POST/PUT/DELETE price levels with breakpoints"
```

---

## Task 7: Backend — Transactions, Committed, and extend PATCH

**Files:**
- Modify: `backend/app/routers/inventory.py`

- [ ] **Step 1: Add transactions endpoint**

Add before `@router.post("/transfer")`:

```python
@router.get("/{sku}/transactions")
def get_transactions(
    sku: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_any),
):
    if not db.query(InventoryItem).filter(InventoryItem.sku == sku).first():
        raise HTTPException(status_code=404, detail="Item not found")
    movements = (
        db.query(StockMovement)
        .filter(StockMovement.sku == sku)
        .order_by(StockMovement.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": m.id,
            "date": m.date,
            "type": m.type,
            "reference": m.reference,
            "location_branch": m.location_branch,
            "quantity": m.quantity,
            "qty_bal": m.qty_bal,
            "po_id": m.po_id,
            "po_line": m.po_line,
            "job_id": m.job_id,
            "pack_num": m.pack_num,
            "bin": m.bin,
            "notes": m.notes,
        }
        for m in movements
    ]
```

- [ ] **Step 2: Add committed endpoint**

Add before `@router.post("/transfer")`:

```python
@router.get("/{sku}/committed")
def get_committed(sku: str, db: Session = Depends(get_db), _: User = Depends(require_any)):
    from app.models.job import Job, JobItem
    if not db.query(InventoryItem).filter(InventoryItem.sku == sku).first():
        raise HTTPException(status_code=404, detail="Item not found")
    rows = (
        db.query(JobItem, Job)
        .join(Job, JobItem.job_id == Job.id)
        .filter(
            JobItem.stock_code == sku,
            Job.status.notin_(["PAID", "CANCEL"]),
        )
        .all()
    )
    return [
        {
            "card_code": job.customer_id,
            "customer_name": job.customer_name,
            "job_id": job.id,
            "job_ref": job.id,
            "date": job.date_in,
            "location_branch": job.branch,
            "qty": item_.order_qty,
            "unit": "UNIT",
            "price_ex": float(item_.price_ex) if item_.price_ex is not None else None,
            "price_inc": float(item_.price_inc) if item_.price_inc is not None else None,
            "currency": "AUD",
            "total_aud": float(item_.total) if item_.total is not None else None,
        }
        for item_, job in rows
    ]
```

- [ ] **Step 3: Extend `InventoryUpdate` schema with new detail fields**

Find the existing `InventoryUpdate` class and replace it with:

```python
class InventoryUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    supplier: Optional[str] = None
    min_stock: Optional[int] = None
    reorder_qty: Optional[int] = None
    unit_cost: Optional[float] = None
    sell_price: Optional[float] = None
    location: Optional[str] = None
    status: Optional[str] = None
    # Jim2 detail fields
    item_type: Optional[str] = None
    gl_group: Optional[str] = None
    barcode: Optional[str] = None
    buy_unit: Optional[str] = None
    sell_unit: Optional[str] = None
    buy_tax_pct: Optional[float] = None
    sell_tax_pct: Optional[float] = None
```

- [ ] **Step 4: Run all stock module tests — expect PASS**

```bash
cd backend
python -m pytest tests/integration/test_stock_module.py tests/unit/test_stock_pricing.py -v --no-cov
```

Expected: `23 passed` (or similar — all tests in both files)

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd backend
python -m pytest --no-cov -q
```

Expected: All tests pass (134+ passed, 0 failed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/inventory.py
git commit -m "feat: stock transactions + committed endpoints; extend PATCH /inventory/{sku} with Jim2 detail fields"
```

---

## Task 8: Frontend api.js — Extend normalizeInventory + add stock export

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Extend `normalizeInventory` to pass through new fields**

Find `normalizeInventory` (around line 150) and replace it with:

```js
function normalizeInventory(i) {
  return {
    sku: i.sku,
    name: i.name,
    category: i.category,
    supplier: i.supplier,
    stock: i.stock ?? 0,
    committed_qty: i.committed_qty ?? 0,
    on_order_qty: i.on_order_qty ?? 0,
    weight_kg: parseFloat(i.weight_kg ?? 0),
    reorderLevel: i.min_stock ?? i.reorderLevel ?? 0,
    unitCost: parseFloat(i.unit_cost ?? i.unitCost ?? 0),
    unitPrice: parseFloat(i.sell_price ?? i.unitPrice ?? 0),
    location: i.location,
    status: i.status,
    // Jim2 detail fields
    item_type: i.item_type ?? 'Depleting',
    gl_group: i.gl_group ?? null,
    barcode: i.barcode ?? null,
    buy_unit: i.buy_unit ?? null,
    sell_unit: i.sell_unit ?? null,
    buy_tax_pct: i.buy_tax_pct ?? 10,
    sell_tax_pct: i.sell_tax_pct ?? 10,
    min_stock: i.min_stock ?? 0,
  };
}
```

Also extend `inventory.update` to include new detail fields. Find the `update` method and replace the body object with:

```js
  update: (sku, data) => request(`/inventory/${sku}`, { method: 'PATCH', body: {
    name: data.name,
    category: data.category,
    supplier: data.supplier,
    min_stock: data.reorderLevel ?? data.min_stock,
    unit_cost: data.unitCost,
    sell_price: data.unitPrice,
    location: data.location,
    status: data.status,
    item_type: data.item_type,
    gl_group: data.gl_group,
    barcode: data.barcode,
    buy_unit: data.buy_unit,
    sell_unit: data.sell_unit,
    buy_tax_pct: data.buy_tax_pct,
    sell_tax_pct: data.sell_tax_pct,
  }}).then(normalizeInventory),
```

- [ ] **Step 2: Add the `stock` export after the `inventory` export**

After the closing `};` of the `inventory` export, add:

```js
export const stock = {
  locations: (sku) =>
    request(`/inventory/${encodeURIComponent(sku)}/locations`),

  addLocation: (sku, data) =>
    request(`/inventory/${encodeURIComponent(sku)}/locations`, { method: 'POST', body: data }),

  updateLocation: (sku, branch, data) =>
    request(`/inventory/${encodeURIComponent(sku)}/locations/${encodeURIComponent(branch)}`, { method: 'PATCH', body: data }),

  deleteLocation: (sku, branch) =>
    request(`/inventory/${encodeURIComponent(sku)}/locations/${encodeURIComponent(branch)}`, { method: 'DELETE' }),

  pricing: (sku) =>
    request(`/inventory/${encodeURIComponent(sku)}/pricing`),

  updateCost: (sku, data) =>
    request(`/inventory/${encodeURIComponent(sku)}/pricing/cost`, { method: 'PUT', body: data }),

  addPriceLevel: (sku, data) =>
    request(`/inventory/${encodeURIComponent(sku)}/pricing/levels`, { method: 'POST', body: data }),

  updatePriceLevel: (sku, id, data) =>
    request(`/inventory/${encodeURIComponent(sku)}/pricing/levels/${id}`, { method: 'PUT', body: data }),

  deletePriceLevel: (sku, id) =>
    request(`/inventory/${encodeURIComponent(sku)}/pricing/levels/${id}`, { method: 'DELETE' }),

  transactions: (sku, params = {}) =>
    request(`/inventory/${encodeURIComponent(sku)}/transactions?limit=${params.limit || 100}&offset=${params.offset || 0}`),

  committed: (sku) =>
    request(`/inventory/${encodeURIComponent(sku)}/committed`),
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: api.js — extend normalizeInventory with Jim2 fields; add stock export for locations/pricing/transactions/committed"
```

---

## Task 9: StockList + StockModule

**Files:**
- Create: `frontend/src/components/stock/StockList.jsx`
- Create: `frontend/src/components/stock/StockModule.jsx`

- [ ] **Step 1: Create `frontend/src/components/stock/StockList.jsx`**

```jsx
import { useState, useMemo } from 'react';

const STATUS_COLOR = { OK: '#10b981', LOW: '#f59e0b', OUT: '#ef4444' };

function stockStatus(item) {
  if ((item.stock || 0) <= 0) return 'OUT';
  if ((item.stock || 0) < (item.reorderLevel || item.min_stock || 0)) return 'LOW';
  return 'OK';
}

export default function StockList({ items, selectedSku, onSelect }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(item => {
      const matchSearch = !q ||
        (item.sku || '').toLowerCase().includes(q) ||
        (item.name || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q) ||
        (item.supplier || '').toLowerCase().includes(q);
      const status = stockStatus(item);
      const matchFilter = filter === 'all' ||
        (filter === 'low' && status === 'LOW') ||
        (filter === 'out' && status === 'OUT');
      return matchSearch && matchFilter;
    });
  }, [items, search, filter]);

  return (
    <div style={{ width: 300, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: 0 }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search SKU, name, supplier…"
          style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {[['all', 'All'], ['low', 'Low Stock'], ['out', 'Out']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              style={{
                padding: '2px 8px', borderRadius: 999, fontSize: 11, border: 'none', cursor: 'pointer',
                background: filter === val ? '#3b82f6' : '#f1f5f9',
                color: filter === val ? '#fff' : '#64748b',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 16, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>No items found</div>
        )}
        {filtered.map(item => {
          const status = stockStatus(item);
          const selected = item.sku === selectedSku;
          return (
            <div
              key={item.sku}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item.sku)}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect(item.sku)}
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid #e2e8f0',
                cursor: 'pointer',
                background: selected ? '#eff6ff' : '#fff',
                borderLeft: selected ? '3px solid #3b82f6' : '3px solid transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 11 }}>{item.sku}</div>
                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ color: '#94a3b8', fontSize: 10 }}>{item.category || '—'}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                  <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 12 }}>{item.stock ?? 0}</div>
                  <div style={{ fontSize: 10, color: STATUS_COLOR[status], fontWeight: 600 }}>{status}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/stock/StockModule.jsx`**

```jsx
import { useState } from 'react';
import StockList from './StockList';
import StockDetailPanel from './StockDetailPanel';

export default function StockModule({ inventory, onNavigateJob, onNavigatePO }) {
  const [selectedSku, setSelectedSku] = useState(null);
  const selectedItem = inventory.find(i => i.sku === selectedSku) ?? null;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 112px)', overflow: 'hidden', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
      <StockList items={inventory} selectedSku={selectedSku} onSelect={setSelectedSku} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {selectedItem ? (
          <StockDetailPanel item={selectedItem} onNavigateJob={onNavigateJob} onNavigatePO={onNavigatePO} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 13 }}>
            Select a stock item to view details
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/stock/StockList.jsx frontend/src/components/stock/StockModule.jsx
git commit -m "feat: StockList + StockModule — master/detail layout with search, status filter, selection"
```

---

## Task 10: StockDetailPanel + StockDetailsTab

**Files:**
- Create: `frontend/src/components/stock/StockDetailPanel.jsx`
- Create: `frontend/src/components/stock/tabs/StockDetailsTab.jsx`

- [ ] **Step 1: Create `frontend/src/components/stock/tabs/StockDetailsTab.jsx`**

```jsx
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '../../../api';

function Field({ label, value }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 6, padding: 10 }}>
      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{value || '—'}</div>
    </div>
  );
}

export default function StockDetailsTab({ item }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    item_type: item.item_type || 'Depleting',
    gl_group: item.gl_group || '',
    barcode: item.barcode || '',
    buy_unit: item.buy_unit || '',
    sell_unit: item.sell_unit || '',
    buy_tax_pct: item.buy_tax_pct ?? 10,
    sell_tax_pct: item.sell_tax_pct ?? 10,
  });
  const [saving, setSaving] = useState(false);

  const totalOnHand = item.stock ?? 0;
  const totalCommitted = item.committed_qty ?? 0;
  const totalAvailable = Math.max(0, totalOnHand - totalCommitted);

  async function handleSave() {
    setSaving(true);
    try {
      await api.inventory.update(item.sku, { ...item, ...form });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            ['Item Type', 'item_type'],
            ['GL Group', 'gl_group'],
            ['Barcode', 'barcode'],
            ['Buy Unit', 'buy_unit'],
            ['Sell Unit', 'sell_unit'],
          ].map(([label, key]) => (
            <div key={key}>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase' }}>{label}</div>
              <input
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} disabled={saving} style={{ padding: '6px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} style={{ padding: '6px 16px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={() => setEditing(true)} style={{ padding: '4px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, color: '#64748b', cursor: 'pointer' }}>
          Edit
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <Field label="Code" value={item.sku} />
        <Field label="Type" value={item.item_type || 'Depleting'} />
        <div style={{ gridColumn: 'span 2' }}><Field label="Description" value={item.name} /></div>
        <Field label="GL Group" value={item.gl_group} />
        <Field label="Barcode" value={item.barcode} />
        <Field label="Buy Unit" value={item.buy_unit ? `${item.buy_unit} (${item.buy_tax_pct ?? 10}% GST)` : null} />
        <Field label="Sell Unit" value={item.sell_unit ? `${item.sell_unit} (${item.sell_tax_pct ?? 10}% GST)` : null} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {[
          { label: 'On Hand', value: totalOnHand, bg: '#eff6ff', color: '#3b82f6' },
          { label: 'Committed', value: totalCommitted, bg: '#fef9c3', color: '#ca8a04' },
          { label: 'Available', value: totalAvailable, bg: '#f0fdf4', color: '#16a34a' },
          { label: 'Backorder', value: item.b_ord ?? 0, bg: '#fff1f2', color: '#e11d48' },
          { label: 'On PO', value: item.on_order_qty ?? 0, bg: '#f5f3ff', color: '#7c3aed' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 6, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: k.color, marginBottom: 2 }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{k.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/stock/StockDetailPanel.jsx`**

```jsx
import { useState } from 'react';
import StockDetailsTab from './tabs/StockDetailsTab';
import StockLocationsTab from './tabs/StockLocationsTab';
import StockPricingTab from './tabs/StockPricingTab';
import StockTransactionsTab from './tabs/StockTransactionsTab';
import StockCommittedTab from './tabs/StockCommittedTab';

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'locations', label: 'Locations' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'committed', label: 'Committed' },
];

export default function StockDetailPanel({ item, onNavigateJob, onNavigatePO }) {
  const [activeTab, setActiveTab] = useState('details');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 14 }}>{item.sku}</div>
        <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
          {item.name} · {item.item_type || 'Depleting'} · {item.gl_group || item.category || '—'}
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 16px', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 12px', fontSize: 11,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? '#3b82f6' : '#64748b',
              borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
              border: 'none', background: 'none', cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'details' && <StockDetailsTab item={item} />}
        {activeTab === 'locations' && <StockLocationsTab sku={item.sku} />}
        {activeTab === 'pricing' && <StockPricingTab sku={item.sku} />}
        {activeTab === 'transactions' && <StockTransactionsTab sku={item.sku} onNavigateJob={onNavigateJob} onNavigatePO={onNavigatePO} />}
        {activeTab === 'committed' && <StockCommittedTab sku={item.sku} onNavigateJob={onNavigateJob} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/stock/StockDetailPanel.jsx frontend/src/components/stock/tabs/StockDetailsTab.jsx
git commit -m "feat: StockDetailPanel with 5 tabs; StockDetailsTab with qty strip and inline edit"
```

---

## Task 11: StockLocationsTab + StockPricingTab

**Files:**
- Create: `frontend/src/components/stock/tabs/StockLocationsTab.jsx`
- Create: `frontend/src/components/stock/tabs/StockPricingTab.jsx`

- [ ] **Step 1: Create `frontend/src/components/stock/tabs/StockLocationsTab.jsx`**

```jsx
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../../api';

export default function StockLocationsTab({ sku }) {
  const queryClient = useQueryClient();
  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['stock-locations', sku],
    queryFn: () => api.stock.locations(sku),
  });
  const [adding, setAdding] = useState(false);
  const [newBranch, setNewBranch] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!newBranch.trim()) return;
    setSaving(true);
    try {
      await api.stock.addLocation(sku, { branch: newBranch.trim(), qty_on_hand: 0 });
      queryClient.invalidateQueries({ queryKey: ['stock-locations', sku] });
      setAdding(false);
      setNewBranch('');
    } finally {
      setSaving(false);
    }
  }

  async function handleBinBlur(branch, field, value) {
    await api.stock.updateLocation(sku, branch, { [field]: value || null });
    queryClient.invalidateQueries({ queryKey: ['stock-locations', sku] });
  }

  async function handleDelete(branch) {
    await api.stock.deleteLocation(sku, branch);
    queryClient.invalidateQueries({ queryKey: ['stock-locations', sku] });
  }

  if (isLoading) return <div style={{ padding: 16, color: '#94a3b8', fontSize: 12 }}>Loading…</div>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Branch', 'Zone', 'On Hand', 'Committed', 'Available', 'Backorder', 'On PO', 'Bin 1', 'Max', 'Bin 2', 'Max', ''].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: '#94a3b8', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locations.map(loc => (
              <tr key={loc.branch} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1e293b' }}>{loc.branch}</td>
                <td style={{ padding: '6px 8px', color: '#64748b' }}>{loc.zone || '—'}</td>
                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{loc.qty_on_hand}</td>
                <td style={{ padding: '6px 8px', color: '#ca8a04' }}>{loc.committed_qty}</td>
                <td style={{ padding: '6px 8px', color: '#16a34a', fontWeight: 600 }}>{loc.available_qty}</td>
                <td style={{ padding: '6px 8px', color: '#e11d48' }}>{loc.backorder_qty}</td>
                <td style={{ padding: '6px 8px', color: '#7c3aed' }}>{loc.on_po_qty}</td>
                <td style={{ padding: '4px 6px' }}>
                  <input key={`b1-${loc.branch}`} defaultValue={loc.primary_bin_1 || ''} onBlur={e => handleBinBlur(loc.branch, 'primary_bin_1', e.target.value)}
                    style={{ width: 70, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11 }} />
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <input key={`m1-${loc.branch}`} type="number" defaultValue={loc.max_qty_bin_1 ?? ''} onBlur={e => handleBinBlur(loc.branch, 'max_qty_bin_1', e.target.value ? parseInt(e.target.value) : null)}
                    style={{ width: 45, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11 }} />
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <input key={`b2-${loc.branch}`} defaultValue={loc.primary_bin_2 || ''} onBlur={e => handleBinBlur(loc.branch, 'primary_bin_2', e.target.value)}
                    style={{ width: 70, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11 }} />
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <input key={`m2-${loc.branch}`} type="number" defaultValue={loc.max_qty_bin_2 ?? ''} onBlur={e => handleBinBlur(loc.branch, 'max_qty_bin_2', e.target.value ? parseInt(e.target.value) : null)}
                    style={{ width: 45, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11 }} />
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <button onClick={() => handleDelete(loc.branch)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <input value={newBranch} onChange={e => setNewBranch(e.target.value)} placeholder="Branch code (e.g. HQ)"
            style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12 }} />
          <button onClick={handleAdd} disabled={saving} style={{ padding: '5px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>
            {saving ? 'Adding…' : 'Add'}
          </button>
          <button onClick={() => setAdding(false)} style={{ padding: '5px 12px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ marginTop: 12, padding: '5px 12px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>
          + Add Branch
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/stock/tabs/StockPricingTab.jsx`**

```jsx
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../../api';

function CostField({ label, value }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 5, padding: '6px 10px' }}>
      <div style={{ fontSize: 10, color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
        {value != null ? `$${Number(value).toFixed(4)}` : '—'}
      </div>
    </div>
  );
}

const EMPTY_LEVEL = { price_level: '', currency: 'AUD', tax_code: 'G', price_calc_method: 'Fixed Price', breakpoints: [{ min_qty: 0, price_ex: '', price_inc: '' }] };

export default function StockPricingTab({ sku }) {
  const queryClient = useQueryClient();
  const { data: pricing, isLoading } = useQuery({
    queryKey: ['stock-pricing', sku],
    queryFn: () => api.stock.pricing(sku),
  });
  const [addingLevel, setAddingLevel] = useState(false);
  const [levelForm, setLevelForm] = useState(EMPTY_LEVEL);
  const [saving, setSaving] = useState(false);

  async function handleAddLevel() {
    setSaving(true);
    try {
      await api.stock.addPriceLevel(sku, {
        ...levelForm,
        breakpoints: levelForm.breakpoints.map(bp => ({
          ...bp,
          price_ex: parseFloat(bp.price_ex) || 0,
          price_inc: parseFloat(bp.price_inc) || 0,
        })),
      });
      queryClient.invalidateQueries({ queryKey: ['stock-pricing', sku] });
      setAddingLevel(false);
      setLevelForm(EMPTY_LEVEL);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLevel(levelId) {
    await api.stock.deletePriceLevel(sku, levelId);
    queryClient.invalidateQueries({ queryKey: ['stock-pricing', sku] });
  }

  function addBreakpointRow() {
    setLevelForm(f => ({ ...f, breakpoints: [...f.breakpoints, { min_qty: 0, price_ex: '', price_inc: '' }] }));
  }

  function updateBreakpoint(i, field, value) {
    setLevelForm(f => {
      const bps = [...f.breakpoints];
      bps[i] = { ...bps[i], [field]: value };
      return { ...f, breakpoints: bps };
    });
  }

  if (isLoading) return <div style={{ padding: 16, color: '#94a3b8', fontSize: 12 }}>Loading…</div>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cost Tracking</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          <CostField label="Last Cost" value={pricing?.last_cost} />
          <CostField label="Last COG" value={pricing?.last_cog} />
          <CostField label="Max COG" value={pricing?.max_cog} />
          <CostField label="Last PO COGS" value={pricing?.last_po_cogs} />
          <CostField label="Avg Cost" value={pricing?.avg_cost} />
          <CostField label="Avg COG" value={pricing?.avg_cog} />
          <CostField label="Avg PO COGS" value={pricing?.avg_po_cogs} />
          <CostField label="Last Ex." value={pricing?.last_ex} />
        </div>
        {(pricing?.last_effective_date || pricing?.price_template) && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
            {pricing.last_effective_date && `Last Effective: ${pricing.last_effective_date}`}
            {pricing.price_template && ` · Template: ${pricing.price_template}`}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Price Levels</div>
        {(pricing?.price_levels || []).map(level => (
          <div key={level.id} style={{ background: '#f8fafc', borderRadius: 6, padding: 12, marginBottom: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 12, color: '#1e293b' }}>{level.price_level}</span>
                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{level.price_calc_method} · {level.currency} · {level.tax_code}</span>
              </div>
              <button onClick={() => handleDeleteLevel(level.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>Remove</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  {['≥ Qty', 'Price Ex.', 'Price Inc.', 'Pont %'].map(h => (
                    <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: '#94a3b8', fontWeight: 600, fontSize: 10, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {level.breakpoints.map(bp => (
                  <tr key={bp.id}>
                    <td style={{ padding: '4px 8px', color: '#64748b' }}>{bp.min_qty}</td>
                    <td style={{ padding: '4px 8px', fontWeight: 600 }}>${Number(bp.price_ex).toFixed(2)}</td>
                    <td style={{ padding: '4px 8px', fontWeight: 600 }}>${Number(bp.price_inc).toFixed(2)}</td>
                    <td style={{ padding: '4px 8px', color: '#64748b' }}>{bp.pont_pct != null ? `${bp.pont_pct}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {!addingLevel ? (
          <button onClick={() => setAddingLevel(true)} style={{ padding: '5px 12px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>
            + Add Price Level
          </button>
        ) : (
          <div style={{ background: '#f8fafc', borderRadius: 6, padding: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
              {[['Level Name', 'price_level'], ['Currency', 'currency'], ['Tax Code', 'tax_code']].map(([label, key]) => (
                <div key={key}>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>{label}</div>
                  <input value={levelForm[key]} onChange={e => setLevelForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 6, fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Breakpoints</div>
            {levelForm.breakpoints.map((bp, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input type="number" placeholder="≥ Qty" value={bp.min_qty} onChange={e => updateBreakpoint(i, 'min_qty', parseInt(e.target.value) || 0)}
                  style={{ width: 60, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12 }} />
                <input type="number" step="0.01" placeholder="Price Ex." value={bp.price_ex} onChange={e => updateBreakpoint(i, 'price_ex', e.target.value)}
                  style={{ width: 80, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12 }} />
                <input type="number" step="0.01" placeholder="Price Inc." value={bp.price_inc} onChange={e => updateBreakpoint(i, 'price_inc', e.target.value)}
                  style={{ width: 80, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12 }} />
              </div>
            ))}
            <button onClick={addBreakpointRow} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 10, display: 'block' }}>
              + Add row
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleAddLevel} disabled={saving} style={{ padding: '5px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Save Level'}
              </button>
              <button onClick={() => setAddingLevel(false)} style={{ padding: '5px 12px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/stock/tabs/StockLocationsTab.jsx frontend/src/components/stock/tabs/StockPricingTab.jsx
git commit -m "feat: StockLocationsTab (branch grid with bin editing); StockPricingTab (cost tracking + price levels CRUD)"
```

---

## Task 12: StockTransactionsTab + StockCommittedTab

**Files:**
- Create: `frontend/src/components/stock/tabs/StockTransactionsTab.jsx`
- Create: `frontend/src/components/stock/tabs/StockCommittedTab.jsx`

- [ ] **Step 1: Create `frontend/src/components/stock/tabs/StockTransactionsTab.jsx`**

```jsx
import { useQuery } from '@tanstack/react-query';
import * as api from '../../../api';

const TYPE_COLOR = {
  'Sale': '#8b5cf6',
  'Purchase': '#10b981',
  'Adjustment': '#3b82f6',
  'Transfer In': '#0ea5e9',
  'Transfer Out': '#0ea5e9',
  'Stocktake': '#f59e0b',
  'Location Change': '#64748b',
};

export default function StockTransactionsTab({ sku, onNavigateJob, onNavigatePO }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['stock-transactions', sku],
    queryFn: () => api.stock.transactions(sku),
  });

  if (isLoading) return <div style={{ padding: 16, color: '#94a3b8', fontSize: 12 }}>Loading…</div>;
  if (rows.length === 0) return <div style={{ padding: 16, color: '#94a3b8', fontSize: 12 }}>No transactions recorded.</div>;

  return (
    <div style={{ padding: 16, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {['Tran#', 'Date', 'Type', 'Ref#', 'Loc', 'Qty', 'Qty Bal', 'PO#', 'Job#', 'Bin'].map(h => (
              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: '#94a3b8', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const tc = TYPE_COLOR[row.type] || '#64748b';
            return (
              <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '6px 8px', color: '#64748b' }}>{row.id}</td>
                <td style={{ padding: '6px 8px', color: '#64748b', whiteSpace: 'nowrap' }}>{row.date || '—'}</td>
                <td style={{ padding: '6px 8px' }}>
                  <span style={{ background: `${tc}20`, color: tc, padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{row.type}</span>
                </td>
                <td style={{ padding: '6px 8px', color: '#64748b' }}>{row.reference || '—'}</td>
                <td style={{ padding: '6px 8px', color: '#64748b' }}>{row.location_branch || '—'}</td>
                <td style={{ padding: '6px 8px', fontWeight: 600, color: (row.quantity || 0) < 0 ? '#ef4444' : '#10b981' }}>
                  {(row.quantity || 0) > 0 ? `+${row.quantity}` : row.quantity}
                </td>
                <td style={{ padding: '6px 8px', color: '#64748b' }}>{row.qty_bal ?? '—'}</td>
                <td style={{ padding: '6px 8px' }}>
                  {row.po_id
                    ? <button onClick={() => onNavigatePO(row.po_id)} style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>{row.po_id}</button>
                    : '—'}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  {row.job_id
                    ? <button onClick={() => onNavigateJob(row.job_id)} style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>{row.job_id}</button>
                    : '—'}
                </td>
                <td style={{ padding: '6px 8px', color: '#64748b' }}>{row.bin || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/stock/tabs/StockCommittedTab.jsx`**

```jsx
import { useQuery } from '@tanstack/react-query';
import * as api from '../../../api';

export default function StockCommittedTab({ sku, onNavigateJob }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['stock-committed', sku],
    queryFn: () => api.stock.committed(sku),
  });

  if (isLoading) return <div style={{ padding: 16, color: '#94a3b8', fontSize: 12 }}>Loading…</div>;
  if (rows.length === 0) return <div style={{ padding: 16, color: '#94a3b8', fontSize: 12 }}>No committed stock for active jobs.</div>;

  return (
    <div style={{ padding: 16, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {['Card Code', 'Customer', 'Job#', 'Date', 'Loc', 'Qty', 'Unit', 'Price Ex.', 'Price Inc.', 'Curr', 'Total (AUD)'].map(h => (
              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: '#94a3b8', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '6px 8px', color: '#64748b' }}>{row.card_code}</td>
              <td style={{ padding: '6px 8px', color: '#1e293b', fontWeight: 500 }}>{row.customer_name}</td>
              <td style={{ padding: '6px 8px' }}>
                <button onClick={() => onNavigateJob(row.job_id)} style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>
                  {row.job_ref}
                </button>
              </td>
              <td style={{ padding: '6px 8px', color: '#64748b', whiteSpace: 'nowrap' }}>{row.date || '—'}</td>
              <td style={{ padding: '6px 8px', color: '#64748b' }}>{row.location_branch || '—'}</td>
              <td style={{ padding: '6px 8px', fontWeight: 700 }}>{row.qty}</td>
              <td style={{ padding: '6px 8px', color: '#64748b' }}>{row.unit}</td>
              <td style={{ padding: '6px 8px' }}>{row.price_ex != null ? `$${Number(row.price_ex).toFixed(2)}` : '—'}</td>
              <td style={{ padding: '6px 8px' }}>{row.price_inc != null ? `$${Number(row.price_inc).toFixed(2)}` : '—'}</td>
              <td style={{ padding: '6px 8px', color: '#64748b' }}>{row.currency}</td>
              <td style={{ padding: '6px 8px', fontWeight: 700 }}>{row.total_aud != null ? `$${Number(row.total_aud).toFixed(2)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/stock/tabs/StockTransactionsTab.jsx frontend/src/components/stock/tabs/StockCommittedTab.jsx
git commit -m "feat: StockTransactionsTab (movement history with clickable Job/PO refs); StockCommittedTab (reserved stock by job)"
```

---

## Task 13: Wire StockModule into TotalImageERP.jsx

**Files:**
- Modify: `frontend/src/TotalImageERP.jsx`

- [ ] **Step 1: Add the StockModule import**

Find the existing imports near the top of `TotalImageERP.jsx` (the block of component imports). Add after the AdminPanel import line:

```js
import StockModule from './components/stock/StockModule';
```

- [ ] **Step 2: Replace the `renderInventory()` call in the render JSX**

Find this line (around line 9202):

```jsx
{!loading && activeModule === 'inventory'          && renderInventory()}
```

Replace it with:

```jsx
{!loading && activeModule === 'inventory' && (
  <StockModule
    inventory={inventory}
    onNavigateJob={(jobId) => { setActiveModule('jobs'); }}
    onNavigatePO={(poId) => { setActiveModule('purchase-orders'); }}
  />
)}
```

- [ ] **Step 3: Delete the `renderInventory` function**

Find line 2740: `const renderInventory = () => {`

Delete the entire function from `const renderInventory = () => {` through to its closing `};`. The function is approximately 400 lines. It ends around line 3140. Delete it entirely.

Also delete these state variables that are only used by `renderInventory` (search for each and delete the `const [x, setX] = useState(...)` line if it is not referenced elsewhere):
- `invCatFilter` / `setInvCatFilter`
- `invStatusFilter` / `setInvStatusFilter`
- `invTab` / `setInvTab`

**Important:** Do NOT delete `stockAdjustModal`, `transferModal`, `stocktakeModal`, `stockFlowModal` state — these are referenced by topbar buttons on lines 8781–8788 and their own modal render sections. Those can be cleaned up in a future task.

- [ ] **Step 4: Run backend tests to verify no regressions**

```bash
cd backend
python -m pytest --no-cov -q
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/TotalImageERP.jsx frontend/src/components/stock/
git commit -m "feat: wire StockModule into TotalImageERP — replace renderInventory() with Jim2-parity stock module"
```

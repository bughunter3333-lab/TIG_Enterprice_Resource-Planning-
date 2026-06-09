# ERP Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-file TotalImageERP.jsx with a clean Icon Rail + Label Panel shell, a redesigned Dashboard, a Kanban jobs board, Jim2 field parity in the job form, an admin-only Tools panel, and a Jim2 CSV migration wizard.

**Architecture:** New Shell First — create shell components (`Rail`, `LabelPanel`, `Topbar`, `Shell`) then wire them into TotalImageERP.jsx while keeping existing module views intact. Extract Dashboard and Jobs views into dedicated components. Add Jim2 fields via Alembic migration + Pydantic schema updates. Admin panel toggled via amber lock icon in the rail.

**Tech Stack:** React 18 + Vite + Tailwind CSS (JSX), TanStack Query v5, Lucide icons, FastAPI + SQLAlchemy + Alembic, pytest (SQLite in-memory)

---

## File Map

### New files to create

| File | Responsibility |
|---|---|
| `frontend/src/components/shell/Rail.jsx` | 52px dark icon rail with nav icons + lock toggle |
| `frontend/src/components/shell/LabelPanel.jsx` | 196px dark label panel with nav sections + badges |
| `frontend/src/components/shell/Topbar.jsx` | 50px white topbar: title, search, New Job CTA, bell |
| `frontend/src/components/shell/Shell.jsx` | Root layout: rail + panel + main (topbar + content) |
| `frontend/src/components/dashboard/KpiStrip.jsx` | 4 KPI cards + New Job CTA tile (5-col grid) |
| `frontend/src/components/dashboard/ActivityFeed.jsx` | Recent job status changes from existing `comments` data |
| `frontend/src/components/dashboard/DecMixChart.jsx` | Horizontal bar chart of decoration type counts |
| `frontend/src/components/dashboard/Dashboard.jsx` | Composes KpiStrip + 2-col activity/chart + kanban preview strip |
| `frontend/src/components/jobs/JobCard.jsx` | Single kanban card: job#, customer, status badge, dec tag, total |
| `frontend/src/components/jobs/KanbanColumn.jsx` | One status column: header + stacked JobCards |
| `frontend/src/components/jobs/JobsBoard.jsx` | Board/list toggle + filter chips + 8 KanbanColumns |
| `frontend/src/components/admin/AdminPanel.jsx` | Dark amber admin shell — 5 sub-sections as tabs |
| `frontend/src/components/admin/FieldConfig.jsx` | Toggle+reorder job header fields; saves to adminSettings API |
| `frontend/src/components/admin/StatusWorkflow.jsx` | Draggable status chips + add/rename/delete |
| `frontend/src/components/admin/PriceLevels.jsx` | Table of price levels with discount % + add/edit/delete |
| `frontend/src/components/admin/DecorationTypes.jsx` | Enable/disable each decoration type |
| `frontend/src/components/admin/MigrationWizard.jsx` | 5-step Jim2 CSV import wizard |
| `backend/alembic/versions/o9p0q1r2s3t4_jim2_job_fields.py` | Jim2 fields on `jobs`, `admin_settings` table |
| `backend/app/routers/admin_settings.py` | GET/PUT `/admin/settings/{key}` + PATCH `/admin/settings` |
| `backend/tests/integration/test_admin_settings.py` | pytest integration tests for admin settings endpoints |
| `backend/tests/integration/test_jim2_fields.py` | pytest integration tests for Jim2 job fields round-trip |

### Files to modify

| File | Change |
|---|---|
| `backend/app/models/job.py` | Add 6 Jim2 columns + `lock_rate` |
| `backend/app/routers/jobs.py` | Add 6 Jim2 fields to `_JobSharedFields` |
| `backend/app/main.py` | Register `admin_settings` router |
| `frontend/src/api.js` | Add Jim2 fields to `normalizeJob` / `jobs.create` / `jobs.update`; add `adminSettings` object |
| `frontend/src/TotalImageERP.jsx` | Replace top nav with Shell; add Jim2 fields to job form; wire Dashboard + JobsBoard; add AdminPanel |

---

## Task 1: Alembic migration — Jim2 job fields + admin_settings table

**Files:**
- Create: `backend/alembic/versions/o9p0q1r2s3t4_jim2_job_fields.py`
- Modify: `backend/app/models/job.py`

- [ ] **Step 1: Add columns to SQLAlchemy model**

In `backend/app/models/job.py`, after the existing `branch = Column(...)` line (around line 46), add inside the `Job` class:

```python
    # Jim2 Sprint-2 fields
    price_level = Column(String(50))             # Retail / Trade / Wholesale / VIP / Cost
    acc_mgr = Column(String(100))                # account manager name or initials
    invoice_desc = Column(Text)                  # description printed on invoice
    ex_job_ref = Column(String(100))             # customer's own PO / reference number
    requested_by = Column(String(100))           # free-text person who placed the order
    lock_rate = Column(Boolean, default=False)   # lock exchange/pricing rate
```

- [ ] **Step 2: Write the Alembic migration**

Create `backend/alembic/versions/o9p0q1r2s3t4_jim2_job_fields.py`:

```python
"""jim2_job_fields — price_level, acc_mgr, invoice_desc, ex_job_ref, requested_by, lock_rate + admin_settings table

Revision ID: o9p0q1r2s3t4
Revises: n8o9p0q1r2s3
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa

revision = 'o9p0q1r2s3t4'
down_revision = 'n8o9p0q1r2s3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Jim2 job fields
    op.add_column('jobs', sa.Column('price_level', sa.String(50), nullable=True))
    op.add_column('jobs', sa.Column('acc_mgr', sa.String(100), nullable=True))
    op.add_column('jobs', sa.Column('invoice_desc', sa.Text(), nullable=True))
    op.add_column('jobs', sa.Column('ex_job_ref', sa.String(100), nullable=True))
    op.add_column('jobs', sa.Column('requested_by', sa.String(100), nullable=True))
    op.add_column('jobs', sa.Column('lock_rate', sa.Boolean(), nullable=True, server_default='false'))

    # Admin settings key-value store
    op.create_table(
        'admin_settings',
        sa.Column('key', sa.String(100), primary_key=True),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('admin_settings')
    op.drop_column('jobs', 'lock_rate')
    op.drop_column('jobs', 'requested_by')
    op.drop_column('jobs', 'ex_job_ref')
    op.drop_column('jobs', 'invoice_desc')
    op.drop_column('jobs', 'acc_mgr')
    op.drop_column('jobs', 'price_level')
```

- [ ] **Step 3: Apply the migration**

```bash
cd backend
python -m alembic upgrade head
```

Expected: `Running upgrade n8o9p0q1r2s3 -> o9p0q1r2s3t4, jim2_job_fields...`

- [ ] **Step 4: Verify columns exist**

```bash
python -c "
from app.database import engine
from sqlalchemy import inspect
cols = [c['name'] for c in inspect(engine).get_columns('jobs')]
assert 'price_level' in cols
assert 'lock_rate' in cols
tables = inspect(engine).get_table_names()
assert 'admin_settings' in tables
print('OK')
"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/o9p0q1r2s3t4_jim2_job_fields.py backend/app/models/job.py
git commit -m "feat: Jim2 job fields migration — price_level, acc_mgr, invoice_desc, ex_job_ref, requested_by, lock_rate + admin_settings table"
```

---

## Task 2: Backend — expose Jim2 fields in job schema + admin settings router

**Files:**
- Modify: `backend/app/routers/jobs.py:83-122` (`_JobSharedFields`)
- Create: `backend/app/routers/admin_settings.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/integration/test_jim2_fields.py`
- Create: `backend/tests/integration/test_admin_settings.py`

- [ ] **Step 1: Write failing test for Jim2 fields round-trip**

Create `backend/tests/integration/test_jim2_fields.py`:

```python
import pytest

@pytest.mark.integration
def test_job_create_with_jim2_fields(client, make_customer):
    cust = make_customer()
    payload = {
        "customer_id": cust.id,
        "customer_name": cust.name,
        "status": "QUOTE",
        "price_level": "Trade",
        "acc_mgr": "JD",
        "invoice_desc": "Custom embroidery order",
        "ex_job_ref": "PO-9999",
        "requested_by": "Alice Smith",
        "lock_rate": True,
        "items": [],
    }
    res = client.post("/jobs", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["price_level"] == "Trade"
    assert data["acc_mgr"] == "JD"
    assert data["invoice_desc"] == "Custom embroidery order"
    assert data["ex_job_ref"] == "PO-9999"
    assert data["requested_by"] == "Alice Smith"
    assert data["lock_rate"] is True


@pytest.mark.integration
def test_job_update_jim2_fields(client, make_customer):
    cust = make_customer()
    create_res = client.post("/jobs", json={
        "customer_id": cust.id, "customer_name": cust.name, "status": "QUOTE", "items": [],
    })
    job_id = create_res.json()["id"]

    patch_res = client.patch(f"/jobs/{job_id}", json={"price_level": "VIP", "requested_by": "Bob"})
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["price_level"] == "VIP"
    assert data["requested_by"] == "Bob"
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend
python -m pytest tests/integration/test_jim2_fields.py -v --no-cov
```

Expected: `FAILED — KeyError 'price_level'` (field not yet in schema)

- [ ] **Step 3: Add Jim2 fields to `_JobSharedFields`**

In `backend/app/routers/jobs.py`, add these lines inside `_JobSharedFields` (after `fuel_levy` on line ~122):

```python
    # Jim2 Sprint-2 fields
    price_level: Optional[str] = None
    acc_mgr: Optional[str] = None
    invoice_desc: Optional[str] = None
    ex_job_ref: Optional[str] = None
    requested_by: Optional[str] = None
    lock_rate: Optional[bool] = None
```

Then find the `job_to_dict` function (or the dict comprehension inside the `get` / `list` endpoints that serialises a Job row) and add the 6 new fields to it. Search for where `"proof_notes": j.proof_notes` or `"fuel_levy"` is serialised and add:

```python
    "price_level": j.price_level,
    "acc_mgr": j.acc_mgr,
    "invoice_desc": j.invoice_desc,
    "ex_job_ref": j.ex_job_ref,
    "requested_by": j.requested_by,
    "lock_rate": j.lock_rate,
```

Also find where job fields are written (PATCH and POST handlers) and add each field assignment:

```python
    if data.price_level is not None:
        job.price_level = data.price_level
    if data.acc_mgr is not None:
        job.acc_mgr = data.acc_mgr
    if data.invoice_desc is not None:
        job.invoice_desc = data.invoice_desc
    if data.ex_job_ref is not None:
        job.ex_job_ref = data.ex_job_ref
    if data.requested_by is not None:
        job.requested_by = data.requested_by
    if data.lock_rate is not None:
        job.lock_rate = data.lock_rate
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd backend
python -m pytest tests/integration/test_jim2_fields.py -v --no-cov
```

Expected: `2 passed`

- [ ] **Step 5: Write failing test for admin settings**

Create `backend/tests/integration/test_admin_settings.py`:

```python
import pytest

@pytest.mark.integration
def test_admin_settings_put_and_get(client):
    # PUT a setting
    res = client.put("/admin/settings/field_config", json={"value": '{"price_level": true}'})
    assert res.status_code == 200
    assert res.json()["key"] == "field_config"

    # GET it back
    get_res = client.get("/admin/settings/field_config")
    assert get_res.status_code == 200
    assert get_res.json()["value"] == '{"price_level": true}'


@pytest.mark.integration
def test_admin_settings_missing_key_returns_null(client):
    res = client.get("/admin/settings/nonexistent_key")
    assert res.status_code == 200
    assert res.json()["value"] is None
```

- [ ] **Step 6: Run failing test**

```bash
cd backend
python -m pytest tests/integration/test_admin_settings.py -v --no-cov
```

Expected: `FAILED — 404 Not Found` (router not yet registered)

- [ ] **Step 7: Create admin settings router**

Create `backend/app/routers/admin_settings.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import Column, String, Text, DateTime, func
from pydantic import BaseModel
from typing import Optional
from app.database import get_db, Base
from app.core.dependencies import require_any

router = APIRouter(prefix="/admin/settings", tags=["admin"])


class AdminSetting(Base):
    __tablename__ = "admin_settings"
    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SettingUpsert(BaseModel):
    value: Optional[str] = None


def _to_dict(row: AdminSetting) -> dict:
    return {"key": row.key, "value": row.value}


@router.get("/{key}")
def get_setting(key: str, db: Session = Depends(get_db), _=Depends(require_any)):
    row = db.query(AdminSetting).filter(AdminSetting.key == key).first()
    if row is None:
        return {"key": key, "value": None}
    return _to_dict(row)


@router.put("/{key}")
def upsert_setting(key: str, body: SettingUpsert, db: Session = Depends(get_db), _=Depends(require_any)):
    row = db.query(AdminSetting).filter(AdminSetting.key == key).first()
    if row is None:
        row = AdminSetting(key=key, value=body.value)
        db.add(row)
    else:
        row.value = body.value
    db.commit()
    db.refresh(row)
    return _to_dict(row)
```

- [ ] **Step 8: Register router in main.py**

In `backend/app/main.py`, find the block where other routers are included (look for `app.include_router`) and add:

```python
from app.routers.admin_settings import router as admin_settings_router
app.include_router(admin_settings_router)
```

- [ ] **Step 9: Run all tests**

```bash
cd backend
python -m pytest tests/integration/test_admin_settings.py tests/integration/test_jim2_fields.py -v --no-cov
```

Expected: `4 passed`

- [ ] **Step 10: Run full test suite**

```bash
cd backend
python -m pytest --no-cov -q
```

Expected: all pass

- [ ] **Step 11: Commit**

```bash
git add backend/app/routers/jobs.py backend/app/routers/admin_settings.py backend/app/main.py backend/tests/integration/test_jim2_fields.py backend/tests/integration/test_admin_settings.py
git commit -m "feat: expose Jim2 job fields in schema; add admin settings CRUD router"
```

---

## Task 3: Frontend api.js — Jim2 fields + adminSettings

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Add Jim2 fields to `normalizeJob`**

In `frontend/src/api.js`, inside `normalizeJob` after the `// Jim2 fields` block (around line 61), add:

```javascript
    // Jim2 Sprint-2 fields
    priceLevel: j.price_level ?? j.priceLevel ?? '',
    accMgr: j.acc_mgr ?? j.accMgr ?? '',
    invoiceDesc: j.invoice_desc ?? j.invoiceDesc ?? '',
    exJobRef: j.ex_job_ref ?? j.exJobRef ?? '',
    requestedBy: j.requested_by ?? j.requestedBy ?? '',
    lockRate: j.lock_rate ?? j.lockRate ?? false,
```

- [ ] **Step 2: Add Jim2 fields to `jobs.create` body**

In `frontend/src/api.js`, inside `jobs.create` body (after `name_contact: data.nameContact,`), add:

```javascript
    // Jim2 Sprint-2 fields
    price_level: data.priceLevel || null,
    acc_mgr: data.accMgr || null,
    invoice_desc: data.invoiceDesc || null,
    ex_job_ref: data.exJobRef || null,
    requested_by: data.requestedBy || null,
    lock_rate: data.lockRate || false,
```

- [ ] **Step 3: Add Jim2 fields to `jobs.update` body**

In `frontend/src/api.js`, inside `jobs.update` body (after `name_contact: data.nameContact,`), add the same 6 lines as Step 2.

- [ ] **Step 4: Add `adminSettings` API object**

At the end of `frontend/src/api.js` (before the final closing), add:

```javascript
// ── Admin Settings ────────────────────────────────────────────────────────────

export const adminSettings = {
  get: (key) => request(`/admin/settings/${key}`),
  set: (key, value) => request(`/admin/settings/${key}`, {
    method: 'PUT',
    body: { value: typeof value === 'string' ? value : JSON.stringify(value) },
  }),
};
```

- [ ] **Step 5: Verify with dev server**

```bash
cd frontend
npm run dev
```

Open browser → open DevTools → Network tab → log in → check that `/jobs` response includes `price_level`, `lock_rate` fields. Expected: fields present (null for existing jobs).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add Jim2 fields to api.js normalizer and request bodies; add adminSettings API"
```

---

## Task 4: Shell components — Rail, LabelPanel, Topbar, Shell

**Files:**
- Create: `frontend/src/components/shell/Rail.jsx`
- Create: `frontend/src/components/shell/LabelPanel.jsx`
- Create: `frontend/src/components/shell/Topbar.jsx`
- Create: `frontend/src/components/shell/Shell.jsx`

- [ ] **Step 1: Create Rail.jsx**

Create `frontend/src/components/shell/Rail.jsx`:

```jsx
import { LayoutGrid, Briefcase, FileText, ShoppingCart, Users, Package, BookOpen, Lock } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard',  icon: LayoutGrid,    label: 'Dashboard' },
  { id: 'jobs',       icon: Briefcase,     label: 'Jobs' },
  { id: 'quotes',     icon: FileText,      label: 'Quotes' },
  { id: 'purchases',  icon: ShoppingCart,  label: 'Purchases' },
  { id: 'customers',  icon: Users,         label: 'Customers' },
  { id: 'inventory',  icon: Package,       label: 'Stock' },
  { id: 'accounts',   icon: BookOpen,      label: 'Accounts' },
];

export default function Rail({ activeModule, onNavigate, adminMode, onAdminToggle, currentUser }) {
  const initials = (currentUser?.username ?? 'U').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: 52, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', gap: 2, flexShrink: 0, height: '100vh' }}>
      {/* Logo */}
      <div style={{ width: 32, height: 32, background: '#3b82f6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'white', marginBottom: 14 }}>
        TIG
      </div>

      {/* Nav icons */}
      {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
        <div
          key={id}
          title={label}
          onClick={() => onNavigate(id)}
          style={{
            width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: activeModule === id ? 'white' : '#475569',
            background: activeModule === id ? '#1d4ed8' : 'transparent',
          }}
          onMouseEnter={e => { if (activeModule !== id) e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.color = '#94a3b8'; }}
          onMouseLeave={e => { if (activeModule !== id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; } }}
        >
          <Icon size={15} />
        </div>
      ))}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Admin lock icon (admin-only) */}
      {currentUser?.role === 'admin' && (
        <div
          title={adminMode ? 'Exit Admin' : 'Admin Tools'}
          onClick={onAdminToggle}
          style={{
            width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: adminMode ? '#fbbf24' : '#f59e0b',
            background: adminMode ? '#451a03' : 'transparent',
            marginBottom: 6,
          }}
        >
          <Lock size={15} />
        </div>
      )}

      {/* Avatar */}
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
        {initials}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create LabelPanel.jsx**

Create `frontend/src/components/shell/LabelPanel.jsx`:

```jsx
const SECTIONS = [
  {
    label: 'WORK',
    items: [
      { id: 'dashboard',  label: 'Dashboard',       dot: '#3b82f6' },
      { id: 'jobs',       label: 'Jobs',             dot: '#8b5cf6', badgeKey: 'jobCount' },
      { id: 'quotes',     label: 'Quotes',           dot: '#f59e0b', badgeKey: 'quoteCount' },
      { id: 'purchases',  label: 'Purchase Orders',  dot: '#14b8a6' },
    ],
  },
  {
    label: 'INVENTORY',
    items: [
      { id: 'inventory',  label: 'Stock',        dot: '#10b981' },
      { id: 'card-files', label: 'Card Files',   dot: '#64748b' },
    ],
  },
  {
    label: 'FINANCIALS',
    items: [
      { id: 'customers',  label: 'Customers',    dot: '#06b6d4' },
      { id: 'accounts',   label: 'Accounts',     dot: '#a855f7' },
      { id: 'reports',    label: 'Reports',      dot: '#ec4899' },
    ],
  },
];

export default function LabelPanel({ activeModule, onNavigate, badges = {}, adminMode, onAdminToggle, currentUser }) {
  return (
    <div style={{ width: 196, background: '#1e293b', display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100vh', overflowY: 'auto' }}>
      <div style={{ padding: '14px 14px 6px', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.07em' }}>
        Total Image Group
      </div>

      {SECTIONS.map(section => (
        <div key={section.label}>
          <div style={{ padding: '10px 14px 3px', fontSize: 9, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            {section.label}
          </div>
          {section.items.map(item => {
            const active = activeModule === item.id;
            const badge = item.badgeKey ? badges[item.badgeKey] : null;
            return (
              <div
                key={item.id}
                onClick={() => onNavigate(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '7px 14px',
                  color: active ? '#60a5fa' : '#64748b', fontSize: 13, cursor: 'pointer',
                  background: active ? '#172554' : 'transparent',
                  borderRight: active ? '2px solid #3b82f6' : '2px solid transparent',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#334155'; e.currentTarget.style.color = '#e2e8f0'; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; } }}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.dot, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {badge > 0 && (
                  <span style={{ background: '#1d4ed8', color: '#bfdbfe', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>
                    {badge}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Admin section */}
      {currentUser?.role === 'admin' && (
        <div>
          <div style={{ padding: '10px 14px 3px', fontSize: 9, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            ADMIN
          </div>
          <div
            onClick={onAdminToggle}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '7px 14px',
              color: adminMode ? '#fbbf24' : '#64748b', fontSize: 13, cursor: 'pointer',
              background: adminMode ? '#1c1404' : 'transparent',
              borderRight: adminMode ? '2px solid #f59e0b' : '2px solid transparent',
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
            <span>Admin Tools</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 'auto', padding: '10px 14px', borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>
          {(currentUser?.username ?? 'U').slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{currentUser?.username ?? ''}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>{currentUser?.role ?? 'staff'}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create Topbar.jsx**

Create `frontend/src/components/shell/Topbar.jsx`:

```jsx
import { Search, Bell, Plus } from 'lucide-react';

export default function Topbar({ title, subtitle, onNewJob, searchValue, onSearchChange, notifCount = 0 }) {
  return (
    <div style={{ height: 50, background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 10, flexShrink: 0 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: '#94a3b8' }}>{subtitle}</div>}
      </div>

      <div style={{ flex: 1 }} />

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 11px', width: 200 }}>
        <Search size={13} color="#94a3b8" />
        <input
          value={searchValue}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search…"
          style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 11, color: '#334155', width: '100%' }}
        />
      </div>

      {/* New Job */}
      <button
        onClick={onNewJob}
        style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
      >
        <Plus size={13} /> New Job
      </button>

      {/* Bell */}
      <div style={{ position: 'relative', width: 30, height: 30, borderRadius: 7, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <Bell size={13} color="#64748b" />
        {notifCount > 0 && (
          <div style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, background: '#ef4444', borderRadius: '50%', border: '1px solid white' }} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create Shell.jsx**

Create `frontend/src/components/shell/Shell.jsx`:

```jsx
import Rail from './Rail';
import LabelPanel from './LabelPanel';
import Topbar from './Topbar';

const MODULE_TITLES = {
  dashboard:   { title: 'Dashboard',       subtitle: 'Total Image Group' },
  jobs:        { title: 'Jobs',             subtitle: 'All production jobs' },
  quotes:      { title: 'Quotes',          subtitle: 'Active quotes' },
  purchases:   { title: 'Purchase Orders', subtitle: 'Supplier orders' },
  customers:   { title: 'Customers',       subtitle: 'Card files' },
  inventory:   { title: 'Stock',           subtitle: 'Inventory' },
  accounts:    { title: 'Accounts',        subtitle: 'Financial records' },
  reports:     { title: 'Reports',         subtitle: '' },
  'card-files':{ title: 'Card Files',      subtitle: '' },
};

export default function Shell({
  activeModule,
  onNavigate,
  adminMode,
  onAdminToggle,
  currentUser,
  badges,
  onNewJob,
  searchValue,
  onSearchChange,
  notifCount,
  children,
}) {
  const { title, subtitle } = MODULE_TITLES[activeModule] ?? { title: activeModule, subtitle: '' };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f1f5f9' }}>
      <Rail
        activeModule={activeModule}
        onNavigate={onNavigate}
        adminMode={adminMode}
        onAdminToggle={onAdminToggle}
        currentUser={currentUser}
      />
      <LabelPanel
        activeModule={activeModule}
        onNavigate={onNavigate}
        adminMode={adminMode}
        onAdminToggle={onAdminToggle}
        currentUser={currentUser}
        badges={badges}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar
          title={adminMode ? 'Admin Tools' : title}
          subtitle={adminMode ? 'Configuration & Migration' : subtitle}
          onNewJob={onNewJob}
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          notifCount={notifCount}
        />
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit shell components**

```bash
git add frontend/src/components/shell/
git commit -m "feat: app shell components — Rail, LabelPanel, Topbar, Shell"
```

---

## Task 5: Wire Shell into TotalImageERP.jsx

**Files:**
- Modify: `frontend/src/TotalImageERP.jsx`

This task replaces the existing navigation sidebar in TotalImageERP.jsx with the new Shell wrapper. The existing module views stay intact inside the content area.

- [ ] **Step 1: Find the existing navigation structure**

In `TotalImageERP.jsx`, search for the outermost `return (` of the `TotalImageERP` component (around line 1886+ in the `renderDashboard` function — the *outer* return is higher up). The component renders a two-column layout (sidebar + content). Identify the opening div wrapping the entire layout.

Run:
```bash
grep -n "flex.*min-h-screen\|flex.*h-screen\|bg-gray-100\|bg-slate-100" frontend/src/TotalImageERP.jsx | head -20
```

- [ ] **Step 2: Add Shell import**

At the top of `frontend/src/TotalImageERP.jsx`, add after existing imports:

```jsx
import Shell from './components/shell/Shell';
```

- [ ] **Step 3: Add adminMode state**

Inside `const TotalImageERP = ({ currentUser, onLogout }) => {` (line 659), add after `const [activeModule, setActiveModule] = useState('dashboard');`:

```jsx
  const [adminMode, setAdminMode] = useState(false);
```

- [ ] **Step 4: Replace the outermost layout div with Shell**

Find the main `return (` of the `TotalImageERP` component (not a sub-render function — the one at the very bottom after all state declarations). It will look something like:

```jsx
return (
  <div className="flex h-screen overflow-hidden bg-gray-100">
    {/* existing sidebar */}
    <div className="w-56 ...">
      {/* nav items */}
    </div>
    {/* main content */}
    <div className="flex-1 ...">
```

Replace the entire outermost structure from `return (` through the first nested `</div>` of the sidebar with:

```jsx
return (
  <Shell
    activeModule={activeModule}
    onNavigate={setActiveModule}
    adminMode={adminMode}
    onAdminToggle={() => setAdminMode(v => !v)}
    currentUser={currentUser}
    badges={{ jobCount: jobs.filter(j => !['PAID','CANCEL'].includes(j.status)).length, quoteCount: jobs.filter(j => j.status === 'QUOTE').length }}
    onNewJob={() => openModal('job')}
    searchValue={searchTerm}
    onSearchChange={setSearchTerm}
    notifCount={jobs.filter(j => j.status !== 'PAID' && j.due && new Date(j.due) < new Date()).length}
  >
```

And close the Shell wrapper at the very end of the return with `</Shell>` instead of the closing `</div>`.

Remove the old sidebar nav div entirely (everything between the old outer `<div className="flex h-screen...">` and the `<div className="flex-1...">`).

- [ ] **Step 5: Start dev server and verify**

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`. Expected: new dark rail + dark label panel visible on left. Clicking nav items switches modules. Lock icon visible for admin users. Content area shows existing module views unchanged.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/TotalImageERP.jsx
git commit -m "feat: wire Shell into TotalImageERP — icon rail + label panel replace old sidebar"
```

---

## Task 6: Dashboard components

**Files:**
- Create: `frontend/src/components/dashboard/KpiStrip.jsx`
- Create: `frontend/src/components/dashboard/ActivityFeed.jsx`
- Create: `frontend/src/components/dashboard/DecMixChart.jsx`
- Create: `frontend/src/components/dashboard/Dashboard.jsx`

- [ ] **Step 1: Create KpiStrip.jsx**

Create `frontend/src/components/dashboard/KpiStrip.jsx`:

```jsx
export default function KpiStrip({ revenue, jobsOpen, dueToday, paid, onNewJob }) {
  const kpis = [
    { label: 'Revenue', value: `$${(revenue ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`, delta: null, color: '#3b82f6' },
    { label: 'Jobs Open', value: jobsOpen ?? 0, delta: null, color: '#f59e0b' },
    { label: 'Due Today', value: dueToday ?? 0, delta: null, color: '#ef4444' },
    { label: 'Paid (MTD)', value: `$${(paid ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`, delta: null, color: '#10b981' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr) 120px', gap: 10, marginBottom: 16 }}>
      {kpis.map(kpi => (
        <div key={kpi.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 9, padding: '13px 15px' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginBottom: 4 }}>{kpi.label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
        </div>
      ))}
      <div
        onClick={onNewJob}
        style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', borderRadius: 9, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 3, cursor: 'pointer' }}
      >
        <div style={{ fontSize: 9, color: '#93c5fd' }}>Quick add</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>+ New Job</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ActivityFeed.jsx**

Create `frontend/src/components/dashboard/ActivityFeed.jsx`:

```jsx
const STATUS_COLORS = {
  QUOTE: '#f59e0b', ORDER: '#3b82f6', 'In Progress': '#8b5cf6',
  PROOF: '#06b6d4', PRINT: '#ec4899', FINISH: '#10b981',
  INVOICE: '#a855f7', PAID: '#64748b', CANCEL: '#ef4444',
};

export default function ActivityFeed({ jobs }) {
  // Build activity from recent comments + recent status jobs
  const recentJobs = [...jobs]
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, 8);

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 9, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Recent Activity</h3>
      </div>
      {recentJobs.map(job => (
        <div key={job.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f8fafc', alignItems: 'flex-start' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[job.status] ?? '#94a3b8', flexShrink: 0, marginTop: 4 }} />
          <div>
            <div style={{ fontSize: 11, color: '#334155' }}>
              <strong style={{ color: '#0f172a' }}>#{job.id}</strong> {job.customer} — <span style={{ color: STATUS_COLORS[job.status] ?? '#64748b' }}>{job.status}</span>
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{job.due ? `Due ${job.due}` : 'No due date'}</div>
          </div>
        </div>
      ))}
      {recentJobs.length === 0 && (
        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>No jobs yet</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create DecMixChart.jsx**

Create `frontend/src/components/dashboard/DecMixChart.jsx`:

```jsx
const DEC_COLORS = {
  EMB: '#8b5cf6', DTF: '#14b8a6', Screen: '#3b82f6',
  DTG: '#10b981', Vinyl: '#22c55e', Sub: '#ec4899',
  Pad: '#f59e0b', Laser: '#ef4444', TRS: '#f97316',
};

export default function DecMixChart({ jobs }) {
  const counts = {};
  jobs.forEach(job => {
    (job.items ?? []).forEach(item => {
      const d = item.decorationType;
      if (d && d !== 'None') counts[d] = (counts[d] ?? 0) + 1;
    });
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 9, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Decoration Mix</h3>
      </div>
      {entries.length === 0 && (
        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>No decoration data</div>
      )}
      {entries.map(([type, count]) => (
        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <div style={{ fontSize: 10, color: '#64748b', width: 44, flexShrink: 0 }}>{type}</div>
          <div style={{ flex: 1, height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: DEC_COLORS[type] ?? '#94a3b8', borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', width: 20, textAlign: 'right' }}>{count}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create Dashboard.jsx**

Create `frontend/src/components/dashboard/Dashboard.jsx`:

```jsx
import KpiStrip from './KpiStrip';
import ActivityFeed from './ActivityFeed';
import DecMixChart from './DecMixChart';

const STATUS_COLORS = {
  QUOTE: '#f59e0b', ORDER: '#3b82f6', 'In Progress': '#8b5cf6',
  PROOF: '#06b6d4', PRINT: '#ec4899', FINISH: '#10b981',
  INVOICE: '#a855f7', PAID: '#64748b',
};

const KANBAN_STATUSES = ['QUOTE', 'ORDER', 'In Progress', 'PROOF', 'PRINT', 'FINISH', 'INVOICE', 'PAID'];

export default function Dashboard({ jobs, onNewJob, onNavigateJobs }) {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  const revenue = jobs
    .filter(j => j.status === 'PAID' && (j.out ?? j.due ?? '').startsWith(thisMonth))
    .reduce((s, j) => s + (j.total ?? 0), 0);

  const jobsOpen = jobs.filter(j => !['PAID', 'CANCEL'].includes(j.status)).length;
  const dueToday = jobs.filter(j => j.due === today && !['PAID', 'CANCEL'].includes(j.status)).length;
  const paid = jobs
    .filter(j => j.status === 'PAID' && (j.out ?? j.due ?? '').startsWith(thisMonth))
    .reduce((s, j) => s + (j.invoicePaid ?? 0), 0);

  return (
    <div>
      <KpiStrip revenue={revenue} jobsOpen={jobsOpen} dueToday={dueToday} paid={paid} onNewJob={onNewJob} />

      {/* Two-column panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        <ActivityFeed jobs={jobs} />
        <DecMixChart jobs={jobs} />
      </div>

      {/* Kanban preview strip */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 9, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Job Pipeline</h3>
          <button onClick={onNavigateJobs} style={{ fontSize: 10, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>View all →</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {KANBAN_STATUSES.map(status => {
            const count = jobs.filter(j => j.status === status).length;
            return (
              <div key={status} onClick={onNavigateJobs} style={{ flex: 1, background: '#f8fafc', borderRadius: 7, border: '1px solid #e2e8f0', padding: '8px 10px', cursor: 'pointer' }}>
                <div style={{ fontSize: 7, fontWeight: 700, color: STATUS_COLORS[status] ?? '#64748b', marginBottom: 4 }}>{status}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{count}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire Dashboard into TotalImageERP.jsx**

In `TotalImageERP.jsx`, find the `renderDashboard` function (or the inline dashboard rendering block inside the main return). Replace its content with:

```jsx
import Dashboard from './components/dashboard/Dashboard';
// ... (add to imports at top)
```

Then where the dashboard is rendered (inside `activeModule === 'dashboard'` conditional), replace the existing dashboard JSX with:

```jsx
<Dashboard
  jobs={jobs}
  onNewJob={() => openModal('job')}
  onNavigateJobs={() => setActiveModule('jobs')}
/>
```

- [ ] **Step 6: Start dev server and verify dashboard**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`. Navigate to Dashboard. Expected:
- 5-column KPI strip with revenue, open jobs, due today, paid, New Job tile
- Two-column activity feed + decoration mix chart
- Kanban pipeline preview strip at bottom
- All values reflect real job data

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/dashboard/
git commit -m "feat: Dashboard components — KpiStrip, ActivityFeed, DecMixChart, kanban preview strip"
```

---

## Task 7: Kanban Jobs Board

**Files:**
- Create: `frontend/src/components/jobs/JobCard.jsx`
- Create: `frontend/src/components/jobs/KanbanColumn.jsx`
- Create: `frontend/src/components/jobs/JobsBoard.jsx`

- [ ] **Step 1: Create JobCard.jsx**

Create `frontend/src/components/jobs/JobCard.jsx`:

```jsx
const STATUS_COLORS = {
  QUOTE: '#f59e0b', ORDER: '#3b82f6', 'In Progress': '#8b5cf6',
  PROOF: '#06b6d4', PRINT: '#ec4899', FINISH: '#10b981',
  INVOICE: '#a855f7', PAID: '#64748b', CANCEL: '#ef4444',
};

const DEC_PILL_COLORS = {
  EMB: '#8b5cf620', DTF: '#14b8a620', Screen: '#3b82f620',
  DTG: '#10b98120', Vinyl: '#22c55e20',
};

export default function JobCard({ job, onClick }) {
  const color = STATUS_COLORS[job.status] ?? '#94a3b8';
  const decTypes = [...new Set((job.items ?? []).map(i => i.decorationType).filter(d => d && d !== 'None'))];
  const today = new Date().toISOString().slice(0, 10);
  const overdue = job.due && job.due < today && !['PAID', 'CANCEL'].includes(job.status);

  return (
    <div
      onClick={onClick}
      style={{
        background: 'white', borderRadius: 7, border: '1px solid #e2e8f0',
        borderLeft: `3px solid ${color}`, padding: '8px 10px', cursor: 'pointer',
        marginBottom: 6, boxShadow: '0 1px 2px rgba(0,0,0,.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700 }}>#{job.id}</span>
        <span style={{ fontSize: 11, color: '#0f172a', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{job.customer}</span>
      </div>
      {job.description && (
        <div style={{ fontSize: 10, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{job.description}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {decTypes.slice(0, 2).map(d => (
          <span key={d} style={{ fontSize: 8, background: DEC_PILL_COLORS[d] ?? '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: 4 }}>{d}</span>
        ))}
        {job.due && (
          <span style={{ fontSize: 8, color: overdue ? '#ef4444' : '#94a3b8', marginLeft: 'auto' }}>{overdue ? '⚠ ' : ''}{job.due}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>${(job.total ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create KanbanColumn.jsx**

Create `frontend/src/components/jobs/KanbanColumn.jsx`:

```jsx
import JobCard from './JobCard';

const STATUS_COLORS = {
  QUOTE: '#f59e0b', ORDER: '#3b82f6', 'In Progress': '#8b5cf6',
  PROOF: '#06b6d4', PRINT: '#ec4899', FINISH: '#10b981',
  INVOICE: '#a855f7', PAID: '#64748b', CANCEL: '#ef4444',
};

export default function KanbanColumn({ status, jobs, onJobClick }) {
  const color = STATUS_COLORS[status] ?? '#94a3b8';
  return (
    <div style={{ minWidth: 196, maxWidth: 196, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 9px', background: '#f8fafc', border: '1px solid #e2e8f0', borderBottom: 'none', borderRadius: '7px 7px 0 0' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', flex: 1 }}>{status}</span>
        <span style={{ fontSize: 10, background: `${color}20`, color, padding: '0 5px', borderRadius: 8, fontWeight: 700 }}>{jobs.length}</span>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderTop: `2px solid ${color}`, borderRadius: '0 0 7px 7px', padding: '6px 6px', overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
        {jobs.map(job => (
          <JobCard key={job.id} job={job} onClick={() => onJobClick(job)} />
        ))}
        {jobs.length === 0 && (
          <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>—</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create JobsBoard.jsx**

Create `frontend/src/components/jobs/JobsBoard.jsx`:

```jsx
import { useState } from 'react';
import KanbanColumn from './KanbanColumn';

const STATUSES = ['QUOTE', 'ORDER', 'In Progress', 'PROOF', 'PRINT', 'FINISH', 'INVOICE', 'PAID'];

const STATUS_COLORS = {
  QUOTE: '#f59e0b', ORDER: '#3b82f6', 'In Progress': '#8b5cf6',
  PROOF: '#06b6d4', PRINT: '#ec4899', FINISH: '#10b981',
  INVOICE: '#a855f7', PAID: '#64748b', CANCEL: '#ef4444',
};

export default function JobsBoard({ jobs, onJobClick, currentUser }) {
  const [view, setView] = useState('board'); // 'board' | 'list'
  const [filter, setFilter] = useState('all'); // 'all' | 'today' | 'overdue' | 'mine'
  const [search, setSearch] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  const filtered = jobs.filter(job => {
    if (filter === 'today') return job.due === today && !['PAID','CANCEL'].includes(job.status);
    if (filter === 'overdue') return job.due && job.due < today && !['PAID','CANCEL'].includes(job.status);
    if (filter === 'mine') return job.assignedTo === currentUser?.username;
    return true;
  }).filter(job => {
    if (!search) return true;
    const q = search.toLowerCase();
    return job.id.toLowerCase().includes(q) || (job.customer ?? '').toLowerCase().includes(q);
  });

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        {['all', 'today', 'overdue', 'mine'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontSize: 10, padding: '3px 9px', borderRadius: 5, border: '1px solid #e2e8f0',
              background: filter === f ? '#eff6ff' : 'white', borderColor: filter === f ? '#bfdbfe' : '#e2e8f0',
              color: filter === f ? '#3b82f6' : '#64748b', fontWeight: filter === f ? 600 : 400, cursor: 'pointer',
            }}
          >
            {f === 'all' ? 'All' : f === 'today' ? 'Due Today' : f === 'overdue' ? 'Overdue' : 'Mine'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search jobs…"
          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', outline: 'none', width: 160 }}
        />
        {/* View toggle */}
        <button onClick={() => setView('board')} title="Board" style={{ padding: '4px 8px', borderRadius: '5px 0 0 5px', border: '1px solid #e2e8f0', background: view === 'board' ? '#eff6ff' : 'white', cursor: 'pointer', fontSize: 13, color: view === 'board' ? '#3b82f6' : '#64748b' }}>⊞</button>
        <button onClick={() => setView('list')} title="List" style={{ padding: '4px 8px', borderRadius: '0 5px 5px 0', border: '1px solid #e2e8f0', borderLeft: 'none', background: view === 'list' ? '#eff6ff' : 'white', cursor: 'pointer', fontSize: 13, color: view === 'list' ? '#3b82f6' : '#64748b' }}>☰</button>
      </div>

      {view === 'board' ? (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
          {STATUSES.map(status => (
            <KanbanColumn
              key={status}
              status={status}
              jobs={filtered.filter(j => j.status === status)}
              onJobClick={onJobClick}
            />
          ))}
        </div>
      ) : (
        /* List view */
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 9, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 120px 80px 80px 80px', padding: '7px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>
            <span>JOB #</span><span>CUSTOMER</span><span>STATUS</span><span>DEC</span><span>TOTAL</span><span>DUE</span>
          </div>
          {filtered.map(job => {
            const color = STATUS_COLORS[job.status] ?? '#94a3b8';
            const dec = [...new Set((job.items ?? []).map(i => i.decorationType).filter(d => d && d !== 'None'))][0] ?? '—';
            return (
              <div key={job.id} onClick={() => onJobClick(job)} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 120px 80px 80px 80px', padding: '8px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 12 }}>
                <span style={{ color: '#3b82f6', fontWeight: 600 }}>#{job.id}</span>
                <span style={{ color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.customer}</span>
                <span><span style={{ background: `${color}20`, color, padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>{job.status}</span></span>
                <span style={{ color: '#64748b', fontSize: 10 }}>{dec}</span>
                <span style={{ color: '#0f172a', fontWeight: 600 }}>${(job.total ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}</span>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>{job.due ?? '—'}</span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 24 }}>No jobs match this filter</div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire JobsBoard into TotalImageERP.jsx**

Add import at top of `TotalImageERP.jsx`:

```jsx
import JobsBoard from './components/jobs/JobsBoard';
```

Find the jobs module section (where `activeModule === 'jobs'` renders the existing job table/list) and add the JobsBoard at the top of that section, before the existing filter/table:

```jsx
{activeModule === 'jobs' && (
  <div>
    <JobsBoard
      jobs={filteredJobs}
      onJobClick={(job) => { setActiveJob(job); openModal('job'); }}
      currentUser={currentUser}
    />
  </div>
)}
```

Replace the entire existing jobs section with this. The existing jobs table is now superseded by JobsBoard.

- [ ] **Step 5: Verify in browser**

```bash
cd frontend && npm run dev
```

Navigate to Jobs. Expected:
- Filter chips (All / Due Today / Overdue / Mine)
- Board view shows 8 kanban columns with job cards
- List view shows dense table
- Toggle between board/list works
- Clicking a job card opens the existing job modal

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/jobs/
git commit -m "feat: Kanban jobs board with list view toggle — JobCard, KanbanColumn, JobsBoard"
```

---

## Task 8: Job Form — add Jim2 fields

**Files:**
- Modify: `frontend/src/TotalImageERP.jsx`

- [ ] **Step 1: Find job form initial state**

In `TotalImageERP.jsx`, search for the job form initial state — the `useState` or object where job fields are initialised for the create/edit form. Look for a pattern like `{ customer: '', status: 'QUOTE', ... }`.

```bash
grep -n "custRef\|priceLevel\|nameContact\|formJob\|newJobForm\|jobForm" frontend/src/TotalImageERP.jsx | head -20
```

- [ ] **Step 2: Add Jim2 fields to form initial state**

Find the job form state initialiser (will be a `useState` or `useMemo` with `custRef`, `ourRef`, etc.) and add:

```javascript
priceLevel: '',
accMgr: '',
invoiceDesc: '',
exJobRef: '',
requestedBy: '',
lockRate: false,
```

Also add these fields when populating the form from an existing job (in the edit/open handler):

```javascript
priceLevel: job.priceLevel ?? '',
accMgr: job.accMgr ?? '',
invoiceDesc: job.invoiceDesc ?? '',
exJobRef: job.exJobRef ?? '',
requestedBy: job.requestedBy ?? '',
lockRate: job.lockRate ?? false,
```

- [ ] **Step 3: Add Jim2 fields to form JSX**

In the job form modal (in TotalImageERP.jsx), find the header section where existing Jim2 fields like `cust_ref` / `custRef` are rendered. After the existing Jim2 fields block, add:

```jsx
{/* Jim2 Sprint-2 fields */}
<div className="grid grid-cols-2 gap-3 mt-3">
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">Price Level</label>
    <select
      value={form.priceLevel}
      onChange={e => setForm(f => ({ ...f, priceLevel: e.target.value }))}
      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
    >
      <option value="">— select —</option>
      {['Retail', 'Trade', 'Wholesale', 'VIP', 'Cost'].map(l => <option key={l} value={l}>{l}</option>)}
    </select>
  </div>
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">Acc Mgr</label>
    <input
      value={form.accMgr}
      onChange={e => setForm(f => ({ ...f, accMgr: e.target.value }))}
      placeholder="Initials or name"
      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
    />
  </div>
</div>
<div className="grid grid-cols-2 gap-3 mt-2">
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">Ex Job Ref</label>
    <input
      value={form.exJobRef}
      onChange={e => setForm(f => ({ ...f, exJobRef: e.target.value }))}
      placeholder="Customer PO or ref"
      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
    />
  </div>
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">Requested By</label>
    <input
      value={form.requestedBy}
      onChange={e => setForm(f => ({ ...f, requestedBy: e.target.value }))}
      placeholder="Person who placed order"
      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
    />
  </div>
</div>
<div className="mt-2">
  <label className="block text-xs font-medium text-gray-500 mb-1">Invoice Description</label>
  <textarea
    value={form.invoiceDesc}
    onChange={e => setForm(f => ({ ...f, invoiceDesc: e.target.value }))}
    rows={2}
    placeholder="Description to print on invoice"
    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
  />
</div>
<div className="flex items-center gap-2 mt-2">
  <input
    type="checkbox"
    id="lockRate"
    checked={form.lockRate}
    onChange={e => setForm(f => ({ ...f, lockRate: e.target.checked }))}
    className="rounded"
  />
  <label htmlFor="lockRate" className="text-xs text-gray-600">Lock Rate</label>
</div>
```

- [ ] **Step 4: Pass fields through to api.jobs.create / api.jobs.update**

Find where the job form submits — where `api.jobs.create(...)` or `api.jobs.update(...)` is called. Ensure the 6 new fields are passed:

```javascript
priceLevel: form.priceLevel,
accMgr: form.accMgr,
invoiceDesc: form.invoiceDesc,
exJobRef: form.exJobRef,
requestedBy: form.requestedBy,
lockRate: form.lockRate,
```

- [ ] **Step 5: Verify in browser**

Open job form modal (New Job or Edit). Expected:
- Price Level dropdown, Acc Mgr text field visible
- Ex Job Ref, Requested By text fields visible
- Invoice Description textarea visible
- Lock Rate checkbox visible
- Save and re-open — values persist

- [ ] **Step 6: Commit**

```bash
git add frontend/src/TotalImageERP.jsx
git commit -m "feat: Jim2 fields in job form — price level, acc mgr, ex job ref, requested by, invoice desc, lock rate"
```

---

## Task 9: Admin Tools Panel

**Files:**
- Create: `frontend/src/components/admin/AdminPanel.jsx`
- Create: `frontend/src/components/admin/FieldConfig.jsx`
- Create: `frontend/src/components/admin/StatusWorkflow.jsx`
- Create: `frontend/src/components/admin/PriceLevels.jsx`
- Create: `frontend/src/components/admin/DecorationTypes.jsx`

- [ ] **Step 1: Create FieldConfig.jsx**

Create `frontend/src/components/admin/FieldConfig.jsx`:

```jsx
import { useState } from 'react';

const ALL_FIELDS = [
  { key: 'price_level',  label: 'Price Level' },
  { key: 'acc_mgr',      label: 'Acc Mgr' },
  { key: 'ex_job_ref',   label: 'Ex Job Ref' },
  { key: 'requested_by', label: 'Requested By' },
  { key: 'invoice_desc', label: 'Invoice Desc' },
  { key: 'contract',     label: 'Contract' },
];

export default function FieldConfig({ config, onChange }) {
  const [fields, setFields] = useState(
    config ?? ALL_FIELDS.map(f => ({ ...f, enabled: true }))
  );

  function toggle(key) {
    const updated = fields.map(f => f.key === key ? { ...f, enabled: !f.enabled } : f);
    setFields(updated);
    onChange(updated);
  }

  function moveUp(idx) {
    if (idx === 0) return;
    const updated = [...fields];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    setFields(updated);
    onChange(updated);
  }

  function moveDown(idx) {
    if (idx === fields.length - 1) return;
    const updated = [...fields];
    [updated[idx + 1], updated[idx]] = [updated[idx], updated[idx + 1]];
    setFields(updated);
    onChange(updated);
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
        Toggle fields visible on the job form header. Drag to reorder (↑↓ to move).
      </p>
      {fields.map((f, idx) => (
        <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: '#1e293b', borderRadius: 6, marginBottom: 4 }}>
          <input type="checkbox" checked={f.enabled} onChange={() => toggle(f.key)} />
          <span style={{ flex: 1, fontSize: 12, color: f.enabled ? '#e2e8f0' : '#475569' }}>{f.label}</span>
          <button onClick={() => moveUp(idx)} style={{ fontSize: 11, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>↑</button>
          <button onClick={() => moveDown(idx)} style={{ fontSize: 11, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>↓</button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create StatusWorkflow.jsx**

Create `frontend/src/components/admin/StatusWorkflow.jsx`:

```jsx
import { useState } from 'react';

const DEFAULT_STATUSES = [
  { name: 'QUOTE',       color: '#f59e0b' },
  { name: 'ORDER',       color: '#3b82f6' },
  { name: 'In Progress', color: '#8b5cf6' },
  { name: 'PROOF',       color: '#06b6d4' },
  { name: 'PRINT',       color: '#ec4899' },
  { name: 'FINISH',      color: '#10b981' },
  { name: 'INVOICE',     color: '#a855f7' },
  { name: 'PAID',        color: '#64748b' },
];

export default function StatusWorkflow({ config, onChange }) {
  const [statuses, setStatuses] = useState(config ?? DEFAULT_STATUSES);
  const [newName, setNewName] = useState('');

  function remove(name) {
    const updated = statuses.filter(s => s.name !== name);
    setStatuses(updated);
    onChange(updated);
  }

  function add() {
    if (!newName.trim()) return;
    const updated = [...statuses, { name: newName.trim(), color: '#94a3b8' }];
    setStatuses(updated);
    onChange(updated);
    setNewName('');
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>Production workflow statuses in order.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {statuses.map(s => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#1e293b', border: `1px solid ${s.color}40`, borderRadius: 20, padding: '4px 10px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
            <span style={{ fontSize: 11, color: '#e2e8f0' }}>{s.name}</span>
            <button onClick={() => remove(s.name)} style={{ fontSize: 11, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add status…"
          style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '5px 10px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
        <button onClick={add} style={{ background: '#f59e0b', color: '#1c1404', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Add</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create PriceLevels.jsx**

Create `frontend/src/components/admin/PriceLevels.jsx`:

```jsx
import { useState } from 'react';

const DEFAULTS = [
  { name: 'Retail',     discount: 0,  isDefault: true },
  { name: 'Trade',      discount: 10, isDefault: false },
  { name: 'Wholesale',  discount: 20, isDefault: false },
  { name: 'VIP',        discount: 25, isDefault: false },
  { name: 'Cost',       discount: 50, isDefault: false },
];

export default function PriceLevels({ config, onChange }) {
  const [levels, setLevels] = useState(config ?? DEFAULTS);
  const [newName, setNewName] = useState('');
  const [newDiscount, setNewDiscount] = useState('');

  function setDefault(name) {
    const updated = levels.map(l => ({ ...l, isDefault: l.name === name }));
    setLevels(updated);
    onChange(updated);
  }

  function remove(name) {
    const updated = levels.filter(l => l.name !== name);
    setLevels(updated);
    onChange(updated);
  }

  function add() {
    if (!newName.trim()) return;
    const updated = [...levels, { name: newName.trim(), discount: parseFloat(newDiscount) || 0, isDefault: false }];
    setLevels(updated);
    onChange(updated);
    setNewName(''); setNewDiscount('');
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>Set customer price tiers and their discount from Retail.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155' }}>
            {['Level', 'Discount %', 'Default', ''].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10, color: '#64748b', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {levels.map(l => (
            <tr key={l.name} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '7px 8px', color: '#e2e8f0' }}>{l.name}</td>
              <td style={{ padding: '7px 8px', color: '#94a3b8' }}>{l.discount}%</td>
              <td style={{ padding: '7px 8px' }}>
                <input type="radio" checked={l.isDefault} onChange={() => setDefault(l.name)} />
              </td>
              <td style={{ padding: '7px 8px' }}>
                <button onClick={() => remove(l.name)} style={{ fontSize: 10, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Level name" style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '5px 10px', color: '#e2e8f0', fontSize: 11, outline: 'none' }} />
        <input value={newDiscount} onChange={e => setNewDiscount(e.target.value)} placeholder="%" style={{ width: 60, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '5px 10px', color: '#e2e8f0', fontSize: 11, outline: 'none' }} />
        <button onClick={add} style={{ background: '#f59e0b', color: '#1c1404', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Add</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create DecorationTypes.jsx**

Create `frontend/src/components/admin/DecorationTypes.jsx`:

```jsx
import { useState } from 'react';

const ALL_DEC_TYPES = ['EMB', 'TRS', 'Screen', 'DTF', 'DTG', 'Sub', 'Pad', 'Laser', 'Vinyl'];

export default function DecorationTypes({ config, onChange }) {
  const [enabled, setEnabled] = useState(config ?? new Set(ALL_DEC_TYPES));

  function toggle(type) {
    const next = new Set(enabled);
    next.has(type) ? next.delete(type) : next.add(type);
    setEnabled(next);
    onChange([...next]);
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
        Disabled types are hidden from the job form and decoration mix chart.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {ALL_DEC_TYPES.map(type => {
          const on = enabled.has(type);
          return (
            <div
              key={type}
              onClick={() => toggle(type)}
              style={{
                padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: on ? '#f59e0b20' : '#1e293b',
                color: on ? '#fbbf24' : '#475569',
                border: `1px solid ${on ? '#f59e0b40' : '#334155'}`,
              }}
            >
              {type}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create AdminPanel.jsx**

Create `frontend/src/components/admin/AdminPanel.jsx`:

```jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../../api';
import FieldConfig from './FieldConfig';
import StatusWorkflow from './StatusWorkflow';
import PriceLevels from './PriceLevels';
import DecorationTypes from './DecorationTypes';
import MigrationWizard from './MigrationWizard';

const TABS = [
  { id: 'fields',      label: 'Job Fields' },
  { id: 'statuses',    label: 'Status Workflow' },
  { id: 'prices',      label: 'Price Levels' },
  { id: 'decorations', label: 'Decoration Types' },
  { id: 'migration',   label: 'Jim2 Migration' },
];

function useAdminSetting(key) {
  return useQuery({
    queryKey: ['admin-setting', key],
    queryFn: () => api.adminSettings.get(key),
    staleTime: 60_000,
  });
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('fields');
  const queryClient = useQueryClient();

  const { data: fieldSettingRaw } = useAdminSetting('field_config');
  const { data: statusSettingRaw } = useAdminSetting('status_config');
  const { data: priceSettingRaw } = useAdminSetting('price_levels');
  const { data: decSettingRaw } = useAdminSetting('dec_types');

  function parseJson(raw, fallback) {
    try { return raw?.value ? JSON.parse(raw.value) : null; } catch { return fallback; }
  }

  function saveKey(key) {
    return async (value) => {
      await api.adminSettings.set(key, value);
      queryClient.invalidateQueries(['admin-setting', key]);
    };
  }

  return (
    <div style={{ background: '#0f172a', minHeight: '100%', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24' }}>Admin Tools</div>
        <div style={{ fontSize: 11, color: '#475569' }}>System configuration · Admin only</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #1e293b', marginBottom: 20 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #f59e0b' : '2px solid transparent',
              background: 'transparent', color: activeTab === tab.id ? '#fbbf24' : '#64748b',
              borderRadius: '4px 4px 0 0',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {activeTab === 'fields' && (
          <FieldConfig config={parseJson(fieldSettingRaw, null)} onChange={saveKey('field_config')} />
        )}
        {activeTab === 'statuses' && (
          <StatusWorkflow config={parseJson(statusSettingRaw, null)} onChange={saveKey('status_config')} />
        )}
        {activeTab === 'prices' && (
          <PriceLevels config={parseJson(priceSettingRaw, null)} onChange={saveKey('price_levels')} />
        )}
        {activeTab === 'decorations' && (
          <DecorationTypes config={parseJson(decSettingRaw, null)} onChange={v => saveKey('dec_types')(v)} />
        )}
        {activeTab === 'migration' && <MigrationWizard />}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire AdminPanel into TotalImageERP.jsx**

Add import at top of `TotalImageERP.jsx`:

```jsx
import AdminPanel from './components/admin/AdminPanel';
```

In the main content render area (inside the Shell's children), add an `adminMode` conditional at the very top, before the module switch:

```jsx
{adminMode ? (
  <AdminPanel />
) : (
  <>
    {/* ... existing module content ... */}
  </>
)}
```

- [ ] **Step 7: Verify admin panel in browser**

Log in as admin user. Click the amber lock icon in the rail. Expected:
- Content area switches to dark `#0f172a` Admin Tools panel
- 5 tabs: Job Fields / Status Workflow / Price Levels / Decoration Types / Jim2 Migration
- Toggling fields persists (saved to backend)
- Clicking lock icon again returns to normal dashboard
- Non-admin users: lock icon not visible, admin panel inaccessible

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/admin/AdminPanel.jsx frontend/src/components/admin/FieldConfig.jsx frontend/src/components/admin/StatusWorkflow.jsx frontend/src/components/admin/PriceLevels.jsx frontend/src/components/admin/DecorationTypes.jsx
git commit -m "feat: admin panel — field config, status workflow, price levels, decoration types"
```

---

## Task 10: Jim2 Migration Wizard

**Files:**
- Create: `frontend/src/components/admin/MigrationWizard.jsx`

The wizard reuses the existing `api.importData` endpoints (`/import/customers`, `/import/inventory`, `/import/jobs`) already wired in `api.js`.

- [ ] **Step 1: Create MigrationWizard.jsx**

Create `frontend/src/components/admin/MigrationWizard.jsx`:

```jsx
import { useState } from 'react';
import * as api from '../../api';

const STEPS = [
  {
    id: 1,
    title: 'Export from Jim2',
    description: 'In Jim2, go to each module and export as CSV:',
    instructions: [
      '1. CardFiles: Jim2 → CardFiles → File → Export → CSV (save as cardfiles.csv)',
      '2. Stock/Items: Jim2 → Stock → Items → File → Export → CSV (save as items.csv)',
      '3. Jobs: Jim2 → Jobs → File → Export → CSV (save as jobs.csv)',
    ],
    upload: null,
  },
  {
    id: 2,
    title: 'Import Card Files',
    description: 'Upload the cardfiles.csv exported from Jim2. Maps to customers and ship-to addresses.',
    upload: { key: 'customers', label: 'cardfiles.csv', handler: (file) => api.importData.customers(file) },
  },
  {
    id: 3,
    title: 'Import Stock / Items',
    description: 'Upload the items.csv. Maps to your inventory catalogue.',
    upload: { key: 'inventory', label: 'items.csv', handler: (file) => api.importData.inventory(file) },
  },
  {
    id: 4,
    title: 'Import Jobs',
    description: 'Upload the jobs.csv. Maps to jobs and job line items.',
    upload: { key: 'jobs', label: 'jobs.csv', handler: (file) => api.importData.jobs(file) },
  },
  {
    id: 5,
    title: 'Validate & Confirm',
    description: 'Review imported row counts and errors below.',
    upload: null,
  },
];

export default function MigrationWizard() {
  const [step, setStep] = useState(1);
  const [results, setResults] = useState({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const currentStep = STEPS.find(s => s.id === step);

  async function handleUpload(e, stepDef) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const result = await stepDef.upload.handler(file);
      setResults(r => ({ ...r, [stepDef.upload.key]: result }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
        {STEPS.map((s, idx) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: idx < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
              background: step > s.id ? '#10b981' : step === s.id ? '#f59e0b' : '#1e293b',
              color: step > s.id ? 'white' : step === s.id ? '#1c1404' : '#64748b',
              border: `1px solid ${step >= s.id ? 'transparent' : '#334155'}`,
            }}>
              {step > s.id ? '✓' : s.id}
            </div>
            {idx < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, background: step > s.id ? '#10b981' : '#334155', margin: '0 6px' }} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div style={{ background: '#1e293b', borderRadius: 8, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', marginBottom: 6 }}>{currentStep.title}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>{currentStep.description}</div>

        {currentStep.instructions && (
          <div style={{ background: '#0f172a', borderRadius: 6, padding: 12, marginBottom: 12 }}>
            {currentStep.instructions.map((line, i) => (
              <div key={i} style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{line}</div>
            ))}
          </div>
        )}

        {currentStep.upload && (
          <div>
            <label style={{ display: 'inline-block', cursor: uploading ? 'not-allowed' : 'pointer' }}>
              <input
                type="file"
                accept=".csv"
                disabled={uploading}
                onChange={e => handleUpload(e, currentStep)}
                style={{ display: 'none' }}
              />
              <div style={{
                padding: '8px 18px', background: uploading ? '#334155' : '#f59e0b', color: uploading ? '#64748b' : '#1c1404',
                borderRadius: 7, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                {uploading ? 'Uploading…' : `Upload ${currentStep.upload.label}`}
              </div>
            </label>
            {results[currentStep.upload.key] && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#10b981' }}>
                ✓ Imported: {results[currentStep.upload.key].imported ?? '?'} rows
                {results[currentStep.upload.key].errors?.length > 0 && (
                  <span style={{ color: '#f59e0b', marginLeft: 8 }}>{results[currentStep.upload.key].errors.length} warnings</span>
                )}
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div>
            {Object.entries(results).map(([key, r]) => (
              <div key={key} style={{ display: 'flex', gap: 10, marginBottom: 6, fontSize: 11 }}>
                <span style={{ color: '#94a3b8', width: 80 }}>{key}</span>
                <span style={{ color: '#10b981' }}>{r.imported ?? 0} imported</span>
                {r.errors?.length > 0 && <span style={{ color: '#f59e0b' }}>{r.errors.length} warnings</span>}
              </div>
            ))}
            {Object.keys(results).length === 0 && (
              <div style={{ fontSize: 11, color: '#64748b' }}>No data imported yet. Complete steps 2–4 first.</div>
            )}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#ef4444', background: '#1f0707', padding: '6px 10px', borderRadius: 5 }}>
            Error: {error}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button
          onClick={() => setStep(s => Math.max(1, s - 1))}
          disabled={step === 1}
          style={{ padding: '7px 16px', background: '#1e293b', border: '1px solid #334155', borderRadius: 7, color: step === 1 ? '#334155' : '#94a3b8', fontSize: 12, cursor: step === 1 ? 'not-allowed' : 'pointer' }}
        >
          ← Back
        </button>
        {step < 5 && (
          <button
            onClick={() => setStep(s => s + 1)}
            style={{ padding: '7px 16px', background: '#f59e0b', border: 'none', borderRadius: 7, color: '#1c1404', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify Migration Wizard in browser**

Open Admin Tools → Jim2 Migration tab. Expected:
- 5-step progress indicator visible
- Step 1 shows Jim2 export instructions
- Steps 2–4 show file upload buttons
- Uploading a CSV shows imported row count
- Step 5 shows summary of all imports

- [ ] **Step 3: Run full backend test suite**

```bash
cd backend && python -m pytest --no-cov -q
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/MigrationWizard.jsx
git commit -m "feat: Jim2 migration wizard — 5-step CSV import for card files, stock, and jobs"
```

---

## Self-Review Checklist

- [x] **Spec §3 App Shell**: Covered in Tasks 4–5 (Rail, LabelPanel, Topbar, Shell, wired)
- [x] **Spec §4 Dashboard**: Covered in Task 6 (KpiStrip, ActivityFeed, DecMixChart, kanban preview strip)
- [x] **Spec §5 Kanban Jobs**: Covered in Task 7 (JobCard, KanbanColumn, JobsBoard + list toggle)
- [x] **Spec §6 Jim2 fields**: Covered in Tasks 1–3 (migration, schema, api.js) and Task 8 (form UI)
- [x] **Spec §7 Admin Panel**: Covered in Task 9 (AdminPanel + 4 sub-components)
- [x] **Spec §7 Migration Wizard**: Covered in Task 10 (MigrationWizard)
- [x] **Spec §8 lock_rate**: Included in Task 1 migration, Task 3 api.js, Task 8 form checkbox
- [x] **No placeholders**: All steps have concrete code
- [x] **Type consistency**: `priceLevel`/`price_level` used consistently; `adminSettings.get/set` used in AdminPanel
- [x] **Migration head**: `o9p0q1r2s3t4` → `n8o9p0q1r2s3` ✓

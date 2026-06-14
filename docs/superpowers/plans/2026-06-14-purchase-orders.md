# Purchase Orders Module Migration Plan (Phase 2e)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Purchase Orders list experience out of `renderPurchaseOrders` onto the `ui/` primitives — a `POModule` with a dense KpiTile strip, a status filter row, search, and a DataGrid list — while leaving the existing inline goods-receipt panel (`selectedPO`) wired to the monolith, exactly as the Jobs migration left the job detail branch in place.

**Architecture:** New `frontend/src/modules/purchase-orders/`, mirroring `modules/jobs/`. `POModule` is controlled: the monolith passes `purchaseOrders` (its existing query), the `statusFilter`/`search` state, and callbacks. Filtering moves to a pure `poFilters.js` (unit-testable). The KPI strip and status filter row become primitives. **The inline goods-receipt panel (`selectedPO` + `receiveQtys` + `receivePO`) stays in the monolith** — clicking a list row calls `onSelectPO`, the monolith renders the receive panel below `<POModule>` unchanged. The PO create/edit modal (`modalType === 'po'`) and the receive flow are NOT touched.

**Tech Stack:** React 18 + Vite, `ui/` primitives (DataGrid, KpiTile, Button, StatusBadge), vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-06-11-ui-redesign-dense-jim2-design.md` §3 (Purchase Orders, same list/detail pattern as Jobs).

---

## Codebase facts (verified 2026-06-14 — do not re-derive)

- `renderPurchaseOrders()` spans TotalImageERP.jsx:3260–~3491. Dispatched at the router `{!loading && activeModule === 'purchase-orders' && renderPurchaseOrders()}`. Structure: KPI strip (3 tiles, each `onClick` sets a status filter) → status filter button row → search + Export + New PO buttons → flat `<table>` of POs (row `onClick={()=>setSelectedPO(isSel?null:po)}`) → **inline receive panel** rendered when `selectedPO` is set (line-items with `receiveQtys` inputs + a "receive" button calling `receivePO(selectedPO)`).
- PO list query (monolith, ~line 717): `useQuery({ queryKey: ['purchaseOrders'], queryFn: api.purchaseOrders.list, ... })`. `POModule` receives `purchaseOrders` as a prop — no new query.
- Monolith state/handlers (all stay in the monolith): `poStatusFilter`/`setPoStatusFilter` (default `'all'`, ~line 781), `searchTerm`/`setSearchTerm`, `selectedPO`/`setSelectedPO`, `receiveQtys`/`setReceiveQtys`, `receivePO`, `deletePO`, `openModal('po')`, `exportToCSV`.
- `normalizePO` fields: `id, supplier, supplierCode, status, date, expectedDate, total, notes, items[{ id, sku, description, qtyOrdered, qtyReceived, unitCost, total }]`.
- PO statuses: `Draft, Sent, Partial, Received, Cancelled`. KPI groupings in the current code: Draft count = `status==='Draft'`; "Awaiting Receipt" = `['Sent','Partial'].includes(status)`.
- `ui/` primitives: `DataGrid` (`columns`, `rows`, `rowKey`, `onRowClick`, `selectedKey`, `emptyText`, `maxHeight`), `KpiTile` (`label`, `value`, `sub`, `tone`), `Button` (`variant`, `size`), `StatusBadge` (`status`) — note StatusBadge's colour map is for JOB statuses; PO statuses differ, so use a small local PO status colour or a plain coloured label, do NOT reuse StatusBadge for PO statuses. `T` tokens at `frontend/src/ui/tokens.js`.
- Tests: `cd frontend && npm test` (56 green). Build: `npm run build`. PostToolUse `check-sql-files.py` hook error is a broken machine-local hook — ignore; writes succeed.
- Commit style: conventional commits, no Co-Authored-By.

## File Map

| File | Responsibility |
|---|---|
| `frontend/src/modules/purchase-orders/poFilters.js` | Create — pure `filterPOs`, `PO_STATUSES`, `EMPTY_PO_FILTERS`, `poCounts` |
| `frontend/src/modules/purchase-orders/POList.jsx` | Create — DataGrid list (PO#, Supplier, Status, Date, Expected, Total) |
| `frontend/src/modules/purchase-orders/POModule.jsx` | Create — KpiTile strip + status row + search + New/Export + POList (controlled) |
| `frontend/src/TotalImageERP.jsx` | Modify — replace the list/filter/KPI portion of renderPurchaseOrders with `<POModule>`; keep the receive panel |
| `frontend/src/modules/purchase-orders/__tests__/*.test.jsx` | Create — per-task tests |

---

### Task 1: poFilters + POList

**Files:**
- Create: `frontend/src/modules/purchase-orders/poFilters.js`
- Create: `frontend/src/modules/purchase-orders/POList.jsx`
- Test: `frontend/src/modules/purchase-orders/__tests__/POList.test.jsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/modules/purchase-orders/__tests__/POList.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import POList from '../POList';
import { filterPOs, poCounts, EMPTY_PO_FILTERS } from '../poFilters';

const pos = [
  { id: 'PO-1001', supplier: 'AS Colour', supplierCode: 'ASC', status: 'Draft', date: '01/06/2026', expectedDate: '10/06/2026', total: 500 },
  { id: 'PO-1002', supplier: 'Biz Collection', supplierCode: 'BIZ', status: 'Sent', date: '02/06/2026', expectedDate: '12/06/2026', total: 1200 },
  { id: 'PO-1003', supplier: 'AS Colour', supplierCode: 'ASC', status: 'Received', date: '03/06/2026', expectedDate: '09/06/2026', total: 900 },
];

test('filterPOs: search matches id/supplier/code; status narrows', () => {
  expect(filterPOs(pos, { ...EMPTY_PO_FILTERS, search: 'as colour' })).toHaveLength(2);
  expect(filterPOs(pos, { ...EMPTY_PO_FILTERS, search: 'PO-1002' })).toHaveLength(1);
  expect(filterPOs(pos, { ...EMPTY_PO_FILTERS, status: 'Draft' })).toHaveLength(1);
});

test('poCounts: total, draft, awaitingReceipt (Sent+Partial)', () => {
  const c = poCounts(pos);
  expect(c.total).toBe(3);
  expect(c.draft).toBe(1);
  expect(c.awaitingReceipt).toBe(1); // only the Sent one
});

test('POList renders rows, money, and fires onSelect', () => {
  const onSelect = vi.fn();
  render(<POList pos={pos} selectedId={null} onSelect={onSelect} />);
  expect(screen.getByText('PO-1001')).toBeInTheDocument();
  expect(screen.getByText('$1,200.00')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Biz Collection'));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'PO-1002' }));
});
```

- [ ] **Step 2: Run to verify failure** — `cd "/d/Total Image Group/frontend" && npm test`

- [ ] **Step 3: Create poFilters.js**

```js
export const PO_STATUSES = ['Draft', 'Sent', 'Partial', 'Received', 'Cancelled'];

export const EMPTY_PO_FILTERS = { search: '', status: 'all' };

export function filterPOs(pos, f) {
  const q = (f.search || '').toLowerCase();
  return (pos || []).filter(po => {
    const matchSearch = !q ||
      String(po.id).toLowerCase().includes(q) ||
      (po.supplier || '').toLowerCase().includes(q) ||
      (po.supplierCode || '').toLowerCase().includes(q);
    const matchStatus = f.status === 'all' || po.status === f.status;
    return matchSearch && matchStatus;
  });
}

export function poCounts(pos) {
  const list = pos || [];
  return {
    total: list.length,
    draft: list.filter(p => p.status === 'Draft').length,
    awaitingReceipt: list.filter(p => ['Sent', 'Partial'].includes(p.status)).length,
  };
}
```

- [ ] **Step 4: Create POList.jsx**

```jsx
import DataGrid from '../../ui/DataGrid';
import { T } from '../../ui/tokens';

const money = (v) => `$${(Number(v) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// PO statuses have their own palette (distinct from job StatusBadge).
const PO_STATUS_COLOR = {
  Draft: T.textMuted, Sent: T.accentStrong, Partial: '#b45309',
  Received: T.ok, Cancelled: T.danger,
};

const COLUMNS = [
  { key: 'id', label: 'PO#', width: 100, render: (p) => <span style={{ fontWeight: 700, color: T.accentStrong }}>{p.id}</span> },
  { key: 'supplier', label: 'Supplier' },
  { key: 'status', label: 'Status', width: 90, render: (p) => (
      <span style={{ color: PO_STATUS_COLOR[p.status] || T.textMuted, fontWeight: 600 }}>{p.status}</span>
    ) },
  { key: 'date', label: 'Date', width: 90 },
  { key: 'expectedDate', label: 'Expected', width: 90 },
  { key: 'total', label: 'Total', width: 100, align: 'right', render: (p) => money(p.total) },
];

export default function POList({ pos, selectedId, onSelect }) {
  return (
    <DataGrid
      columns={COLUMNS}
      rows={pos}
      rowKey="id"
      selectedKey={selectedId}
      onRowClick={onSelect}
      emptyText="No purchase orders match"
    />
  );
}
```

- [ ] **Step 5: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/modules/purchase-orders/poFilters.js frontend/src/modules/purchase-orders/POList.jsx frontend/src/modules/purchase-orders/__tests__/POList.test.jsx
git commit -m "feat: PO filters + POList on DataGrid"
```

---

### Task 2: POModule (KPI strip + status row + list)

**Files:**
- Create: `frontend/src/modules/purchase-orders/POModule.jsx`
- Test: `frontend/src/modules/purchase-orders/__tests__/POModule.test.jsx`

POModule is controlled: parent owns `statusFilter`/`search`/`selectedId` and passes callbacks. The KPI tiles and status buttons call `onStatusChange`; New/Export call their callbacks.

- [ ] **Step 1: Write failing test**

Create `frontend/src/modules/purchase-orders/__tests__/POModule.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import POModule from '../POModule';
import { EMPTY_PO_FILTERS } from '../poFilters';

const pos = [
  { id: 'PO-1', supplier: 'AS Colour', supplierCode: 'ASC', status: 'Draft', date: '01/06/2026', expectedDate: '10/06/2026', total: 500 },
  { id: 'PO-2', supplier: 'Biz', supplierCode: 'BIZ', status: 'Sent', date: '02/06/2026', expectedDate: '12/06/2026', total: 1200 },
];
const base = {
  purchaseOrders: pos,
  filters: EMPTY_PO_FILTERS,
  onFilterChange: vi.fn(),
  selectedId: null,
  onSelectPO: vi.fn(),
  onNewPO: vi.fn(),
  onExport: vi.fn(),
};

test('shows KPI counts and all rows by default', () => {
  render(<POModule {...base} />);
  expect(screen.getByText('PO-1')).toBeInTheDocument();
  expect(screen.getByText('PO-2')).toBeInTheDocument();
});

test('status filter narrows the list and a status button fires onFilterChange', () => {
  render(<POModule {...base} filters={{ ...EMPTY_PO_FILTERS, status: 'Draft' }} />);
  expect(screen.getByText('PO-1')).toBeInTheDocument();
  expect(screen.queryByText('PO-2')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sent' }));
  expect(base.onFilterChange).toHaveBeenCalledWith('status', 'Sent');
});

test('row click fires onSelectPO; New PO + Export fire their callbacks', () => {
  render(<POModule {...base} />);
  fireEvent.click(screen.getByText('AS Colour'));
  expect(base.onSelectPO).toHaveBeenCalledWith(expect.objectContaining({ id: 'PO-1' }));
  fireEvent.click(screen.getByText('New PO'));
  expect(base.onNewPO).toHaveBeenCalled();
  fireEvent.click(screen.getByText('Export'));
  expect(base.onExport).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`

- [ ] **Step 3: Create POModule.jsx**

```jsx
import { useMemo } from 'react';
import { Search, Plus, Download } from 'lucide-react';
import KpiTile from '../../ui/KpiTile';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import POList from './POList';
import { filterPOs, poCounts, PO_STATUSES } from './poFilters';

export default function POModule({
  purchaseOrders = [], filters, onFilterChange,
  selectedId, onSelectPO, onNewPO, onExport,
}) {
  const filtered = useMemo(() => filterPOs(purchaseOrders, filters), [purchaseOrders, filters]);
  const counts = useMemo(() => poCounts(purchaseOrders), [purchaseOrders]);

  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 10, border: `1px solid ${T.hairline}`, borderRadius: T.radius, overflow: 'hidden', width: 'fit-content' }}>
        <KpiTile label="TOTAL POs" value={counts.total} />
        <KpiTile label="DRAFT" value={counts.draft} tone="accent" />
        <KpiTile label="AWAITING RECEIPT" value={counts.awaitingReceipt} tone="accent" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <Button size="sm" variant={filters.status === 'all' ? 'primary' : 'secondary'} onClick={() => onFilterChange('status', 'all')}>All</Button>
        {PO_STATUSES.map(s => (
          <Button key={s} size="sm" variant={filters.status === s ? 'primary' : 'secondary'} onClick={() => onFilterChange('status', s)}>{s}</Button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: '4px 8px', width: 180 }}>
          <Search size={12} color={T.textFaint} />
          <input
            value={filters.search}
            onChange={e => onFilterChange('search', e.target.value)}
            placeholder="Search POs…"
            style={{ border: 'none', outline: 'none', fontSize: T.fsGrid, width: '100%', fontFamily: T.font, color: T.text }}
          />
        </div>
        <Button size="sm" variant="secondary" onClick={onExport}><Download size={12} /> Export</Button>
        <Button size="sm" variant="primary" onClick={onNewPO}><Plus size={12} /> New PO</Button>
      </div>

      <POList pos={filtered} selectedId={selectedId} onSelect={onSelectPO} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/modules/purchase-orders/POModule.jsx frontend/src/modules/purchase-orders/__tests__/POModule.test.jsx
git commit -m "feat: POModule — KPI strip, status filter, search, list (controlled)"
```

---

### Task 3: Wire POModule into the monolith + verification

**Files:**
- Modify: `frontend/src/TotalImageERP.jsx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add import** (near other module imports):

```js
import POModule from './modules/purchase-orders/POModule';
```

- [ ] **Step 2: Replace the list/filter/KPI portion of renderPurchaseOrders**

In `renderPurchaseOrders`, replace everything from the start of its returned JSX DOWN TO (but NOT including) the `{selectedPO && (...)}` inline receive panel with a `<POModule>` usage. Keep the receive panel exactly as-is. The result should look like:

```jsx
  const renderPurchaseOrders = () => {
    return (
      <>
        <POModule
          purchaseOrders={purchaseOrders}
          filters={{ search: searchTerm, status: poStatusFilter }}
          onFilterChange={(key, value) => { if (key === 'search') setSearchTerm(value); else setPoStatusFilter(value); }}
          selectedId={selectedPO?.id ?? null}
          onSelectPO={(po) => setSelectedPO(cur => (cur?.id === po.id ? null : po))}
          onNewPO={() => openModal('po')}
          onExport={() => exportToCSV(purchaseOrders, 'purchase-orders')}
        />
        {selectedPO && (
          /* ...EXISTING inline receive panel, unchanged... */
        )}
      </>
    );
  };
```

CAUTION: Read the current `renderPurchaseOrders` fully first. Preserve the `{selectedPO && (...)}` receive panel verbatim (it contains `receiveQtys`, the line-items table, and `receivePO`). Only the KPI strip + status row + search/buttons + the flat PO `<table>` are removed (POModule replaces them). If `statusMeta` or other helpers defined at the top of renderPurchaseOrders are used ONLY by the removed list code, delete them; if used by the receive panel, keep them.

- [ ] **Step 3: Verify**

- `grep -n "renderPurchaseOrders" frontend/src/TotalImageERP.jsx` still shows the function (it's kept, now thinner) and its dispatch.
- The old flat PO `<table>` markup is gone from renderPurchaseOrders; the receive panel remains.
- `cd frontend && npm test` — all green; `cd frontend && npm run build` — succeeds.
- Dev-server smoke (backend on :8000, `npm run dev`): Purchase Orders tab → KpiTile strip + status buttons + search + DataGrid list; clicking a status button filters; clicking a row opens the inline receive panel below; New PO opens the PO modal; Export works; no console errors.

- [ ] **Step 4: Update CLAUDE.md** "Key architecture": append after the stock-module bullet:

```markdown
- `frontend/src/modules/purchase-orders/` — Purchase Orders module (POModule list + KPI/filter, poFilters); inline goods-receipt panel stays in the monolith
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/TotalImageERP.jsx CLAUDE.md
git commit -m "feat: PO list/filter/KPI on POModule primitives; receive panel unchanged"
```

---

## Known deferrals

- **Inline goods-receipt panel** stays old-styled (wired to monolith `selectedPO`/`receiveQtys`/`receivePO`). Re-skinning it onto primitives is a follow-up; it works as-is.
- **PO create/edit modal** (`modalType === 'po'`) stays as-is, to be migrated with the other forms in the job-form phase pattern.
- **Status filter** is a single-select button row (PO only filters by status + search) — simpler than Jobs' FilterBar; no chip/add-menu needed.

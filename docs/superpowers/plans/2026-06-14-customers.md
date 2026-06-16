# Customers Module Migration Plan (Phase 2f)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Customers list experience out of `renderCustomers` onto the `ui/` primitives — a `CustomersModule` with a KpiTile strip, search, and a DataGrid master list — while leaving the existing customer detail panel (`selectedCustomer` + overview/jobs/aging/statement tabs) wired to the monolith, exactly as Jobs left its detail branch and PO left its receive panel.

**Architecture:** New `frontend/src/modules/customers/`, mirroring `modules/purchase-orders/`. `CustomersModule` is controlled: the monolith passes `customers` and `jobs` (its existing queries), the `search` state, `selectedId`, and callbacks. Per-customer aggregates (outstanding AR, revenue) are computed LIVE from the `jobs` array — moved to a pure `customerAggregates.js` (unit-testable). The KPI strip and search become primitives; the master list becomes a DataGrid. **The `selectedCustomer` detail panel (header + Account KPIs + credit-limit bar + overview/jobs/aging/statement tabs, with the statement PDF link) stays in the monolith** — clicking a list row calls `onSelectCustomer`, the monolith renders the detail panel beside/below `<CustomersModule>` unchanged. The customer create/edit modal (`modalType === 'customer'`) is NOT touched.

**Tech Stack:** React 18 + Vite, `ui/` primitives (DataGrid, KpiTile, Button), vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-06-11-ui-redesign-dense-jim2-design.md` §3 (CardFiles/Customers, same list/detail pattern as Jobs).

---

## Codebase facts (verified 2026-06-14 — do not re-derive)

- `renderCustomers()` spans TotalImageERP.jsx:2688–~3078. Dispatched at the router `{!loading && activeModule === 'customers' && renderCustomers()}`. Structure: header (Export + New Customer buttons) → KPI strip (4 tiles) → search → **table + detail** two-pane: left customer `<table>` (3 cols: Customer, Balance, Credit; row `onClick={() => { setSelectedCustomer(c); setCustDetailTab('overview'); }}`) and right detail panel (`!selectedCustomer ? <empty> : <detail with header + Account KPIs + credit-limit bar + tabs ['overview','jobs','aging','statement']>`).
- Customers list query (monolith, ~line 716): `useQuery({ queryKey: ['customers'], queryFn: api.customers.list, ... })`. Jobs query also in scope as `jobs`. `CustomersModule` receives both as props — no new queries.
- Live per-customer aggregates (defined inside renderCustomers, ~line 2697):
  - `custJobs = (c) => jobs.filter(j => j.customerId === c.id)`
  - `custOutstanding = (c) => custJobs(c).reduce((s, j) => s + parseFloat(j.balanceDue || 0), 0)`
  - `custRevenue = (c) => custJobs(c).reduce((s, j) => s + parseFloat(j.total || 0), 0)`
- KPI strip values (verbatim, to port):
  - Total Customers = `customers.length`, sub = `${customers.filter(c=>c.status==='Active'||!c.status).length} active`
  - Total Revenue = `customers.reduce((s,c)=>s+custRevenue(c),0)` → `$` + `toLocaleString('en-AU',{maximumFractionDigits:0})`
  - Outstanding AR = `customers.reduce((s,c)=>s+custOutstanding(c),0)` → same format
  - Over Credit Limit = `customers.filter(c=>c.creditLimit>0 && custOutstanding(c)>c.creditLimit).length`
- Customer table list columns (current): **Customer** (avatar initial + `c.name` + `c.id`), **Balance** (`custOutstanding(c)`, right-aligned), **Credit** (`c.creditLimit`). Row search filter: `name | email | id | contact` contains `searchTerm`.
- `normalizeCustomer` fields: `id, name, contact, email, phone, mobile, address, abn, accountType, paymentTerms, creditLimit, balance, totalSpent, accountManager, status`.
- Monolith state/handlers (stay in the monolith): `selectedCustomer`/`setSelectedCustomer`, `custDetailTab`/`setCustDetailTab`, `searchTerm`/`setSearchTerm`, `deleteCustomer`, `openModal('customer')`, `exportToCSV`, the `customers` + `jobs` queries.
- `ui/` primitives: `DataGrid` (`columns`, `rows`, `rowKey`, `onRowClick`, `selectedKey`, `emptyText`, `maxHeight`), `KpiTile` (`label`, `value`, `sub`, `tone`), `Button` (`variant`, `size`). `T` tokens at `frontend/src/ui/tokens.js`.
- Tests: `cd frontend && npm test` (62 green). Build: `npm run build`. PostToolUse `check-sql-files.py` hook error is a broken machine-local hook — ignore; writes succeed.
- Commit style: conventional commits, no Co-Authored-By.

## File Map

| File | Responsibility |
|---|---|
| `frontend/src/modules/customers/customerAggregates.js` | Create — pure `custOutstanding`, `custRevenue`, `filterCustomers`, `customerKpis` |
| `frontend/src/modules/customers/CustomerList.jsx` | Create — DataGrid master list (Customer, Balance, Credit) |
| `frontend/src/modules/customers/CustomersModule.jsx` | Create — KpiTile strip + search + New/Export + CustomerList (controlled) |
| `frontend/src/TotalImageERP.jsx` | Modify — replace the list/KPI/search portion of renderCustomers with `<CustomersModule>`; keep the detail panel |
| `frontend/src/modules/customers/__tests__/*.test.jsx` | Create — per-task tests |

---

### Task 1: customerAggregates + CustomerList

**Files:**
- Create: `frontend/src/modules/customers/customerAggregates.js`
- Create: `frontend/src/modules/customers/CustomerList.jsx`
- Test: `frontend/src/modules/customers/__tests__/CustomerList.test.jsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/modules/customers/__tests__/CustomerList.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import CustomerList from '../CustomerList';
import { custOutstanding, custRevenue, filterCustomers, customerKpis } from '../customerAggregates';

const customers = [
  { id: 'ACME', name: 'Acme Co', email: 'a@acme.com', contact: 'Al', creditLimit: 1000, status: 'Active' },
  { id: 'BHP', name: 'BHP Group', email: 'b@bhp.com', contact: 'Bo', creditLimit: 0, status: 'Active' },
];
const jobs = [
  { customerId: 'ACME', total: 500, balanceDue: 200 },
  { customerId: 'ACME', total: 300, balanceDue: 0 },
  { customerId: 'BHP', total: 900, balanceDue: 900 },
];

test('aggregates: outstanding sums balanceDue, revenue sums total, per customer', () => {
  expect(custOutstanding(customers[0], jobs)).toBe(200);
  expect(custRevenue(customers[0], jobs)).toBe(800);
  expect(custOutstanding(customers[1], jobs)).toBe(900);
});

test('customerKpis: count, revenue, outstanding, overCredit', () => {
  const k = customerKpis(customers, jobs);
  expect(k.total).toBe(2);
  expect(k.revenue).toBe(1700);
  expect(k.outstanding).toBe(1100);
  expect(k.overCredit).toBe(0); // ACME 200 < 1000; BHP creditLimit 0 → excluded
});

test('filterCustomers matches name/email/id/contact', () => {
  expect(filterCustomers(customers, 'acme')).toHaveLength(1);
  expect(filterCustomers(customers, 'bo')).toHaveLength(1);     // contact
  expect(filterCustomers(customers, '')).toHaveLength(2);
});

test('CustomerList renders rows with balance and fires onSelect', () => {
  const onSelect = vi.fn();
  render(<CustomerList customers={customers} jobs={jobs} selectedId={null} onSelect={onSelect} />);
  expect(screen.getByText('Acme Co')).toBeInTheDocument();
  expect(screen.getByText('$200')).toBeInTheDocument();   // ACME outstanding
  fireEvent.click(screen.getByText('BHP Group'));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'BHP' }));
});
```

- [ ] **Step 2: Run to verify failure** — `cd "/d/Total Image Group/frontend" && npm test`

- [ ] **Step 3: Create customerAggregates.js**

```js
const customerJobs = (c, jobs) => (jobs || []).filter(j => j.customerId === c.id);

export const custOutstanding = (c, jobs) =>
  customerJobs(c, jobs).reduce((s, j) => s + parseFloat(j.balanceDue || 0), 0);

export const custRevenue = (c, jobs) =>
  customerJobs(c, jobs).reduce((s, j) => s + parseFloat(j.total || 0), 0);

export function filterCustomers(customers, search) {
  const q = (search || '').toLowerCase();
  if (!q) return customers || [];
  return (customers || []).filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.email || '').toLowerCase().includes(q) ||
    (c.id || '').toLowerCase().includes(q) ||
    (c.contact || '').toLowerCase().includes(q)
  );
}

export function customerKpis(customers, jobs) {
  const list = customers || [];
  return {
    total: list.length,
    active: list.filter(c => c.status === 'Active' || !c.status).length,
    revenue: list.reduce((s, c) => s + custRevenue(c, jobs), 0),
    outstanding: list.reduce((s, c) => s + custOutstanding(c, jobs), 0),
    overCredit: list.filter(c => c.creditLimit > 0 && custOutstanding(c, jobs) > c.creditLimit).length,
  };
}
```

- [ ] **Step 4: Create CustomerList.jsx**

```jsx
import DataGrid from '../../ui/DataGrid';
import { T } from '../../ui/tokens';
import { custOutstanding } from './customerAggregates';

const money0 = (v) => `$${Math.round(Number(v) || 0).toLocaleString('en-AU')}`;

export default function CustomerList({ customers, jobs, selectedId, onSelect }) {
  const columns = [
    { key: 'name', label: 'Customer', render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
          <span style={{ fontSize: 10, color: T.textFaint, fontVariantNumeric: 'tabular-nums' }}>{c.id}</span>
        </span>
      ) },
    { key: 'balance', label: 'Balance', width: 90, align: 'right', render: (c) => {
        const out = custOutstanding(c, jobs);
        return <span style={{ color: out > 0 ? T.danger : T.textMuted, fontWeight: 600 }}>{money0(out)}</span>;
      } },
    { key: 'creditLimit', label: 'Credit', width: 90, align: 'right', render: (c) => money0(c.creditLimit) },
  ];
  return (
    <DataGrid
      columns={columns}
      rows={customers}
      rowKey="id"
      selectedKey={selectedId}
      onRowClick={onSelect}
      emptyText="No customers found"
    />
  );
}
```

- [ ] **Step 5: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/modules/customers/customerAggregates.js frontend/src/modules/customers/CustomerList.jsx frontend/src/modules/customers/__tests__/CustomerList.test.jsx
git commit -m "feat: customer aggregates + CustomerList on DataGrid"
```

---

### Task 2: CustomersModule (KPI strip + search + list)

**Files:**
- Create: `frontend/src/modules/customers/CustomersModule.jsx`
- Test: `frontend/src/modules/customers/__tests__/CustomersModule.test.jsx`

Controlled: parent owns `search`/`selectedId` and passes callbacks. KPI strip from `customerKpis`; list filtered by `filterCustomers`.

- [ ] **Step 1: Write failing test**

Create `frontend/src/modules/customers/__tests__/CustomersModule.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import CustomersModule from '../CustomersModule';

const customers = [
  { id: 'ACME', name: 'Acme Co', email: 'a@acme.com', contact: 'Al', creditLimit: 1000, status: 'Active' },
  { id: 'BHP', name: 'BHP Group', email: 'b@bhp.com', contact: 'Bo', creditLimit: 0, status: 'Active' },
];
const jobs = [{ customerId: 'ACME', total: 500, balanceDue: 200 }];
const base = {
  customers, jobs, search: '',
  onSearchChange: vi.fn(), selectedId: null,
  onSelectCustomer: vi.fn(), onNewCustomer: vi.fn(), onExport: vi.fn(),
};

test('renders KPI total and all customer rows', () => {
  render(<CustomersModule {...base} />);
  expect(screen.getByText('Acme Co')).toBeInTheDocument();
  expect(screen.getByText('BHP Group')).toBeInTheDocument();
});

test('search input forwards changes; New + Export fire callbacks', () => {
  render(<CustomersModule {...base} />);
  fireEvent.change(screen.getByPlaceholderText('Search customers…'), { target: { value: 'acme' } });
  expect(base.onSearchChange).toHaveBeenCalledWith('acme');
  fireEvent.click(screen.getByText('New Customer'));
  expect(base.onNewCustomer).toHaveBeenCalled();
  fireEvent.click(screen.getByText('Export'));
  expect(base.onExport).toHaveBeenCalled();
});

test('search prop filters the visible list', () => {
  render(<CustomersModule {...base} search="bhp" />);
  expect(screen.getByText('BHP Group')).toBeInTheDocument();
  expect(screen.queryByText('Acme Co')).not.toBeInTheDocument();
});

test('row click fires onSelectCustomer', () => {
  render(<CustomersModule {...base} />);
  fireEvent.click(screen.getByText('Acme Co'));
  expect(base.onSelectCustomer).toHaveBeenCalledWith(expect.objectContaining({ id: 'ACME' }));
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`

- [ ] **Step 3: Create CustomersModule.jsx**

```jsx
import { useMemo } from 'react';
import { Search, Plus, Download } from 'lucide-react';
import KpiTile from '../../ui/KpiTile';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import CustomerList from './CustomerList';
import { filterCustomers, customerKpis } from './customerAggregates';

const money0 = (v) => `$${Math.round(Number(v) || 0).toLocaleString('en-AU')}`;

export default function CustomersModule({
  customers = [], jobs = [], search, onSearchChange,
  selectedId, onSelectCustomer, onNewCustomer, onExport,
}) {
  const kpis = useMemo(() => customerKpis(customers, jobs), [customers, jobs]);
  const filtered = useMemo(() => filterCustomers(customers, search), [customers, search]);

  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 10, border: `1px solid ${T.hairline}`, borderRadius: T.radius, overflow: 'hidden', width: 'fit-content' }}>
        <KpiTile label="CUSTOMERS" value={kpis.total} sub={`${kpis.active} active`} />
        <KpiTile label="REVENUE" value={money0(kpis.revenue)} tone="ok" />
        <KpiTile label="OUTSTANDING AR" value={money0(kpis.outstanding)} tone="danger" />
        <KpiTile label="OVER CREDIT" value={kpis.overCredit} tone="accent" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: '4px 8px', flex: 1, maxWidth: 280 }}>
          <Search size={12} color={T.textFaint} />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search customers…"
            style={{ border: 'none', outline: 'none', fontSize: T.fsGrid, width: '100%', fontFamily: T.font, color: T.text }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="secondary" onClick={onExport}><Download size={12} /> Export</Button>
        <Button size="sm" variant="primary" onClick={onNewCustomer}><Plus size={12} /> New Customer</Button>
      </div>

      <CustomerList customers={filtered} jobs={jobs} selectedId={selectedId} onSelect={onSelectCustomer} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/modules/customers/CustomersModule.jsx frontend/src/modules/customers/__tests__/CustomersModule.test.jsx
git commit -m "feat: CustomersModule — KPI strip, search, customer list (controlled)"
```

---

### Task 3: Wire CustomersModule into the monolith + verification

**Files:**
- Modify: `frontend/src/TotalImageERP.jsx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add import** (near other module imports):

```js
import CustomersModule from './modules/customers/CustomersModule';
```

- [ ] **Step 2: Replace the list/KPI/search portion of renderCustomers**

In `renderCustomers`, the returned JSX currently has: header buttons + KPI strip + search + a two-pane `table + detail`. Replace the header + KPI strip + search + the **left customer table pane** with `<CustomersModule>`, and KEEP the **right detail panel** (`!selectedCustomer ? <empty> : <detail .../>`). Structure the result so CustomersModule renders the list and the detail panel renders beside/below it. The target shape:

```jsx
  const renderCustomers = () => {
    return (
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 46%', minWidth: 0 }}>
          <CustomersModule
            customers={customers}
            jobs={jobs}
            search={searchTerm}
            onSearchChange={setSearchTerm}
            selectedId={selectedCustomer?.id ?? null}
            onSelectCustomer={(c) => { setSelectedCustomer(c); setCustDetailTab('overview'); }}
            onNewCustomer={() => openModal('customer')}
            onExport={() => exportToCSV(customers, 'customers')}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* ...EXISTING detail panel: !selectedCustomer ? <empty> : <detail with tabs>... */}
        </div>
      </div>
    );
  };
```

CAUTION: Read the full `renderCustomers` first. The detail panel uses `custJobs`/`custOutstanding`/`custRevenue` (defined at the top of renderCustomers) and `custDetailTab`, `selectedCustomer`, `deleteCustomer`, `openModal`, the statement PDF link. KEEP those helper definitions (the detail panel still needs `custJobs`/`custOutstanding`/`custRevenue`) — do NOT delete them just because the list no longer uses them inline. Only the header buttons + KPI strip + search input + the left customer `<table>` markup are removed (CustomersModule replaces them). The detail panel JSX is preserved verbatim.

- [ ] **Step 3: Verify**

- `cd frontend && npm test` — all green; `cd frontend && npm run build` — succeeds.
- `grep -n "renderCustomers" frontend/src/TotalImageERP.jsx` still shows the function + dispatch.
- The old customer `<table>` markup is gone from renderCustomers; the detail panel remains.
- Dev-server smoke (backend :8000, `npm run dev`): Customers tab → KpiTile strip + search + DataGrid list; clicking a row selects it and the detail panel (overview/jobs/aging/statement tabs) shows on the right; New Customer opens the modal; Export works; no console errors.

- [ ] **Step 4: Update CLAUDE.md** "Key architecture": append after the purchase-orders bullet:

```markdown
- `frontend/src/modules/customers/` — Customers module (CustomersModule list + KPI/search, customerAggregates); detail panel (tabs) stays in the monolith
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/TotalImageERP.jsx CLAUDE.md
git commit -m "feat: Customers list/KPI/search on CustomersModule primitives; detail panel unchanged"
```

---

## Known deferrals

- **Customer detail panel** (overview/jobs/aging/statement tabs, credit-limit bar, statement PDF) stays old-styled, wired to monolith `selectedCustomer`/`custDetailTab`. Re-skinning it onto primitives is a follow-up; it works as-is.
- **Customer create/edit modal** (`modalType === 'customer'`) stays as-is, to be migrated in the forms phase.
- **CardFiles module** (`renderCardFiles`, the separate Jim2 card-files surface) is a distinct module — its own migration later.

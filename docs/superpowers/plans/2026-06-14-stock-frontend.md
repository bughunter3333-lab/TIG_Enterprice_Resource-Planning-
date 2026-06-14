# Stock Module Frontend Implementation Plan (Phase 2d)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat inventory table (`renderInventory`) with a Jim2-parity master/detail Stock module on the `ui/` primitives: a left list (search + Low/Out chips) and a right detail panel with five tabs — Details · Locations · Pricing · Transactions · Committed — consuming the Stock backend endpoints built in the previous phase.

**Architecture:** New `frontend/src/modules/stock/` tree, mirroring `modules/jobs/`. `StockModule` owns `selectedSku` and the master/detail split; it reuses the monolith's existing `inventory` query (passed as a prop — no new list fetch). The right panel's tabs fetch their own data lazily via the `stock` api object (`api.stock.locations/pricing/transactions/committed`) using TanStack Query, mounting only when active. Job#/PO# cells in the Transactions/Committed tabs call navigation callbacks the monolith supplies (reusing its `pinJob`/`setActiveModule` mechanism). **Scope: viewing.** All five tabs DISPLAY real data; in-tab create/edit of locations and price levels is deferred to a follow-up (the endpoints support it; the existing item-edit modal still handles item-level edits). `renderInventory` is deleted and replaced with `<StockModule/>`.

**Tech Stack:** React 18 + Vite + TanStack Query v5, `ui/` primitives (DataGrid, Tabs, StatusBadge, Button, KpiTile), vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-06-10-stock-module-design.md` (frontend architecture §"Frontend Architecture"; the old plan's frontend tasks 9–13 are superseded by this plan — they targeted inline styles, this targets the primitives).

---

## Codebase facts (verified 2026-06-14 — do not re-derive)

- `renderInventory()` spans TotalImageERP.jsx:2687+; dispatched at the module router `{!loading && activeModule === 'inventory' && renderInventory()}` (~line 9162). It currently renders a KPI strip + category filter + flat table + a bin map.
- The inventory list query lives in the monolith: `const { data: inventory = [], isLoading: invLoading } = useQuery({ queryKey: ['inventory'], queryFn: api.inventory.list, refetchInterval: 60_000, ... })` (~line 713). `StockModule` receives `inventory` as a prop — it does NOT create its own list query.
- Normalized inventory item fields (from `api.js normalizeInventory`): `sku, name, category, supplier, stock, committed_qty, on_order_qty, weight_kg, reorderLevel, unitCost, unitPrice, location, status, item_type, gl_group, barcode, buy_unit, sell_unit, buy_tax_pct, sell_tax_pct, min_stock`.
- `api.stock` methods (already built, paths verified): `locations(sku)`, `addLocation(sku,data)`, `updateLocation(sku,branch,data)`, `deleteLocation(sku,branch)`, `pricing(sku)`, `updateCost(sku,data)`, `addPriceLevel(sku,data)`, `updatePriceLevel(sku,id,data)`, `deletePriceLevel(sku,id)`, `transactions(sku,{limit,offset})`, `committed(sku)`.
- Backend response shapes (from the tested endpoints):
  - `locations(sku)` → `[{ id, branch, zone, qty_on_hand, committed_qty, available_qty, backorder_qty, on_po_qty, primary_bin_1, max_qty_bin_1, primary_bin_2, max_qty_bin_2 }]`
  - `pricing(sku)` → `{ <cost fields: last_cost, last_cog, avg_cost, avg_cog, max_cog, last_po_cogs, avg_po_cogs, last_ex, last_effective_date, price_template>, price_levels: [{ id, price_level, price_calc_method, base_pl, currency, tax_code, breakpoints: [{ id, min_qty, price_ex, price_inc, pont_pct }] }] }`
  - `transactions(sku,...)` → `[{ id, date, type, reference, location_branch, quantity, qty_bal, po_id, po_line, job_id, pack_num, bin, notes }]`
  - `committed(sku)` → `[{ card_code, customer_name, job_id, job_ref, date, location_branch, qty, unit, price_ex, price_inc, currency, total_aud }]`
- Cross-module navigation pattern in the monolith: `pinJob(job)` then `setActiveModule('jobs')` opens a job; `setActiveModule('purchase-orders')` switches to POs. `jobs` (the normalized array) is in scope to look up a job by id.
- `ui/` primitives available: `DataGrid` (`columns [{key,label,width,align,render}]`, `rows`, `rowKey`, `onRowClick`, `selectedKey`, `error`, `onRetry`, `emptyText`), `Tabs` (`tabs [{id,label}]`, `active`, `onChange`), `StatusBadge`, `Button`, `KpiTile`, `T` tokens (`frontend/src/ui/tokens.js`). DataGrid treats `rows == null` as loading.
- Tests: `cd frontend && npm test`. Build: `npm run build`. PostToolUse `check-sql-files.py` hook error is a broken machine-local hook — ignore; writes succeed.
- Commit style: conventional commits, no Co-Authored-By.

## File Map

| File | Responsibility |
|---|---|
| `frontend/src/modules/stock/stockFormat.js` | Create — shared formatters (`money`, `qtyTone`, `availableQty`) |
| `frontend/src/modules/stock/StockList.jsx` | Create — left master list (DataGrid + search + Low/Out chips) |
| `frontend/src/modules/stock/tabs/StockDetailsTab.jsx` | Create — item detail fields + qty summary (from the item prop, no fetch) |
| `frontend/src/modules/stock/tabs/StockLocationsTab.jsx` | Create — per-branch grid (api.stock.locations) |
| `frontend/src/modules/stock/tabs/StockPricingTab.jsx` | Create — cost grid + price levels/breakpoints (api.stock.pricing) |
| `frontend/src/modules/stock/tabs/StockTransactionsTab.jsx` | Create — movement history (api.stock.transactions), clickable Job/PO |
| `frontend/src/modules/stock/tabs/StockCommittedTab.jsx` | Create — committed jobs (api.stock.committed), clickable Job |
| `frontend/src/modules/stock/StockDetailPanel.jsx` | Create — header + Tabs + lazy tab mount |
| `frontend/src/modules/stock/StockModule.jsx` | Create — master/detail layout, selectedSku |
| `frontend/src/TotalImageERP.jsx` | Modify — replace renderInventory with StockModule; nav callbacks |
| `frontend/src/modules/stock/__tests__/*.test.jsx` | Create — per-task tests |

All tab components wrap their query in a `QueryClientProvider` in tests; use the project's TanStack Query v5. Each tab is mounted only when active (lazy fetch).

---

### Task 1: stockFormat helpers + StockList

**Files:**
- Create: `frontend/src/modules/stock/stockFormat.js`
- Create: `frontend/src/modules/stock/StockList.jsx`
- Test: `frontend/src/modules/stock/__tests__/StockList.test.jsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/modules/stock/__tests__/StockList.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import StockList from '../StockList';

const items = [
  { sku: 'MR.PS60.NAV', name: 'Navy Polo', category: 'Apparel', stock: 50, committed_qty: 10, reorderLevel: 20, unitPrice: 25 },
  { sku: 'CAP.BLK', name: 'Black Cap', category: 'Headwear', stock: 0, committed_qty: 0, reorderLevel: 15, unitPrice: 12 },
  { sku: 'TEE.WHT', name: 'White Tee', category: 'Apparel', stock: 8, committed_qty: 2, reorderLevel: 20, unitPrice: 9 },
];

test('renders all items and fires onSelect with the sku', () => {
  const onSelect = vi.fn();
  render(<StockList items={items} selectedSku={null} onSelect={onSelect} />);
  expect(screen.getByText('MR.PS60.NAV')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Navy Polo'));
  expect(onSelect).toHaveBeenCalledWith('MR.PS60.NAV');
});

test('search filters by sku/name/category', () => {
  render(<StockList items={items} selectedSku={null} onSelect={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText('Search stock…'), { target: { value: 'cap' } });
  expect(screen.getByText('Black Cap')).toBeInTheDocument();
  expect(screen.queryByText('Navy Polo')).not.toBeInTheDocument();
});

test('Out chip shows only zero-stock; Low chip shows below-reorder in-stock', () => {
  render(<StockList items={items} selectedSku={null} onSelect={() => {}} />);
  fireEvent.click(screen.getByText(/Out/));
  expect(screen.getByText('Black Cap')).toBeInTheDocument();
  expect(screen.queryByText('Navy Polo')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText(/Low/));
  expect(screen.getByText('White Tee')).toBeInTheDocument();  // 8 < 20, in stock
  expect(screen.queryByText('Black Cap')).not.toBeInTheDocument(); // 0 stock = Out, not Low
});
```

- [ ] **Step 2: Run to verify failure** — `cd "/d/Total Image Group/frontend" && npm test`

- [ ] **Step 3: Create stockFormat.js**

```js
import { T } from '../../ui/tokens';

export const money = (v) => `$${(Number(v) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Aggregate available = on-hand minus committed, floored at 0.
export const availableQty = (item) => Math.max(0, (Number(item.stock) || 0) - (Number(item.committed_qty) || 0));

// Stock health → token colour. out: stock<=0; low: stock<reorder; else ok.
export function qtyTone(item) {
  const stock = Number(item.stock) || 0;
  const reorder = Number(item.reorderLevel) || 0;
  if (stock <= 0) return { label: 'OUT', color: T.danger };
  if (stock < reorder) return { label: 'LOW', color: T.accentStrong };
  return { label: 'OK', color: T.ok };
}
```

- [ ] **Step 4: Create StockList.jsx**

```jsx
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import DataGrid from '../../ui/DataGrid';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import { qtyTone, availableQty } from './stockFormat';

const CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'low', label: 'Low' },
  { id: 'out', label: 'Out' },
];

const matchesChip = (item, chip) => {
  const stock = Number(item.stock) || 0;
  const reorder = Number(item.reorderLevel) || 0;
  if (chip === 'out') return stock <= 0;
  if (chip === 'low') return stock > 0 && stock < reorder;
  return true;
};

export default function StockList({ items = [], selectedSku, onSelect }) {
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState('all');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i =>
      matchesChip(i, chip) && (!q ||
        (i.sku || '').toLowerCase().includes(q) ||
        (i.name || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q) ||
        (i.supplier || '').toLowerCase().includes(q))
    );
  }, [items, search, chip]);

  const columns = [
    { key: 'sku', label: 'SKU', width: 130, render: (i) => <span style={{ fontWeight: 700, color: T.accentStrong }}>{i.sku}</span> },
    { key: 'name', label: 'Description' },
    { key: 'stock', label: 'Qty', width: 70, align: 'right', render: (i) => {
        const t = qtyTone(i);
        return <span style={{ color: t.color, fontWeight: 600 }}>{Number(i.stock) || 0}</span>;
      } },
    { key: 'avail', label: 'Avail', width: 60, align: 'right', render: (i) => availableQty(i) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: T.font }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: '4px 8px', flex: 1 }}>
          <Search size={12} color={T.textFaint} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search stock…"
            style={{ border: 'none', outline: 'none', fontSize: T.fsGrid, width: '100%', fontFamily: T.font, color: T.text }}
          />
        </div>
        {CHIPS.map(c => (
          <Button key={c.id} size="sm" variant={chip === c.id ? 'primary' : 'secondary'} onClick={() => setChip(c.id)}>
            {c.label}
          </Button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DataGrid
          columns={columns}
          rows={filtered}
          rowKey="sku"
          selectedKey={selectedSku}
          onRowClick={(row) => onSelect(row.sku)}
          emptyText="No stock items match"
          maxHeight="100%"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/modules/stock/stockFormat.js frontend/src/modules/stock/StockList.jsx frontend/src/modules/stock/__tests__/StockList.test.jsx
git commit -m "feat: StockList — master list on DataGrid with search and Low/Out chips"
```

---

### Task 2: StockDetailsTab + StockLocationsTab

**Files:**
- Create: `frontend/src/modules/stock/tabs/StockDetailsTab.jsx`
- Create: `frontend/src/modules/stock/tabs/StockLocationsTab.jsx`
- Test: `frontend/src/modules/stock/__tests__/tabs.test.jsx`

StockDetailsTab reads from the `item` prop (already in hand — no fetch). StockLocationsTab fetches `api.stock.locations(sku)` via TanStack Query.

- [ ] **Step 1: Write failing tests**

Create `frontend/src/modules/stock/__tests__/tabs.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockDetailsTab from '../tabs/StockDetailsTab';
import StockLocationsTab from '../tabs/StockLocationsTab';

vi.mock('../../../api', () => ({
  stock: { locations: vi.fn(), pricing: vi.fn(), transactions: vi.fn(), committed: vi.fn() },
}));
import { stock } from '../../../api';

const wrap = (ui) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

const item = { sku: 'MR.PS60.NAV', name: 'Navy Polo', item_type: 'Depleting', gl_group: 'Apparel', barcode: '123', buy_unit: 'UNIT', sell_unit: 'UNIT', stock: 50, committed_qty: 10, on_order_qty: 5 };

test('StockDetailsTab shows item fields and qty summary (available = 40)', () => {
  wrap(<StockDetailsTab item={item} />);
  expect(screen.getByText('Navy Polo')).toBeInTheDocument();
  expect(screen.getByText('Depleting')).toBeInTheDocument();
  expect(screen.getByText('40')).toBeInTheDocument(); // available = 50 - 10
});

test('StockLocationsTab fetches and renders branch rows', async () => {
  stock.locations.mockResolvedValue([
    { id: 1, branch: 'HQ', zone: 'A', qty_on_hand: 30, committed_qty: 5, available_qty: 25, backorder_qty: 0, on_po_qty: 10, primary_bin_1: 'A-03' },
  ]);
  wrap(<StockLocationsTab sku="MR.PS60.NAV" />);
  await waitFor(() => expect(screen.getByText('HQ')).toBeInTheDocument());
  expect(screen.getByText('A-03')).toBeInTheDocument();
  expect(stock.locations).toHaveBeenCalledWith('MR.PS60.NAV');
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`

- [ ] **Step 3: Create StockDetailsTab.jsx**

```jsx
import { T } from '../../../ui/tokens';
import KpiTile from '../../../ui/KpiTile';
import { availableQty } from '../stockFormat';

function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: `1px solid ${T.hairlineSoft}`, fontSize: T.fsGrid }}>
      <span style={{ color: T.textMuted, width: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ color: T.text }}>{value || <span style={{ color: T.textFaint }}>—</span>}</span>
    </div>
  );
}

export default function StockDetailsTab({ item }) {
  if (!item) return null;
  const onHand = Number(item.stock) || 0;
  const committed = Number(item.committed_qty) || 0;
  const onPo = Number(item.on_order_qty) || 0;
  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: `1px solid ${T.hairline}`, borderRadius: T.radius, overflow: 'hidden' }}>
        <KpiTile label="ON HAND" value={onHand} />
        <KpiTile label="COMMITTED" value={committed} />
        <KpiTile label="AVAILABLE" value={availableQty(item)} tone="ok" />
        <KpiTile label="ON PO" value={onPo} tone="accent" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
        <div>
          <Field label="Code" value={item.sku} />
          <Field label="Description" value={item.name} />
          <Field label="Type" value={item.item_type} />
          <Field label="GL Group" value={item.gl_group} />
          <Field label="Barcode" value={item.barcode} />
        </div>
        <div>
          <Field label="Category" value={item.category} />
          <Field label="Supplier" value={item.supplier} />
          <Field label="Buy Unit" value={item.buy_unit} />
          <Field label="Sell Unit" value={item.sell_unit} />
          <Field label="Reorder Level" value={item.reorderLevel} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create StockLocationsTab.jsx**

```jsx
import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import DataGrid from '../../../ui/DataGrid';

const COLUMNS = [
  { key: 'branch', label: 'Branch', width: 80 },
  { key: 'zone', label: 'Zone', width: 60 },
  { key: 'qty_on_hand', label: 'On Hand', width: 70, align: 'right' },
  { key: 'committed_qty', label: 'Committed', width: 80, align: 'right' },
  { key: 'available_qty', label: 'Available', width: 80, align: 'right' },
  { key: 'backorder_qty', label: 'Backorder', width: 80, align: 'right' },
  { key: 'on_po_qty', label: 'On PO', width: 60, align: 'right' },
  { key: 'primary_bin_1', label: 'Bin 1', width: 70 },
  { key: 'primary_bin_2', label: 'Bin 2', width: 70 },
];

export default function StockLocationsTab({ sku }) {
  const { data, error, refetch } = useQuery({
    queryKey: ['stock-locations', sku],
    queryFn: () => stock.locations(sku),
  });
  return (
    <DataGrid
      columns={COLUMNS}
      rows={error ? [] : data}
      rowKey="id"
      error={error ? (error.message || 'Failed to load locations') : undefined}
      onRetry={refetch}
      emptyText="No branch stock records"
    />
  );
}
```

- [ ] **Step 5: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/modules/stock/tabs/StockDetailsTab.jsx frontend/src/modules/stock/tabs/StockLocationsTab.jsx frontend/src/modules/stock/__tests__/tabs.test.jsx
git commit -m "feat: Stock Details + Locations tabs"
```

---

### Task 3: StockPricingTab + StockTransactionsTab + StockCommittedTab

**Files:**
- Create: `frontend/src/modules/stock/tabs/StockPricingTab.jsx`
- Create: `frontend/src/modules/stock/tabs/StockTransactionsTab.jsx`
- Create: `frontend/src/modules/stock/tabs/StockCommittedTab.jsx`
- Test: append to `frontend/src/modules/stock/__tests__/tabs.test.jsx`

Transactions/Committed render Job# and PO# as clickable when `onNavigateJob`/`onNavigatePO` props are given.

- [ ] **Step 1: Write failing tests** (append to tabs.test.jsx)

```jsx
import StockPricingTab from '../tabs/StockPricingTab';
import StockTransactionsTab from '../tabs/StockTransactionsTab';
import StockCommittedTab from '../tabs/StockCommittedTab';
import { fireEvent } from '@testing-library/react';

test('StockPricingTab shows cost fields and a price level breakpoint', async () => {
  stock.pricing.mockResolvedValue({
    last_cost: 5.5, avg_cost: 5.0, price_template: 'Std',
    levels: [{ id: 1, price_level: '1-Price A', currency: 'AUD', tax_code: 'G', breakpoints: [{ id: 9, min_qty: 1, price_ex: 10, price_inc: 11, pont_pct: 50 }] }],
  });
  wrap(<StockPricingTab sku="X" />);
  await waitFor(() => expect(screen.getByText('1-Price A')).toBeInTheDocument());
  expect(screen.getByText(/Std/)).toBeInTheDocument();
});

test('StockTransactionsTab renders movements and fires onNavigateJob on Job# click', async () => {
  stock.transactions.mockResolvedValue([
    { id: 7, date: '05/06/2026', type: 'Sale', reference: '1201766', location_branch: 'HQ', quantity: -5, qty_bal: 0, job_id: '1201766', po_id: null },
  ]);
  const onNavigateJob = vi.fn();
  wrap(<StockTransactionsTab sku="X" onNavigateJob={onNavigateJob} onNavigatePO={() => {}} />);
  await waitFor(() => expect(screen.getByText('Sale')).toBeInTheDocument());
  fireEvent.click(screen.getByText('1201766'));
  expect(onNavigateJob).toHaveBeenCalledWith('1201766');
});

test('StockCommittedTab renders committed rows with customer + qty', async () => {
  stock.committed.mockResolvedValue([
    { card_code: 'ONSIT', customer_name: 'Onsite Rental', job_id: '1207747', job_ref: '1207747', date: '10/06/2026', location_branch: 'HQ', qty: 5, unit: 'UNIT', price_ex: 58, price_inc: 63.8, currency: 'AUD', total_aud: 319 },
  ]);
  wrap(<StockCommittedTab sku="X" onNavigateJob={() => {}} />);
  await waitFor(() => expect(screen.getByText('Onsite Rental')).toBeInTheDocument());
  expect(screen.getByText('ONSIT')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`

- [ ] **Step 3: Create StockPricingTab.jsx**

```jsx
import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import { T } from '../../../ui/tokens';
import { money } from '../stockFormat';

const COST_FIELDS = [
  ['Last Cost', 'last_cost'], ['Avg Cost', 'avg_cost'], ['Last COG', 'last_cog'], ['Avg COG', 'avg_cog'],
  ['Max COG', 'max_cog'], ['Last PO COGS', 'last_po_cogs'], ['Avg PO COGS', 'avg_po_cogs'], ['Last Ex.', 'last_ex'],
];

export default function StockPricingTab({ sku }) {
  const { data, error, refetch } = useQuery({ queryKey: ['stock-pricing', sku], queryFn: () => stock.pricing(sku) });

  if (error) return (
    <div style={{ background: T.dangerTint, color: T.danger, padding: 10, borderRadius: T.radius, fontFamily: T.font, fontSize: T.fsGrid }}>
      {error.message || 'Failed to load pricing'} <button onClick={() => refetch()} style={{ marginLeft: 8 }}>Retry</button>
    </div>
  );
  if (!data) return <div style={{ padding: 12, color: T.textMuted, fontFamily: T.font, fontSize: T.fsGrid }}>Loading…</div>;

  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ fontSize: T.fsHeader, fontWeight: 700, color: T.headerText, textTransform: 'uppercase', marginBottom: 6 }}>Cost Tracking</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px 16px', marginBottom: 6 }}>
        {COST_FIELDS.map(([label, key]) => (
          <div key={key} style={{ fontSize: T.fsGrid }}>
            <span style={{ color: T.textMuted }}>{label}: </span>
            <span style={{ color: T.text, fontVariantNumeric: 'tabular-nums' }}>{data[key] != null ? money(data[key]) : '—'}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: T.fsGrid, color: T.textMuted, marginBottom: 12 }}>Price Template: {data.price_template || '—'} · Last Effective: {data.last_effective_date || '—'}</div>

      <div style={{ fontSize: T.fsHeader, fontWeight: 700, color: T.headerText, textTransform: 'uppercase', marginBottom: 6 }}>Price Levels</div>
      {(data.levels || []).length === 0 && <div style={{ fontSize: T.fsGrid, color: T.textFaint }}>No price levels</div>}
      {(data.levels || []).map(level => (
        <div key={level.id} style={{ border: `1px solid ${T.hairline}`, borderRadius: T.radius, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 10, padding: '6px 10px', background: T.hairlineSoft, fontSize: T.fsGrid, fontWeight: 600 }}>
            <span>{level.price_level}</span>
            <span style={{ color: T.textMuted, fontWeight: 400 }}>{level.currency} · {level.tax_code} · {level.price_calc_method}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.fsGrid }}>
            <thead>
              <tr style={{ color: T.headerText, textAlign: 'right' }}>
                <th style={{ textAlign: 'left', padding: '3px 10px', fontWeight: 600 }}>≥ Qty</th>
                <th style={{ padding: '3px 10px', fontWeight: 600 }}>Price Ex.</th>
                <th style={{ padding: '3px 10px', fontWeight: 600 }}>Price Inc.</th>
                <th style={{ padding: '3px 10px', fontWeight: 600 }}>Pont %</th>
              </tr>
            </thead>
            <tbody>
              {(level.breakpoints || []).map(bp => (
                <tr key={bp.id} style={{ textAlign: 'right', borderTop: `1px solid ${T.hairlineSoft}` }}>
                  <td style={{ textAlign: 'left', padding: '3px 10px' }}>{bp.min_qty}</td>
                  <td style={{ padding: '3px 10px' }}>{money(bp.price_ex)}</td>
                  <td style={{ padding: '3px 10px' }}>{money(bp.price_inc)}</td>
                  <td style={{ padding: '3px 10px' }}>{bp.pont_pct != null ? `${bp.pont_pct}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create StockTransactionsTab.jsx**

```jsx
import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import DataGrid from '../../../ui/DataGrid';
import { T } from '../../../ui/tokens';

const linkCell = (value, onClick) =>
  value ? (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onClick(value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClick(value); } }}
      style={{ color: T.accentStrong, fontWeight: 600, cursor: 'pointer' }}
    >
      {value}
    </span>
  ) : '—';

export default function StockTransactionsTab({ sku, onNavigateJob, onNavigatePO }) {
  const { data, error, refetch } = useQuery({
    queryKey: ['stock-transactions', sku],
    queryFn: () => stock.transactions(sku, { limit: 100 }),
  });
  const columns = [
    { key: 'id', label: 'Tran#', width: 80 },
    { key: 'date', label: 'Date', width: 80 },
    { key: 'type', label: 'Type', width: 80 },
    { key: 'reference', label: 'Ref#', width: 80 },
    { key: 'location_branch', label: 'Loc', width: 50 },
    { key: 'quantity', label: 'Qty', width: 50, align: 'right' },
    { key: 'qty_bal', label: 'Bal', width: 50, align: 'right' },
    { key: 'po_id', label: 'PO#', width: 70, render: (r) => linkCell(r.po_id, onNavigatePO) },
    { key: 'job_id', label: 'Job#', width: 70, render: (r) => linkCell(r.job_id, onNavigateJob) },
    { key: 'bin', label: 'Bin', width: 60 },
  ];
  return (
    <DataGrid
      columns={columns}
      rows={error ? [] : data}
      rowKey="id"
      error={error ? (error.message || 'Failed to load transactions') : undefined}
      onRetry={refetch}
      emptyText="No stock movements"
    />
  );
}
```

- [ ] **Step 5: Create StockCommittedTab.jsx**

```jsx
import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import DataGrid from '../../../ui/DataGrid';
import { T } from '../../../ui/tokens';
import { money } from '../stockFormat';

export default function StockCommittedTab({ sku, onNavigateJob }) {
  const { data, error, refetch } = useQuery({
    queryKey: ['stock-committed', sku],
    queryFn: () => stock.committed(sku),
  });
  const columns = [
    { key: 'card_code', label: 'Card', width: 70 },
    { key: 'customer_name', label: 'Customer' },
    { key: 'job_ref', label: 'Job#', width: 70, render: (r) => (
        <span role="button" tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onNavigateJob(r.job_id); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onNavigateJob(r.job_id); } }}
          style={{ color: T.accentStrong, fontWeight: 600, cursor: 'pointer' }}>{r.job_ref}</span>
      ) },
    { key: 'date', label: 'Date', width: 80 },
    { key: 'location_branch', label: 'Loc', width: 50 },
    { key: 'qty', label: 'Qty', width: 50, align: 'right' },
    { key: 'unit', label: 'Unit', width: 55 },
    { key: 'price_inc', label: 'Price Inc', width: 80, align: 'right', render: (r) => money(r.price_inc) },
    { key: 'total_aud', label: 'Total', width: 80, align: 'right', render: (r) => money(r.total_aud) },
  ];
  return (
    <DataGrid
      columns={columns}
      rows={error ? [] : data}
      rowKey="job_id"
      error={error ? (error.message || 'Failed to load committed') : undefined}
      onRetry={refetch}
      emptyText="No committed stock"
    />
  );
}
```

- [ ] **Step 6: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/modules/stock/tabs/StockPricingTab.jsx frontend/src/modules/stock/tabs/StockTransactionsTab.jsx frontend/src/modules/stock/tabs/StockCommittedTab.jsx frontend/src/modules/stock/__tests__/tabs.test.jsx
git commit -m "feat: Stock Pricing, Transactions, Committed tabs"
```

---

### Task 4: StockDetailPanel (header + tabs, lazy mount)

**Files:**
- Create: `frontend/src/modules/stock/StockDetailPanel.jsx`
- Test: `frontend/src/modules/stock/__tests__/StockDetailPanel.test.jsx`

- [ ] **Step 1: Write failing test**

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockDetailPanel from '../StockDetailPanel';

vi.mock('../../../api', () => ({ stock: { locations: vi.fn().mockResolvedValue([]), pricing: vi.fn().mockResolvedValue({ levels: [] }), transactions: vi.fn().mockResolvedValue([]), committed: vi.fn().mockResolvedValue([]) } }));

const wrap = (ui) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};
const item = { sku: 'MR.PS60.NAV', name: 'Navy Polo', stock: 50, committed_qty: 10, item_type: 'Depleting' };

test('shows header and Details tab by default; switches tabs', () => {
  wrap(<StockDetailPanel item={item} onNavigateJob={() => {}} onNavigatePO={() => {}} />);
  expect(screen.getByText('MR.PS60.NAV')).toBeInTheDocument();
  expect(screen.getByText('Depleting')).toBeInTheDocument(); // Details tab content
  fireEvent.click(screen.getByText('Locations'));
  expect(screen.getByText('Branch')).toBeInTheDocument(); // Locations grid header
});

test('renders an empty-state prompt when no item selected', () => {
  wrap(<StockDetailPanel item={null} onNavigateJob={() => {}} onNavigatePO={() => {}} />);
  expect(screen.getByText(/Select a stock item/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`

- [ ] **Step 3: Create StockDetailPanel.jsx**

```jsx
import { useState, useEffect } from 'react';
import Tabs from '../../ui/Tabs';
import { T } from '../../ui/tokens';
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
  const [tab, setTab] = useState('details');
  // Reset to Details whenever the selected item changes.
  useEffect(() => { setTab('details'); }, [item?.sku]);

  if (!item) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: T.textFaint, fontFamily: T.font, fontSize: T.fsBase }}>
        Select a stock item to view details
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: T.font }}>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{item.sku}</div>
        <div style={{ fontSize: T.fsGrid, color: T.textMuted }}>{item.name}{item.gl_group ? ` · ${item.gl_group}` : ''}</div>
      </div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 10 }}>
        {tab === 'details' && <StockDetailsTab item={item} />}
        {tab === 'locations' && <StockLocationsTab sku={item.sku} />}
        {tab === 'pricing' && <StockPricingTab sku={item.sku} />}
        {tab === 'transactions' && <StockTransactionsTab sku={item.sku} onNavigateJob={onNavigateJob} onNavigatePO={onNavigatePO} />}
        {tab === 'committed' && <StockCommittedTab sku={item.sku} onNavigateJob={onNavigateJob} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/modules/stock/StockDetailPanel.jsx frontend/src/modules/stock/__tests__/StockDetailPanel.test.jsx
git commit -m "feat: StockDetailPanel — header + 5 tabs with lazy data fetch"
```

---

### Task 5: StockModule (master/detail layout)

**Files:**
- Create: `frontend/src/modules/stock/StockModule.jsx`
- Test: `frontend/src/modules/stock/__tests__/StockModule.test.jsx`

- [ ] **Step 1: Write failing test**

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockModule from '../StockModule';

vi.mock('../../../api', () => ({ stock: { locations: vi.fn().mockResolvedValue([]), pricing: vi.fn().mockResolvedValue({ levels: [] }), transactions: vi.fn().mockResolvedValue([]), committed: vi.fn().mockResolvedValue([]) } }));

const wrap = (ui) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};
const inventory = [
  { sku: 'MR.PS60.NAV', name: 'Navy Polo', category: 'Apparel', stock: 50, committed_qty: 10, reorderLevel: 20 },
  { sku: 'CAP.BLK', name: 'Black Cap', category: 'Headwear', stock: 0, committed_qty: 0, reorderLevel: 15 },
];

test('shows the empty detail prompt until a row is selected, then the item', () => {
  wrap(<StockModule inventory={inventory} onNavigateJob={() => {}} onNavigatePO={() => {}} />);
  expect(screen.getByText(/Select a stock item/i)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Navy Polo'));
  expect(screen.getAllByText('MR.PS60.NAV').length).toBeGreaterThan(0); // appears in list + panel header
  expect(screen.queryByText(/Select a stock item/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`

- [ ] **Step 3: Create StockModule.jsx**

```jsx
import { useState, useMemo } from 'react';
import { T } from '../../ui/tokens';
import StockList from './StockList';
import StockDetailPanel from './StockDetailPanel';

export default function StockModule({ inventory = [], onNavigateJob, onNavigatePO }) {
  const [selectedSku, setSelectedSku] = useState(null);
  const selectedItem = useMemo(
    () => inventory.find(i => i.sku === selectedSku) || null,
    [inventory, selectedSku],
  );

  return (
    <div style={{ display: 'flex', gap: 14, height: 'calc(100vh - 120px)', fontFamily: T.font }}>
      <div style={{ flexBasis: '42%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <StockList items={inventory} selectedSku={selectedSku} onSelect={setSelectedSku} />
      </div>
      <div style={{ flex: 1, minWidth: 0, background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: 12, overflow: 'hidden' }}>
        <StockDetailPanel item={selectedItem} onNavigateJob={onNavigateJob} onNavigatePO={onNavigatePO} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/modules/stock/StockModule.jsx frontend/src/modules/stock/__tests__/StockModule.test.jsx
git commit -m "feat: StockModule — master/detail split reusing the inventory query"
```

---

### Task 6: Wire StockModule into the monolith + verification

**Files:**
- Modify: `frontend/src/TotalImageERP.jsx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add import** (near the other module imports at the top of TotalImageERP.jsx):

```js
import StockModule from './modules/stock/StockModule';
```

- [ ] **Step 2: Replace the renderInventory dispatch**

Find the module router line `{!loading && activeModule === 'inventory' && renderInventory()}` (~line 9162) and replace it with:

```jsx
                {!loading && activeModule === 'inventory' && (
                  <StockModule
                    inventory={inventory}
                    onNavigateJob={(jobId) => { const j = jobs.find(jb => String(jb.id) === String(jobId)); if (j) { pinJob(j); } setActiveModule('jobs'); }}
                    onNavigatePO={() => setActiveModule('purchase-orders')}
                  />
                )}
```

- [ ] **Step 3: Delete `renderInventory`**

Remove the entire `const renderInventory = () => { ... };` function (starts ~line 2687). After deletion, `grep -n "renderInventory" frontend/src/TotalImageERP.jsx` must return NOTHING.

CAUTION: only delete `renderInventory`. The inventory EDIT modal (`modalType === 'inventory'` inside `renderModal`, ~line 5970), the inventory query, `saveInventoryItem`, the stock-adjust/transfer/stocktake modals, and the inventory ribbon (`activeModule === 'inventory'` contextual toolbar ~line 8730) all STAY — they are not part of renderInventory. If renderInventory references local helpers (e.g. a bin-map builder) defined inside it, they are deleted with it; if it references component-scope helpers used elsewhere, leave those.

- [ ] **Step 4: Verify**

- `cd frontend && npm test` — all green (existing + new stock tests).
- `cd frontend && npm run build` — succeeds.
- Dev-server smoke (backend on :8000, `npm run dev`): open **Stock** tab → left list with search + Low/Out chips; click an item → right panel header + Details tab (qty summary); click Locations/Pricing/Transactions/Committed → each loads via its endpoint (empty states are fine on seed data); in Transactions, a Job# link navigates to Jobs and opens the job; no console errors. Confirm the inventory **edit modal** still opens (ribbon "New"/"Edit" or `N` key) and saves.

- [ ] **Step 5: Update CLAUDE.md** "Key architecture": append after the jobs-module bullet:

```markdown
- `frontend/src/modules/stock/` — Stock module (StockModule master/detail, StockList, 5 tabs) on the Stock API; replaces the old flat inventory table
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/TotalImageERP.jsx CLAUDE.md
git commit -m "feat: Stock module master/detail replaces flat inventory table; CLAUDE.md note"
```

---

## Known deferrals (recorded for later)

- **In-tab create/edit** of locations and price levels (the `addLocation`/`updateLocation`/`deleteLocation`/`addPriceLevel`/`updatePriceLevel`/`deletePriceLevel`/`updateCost` endpoints exist and are tested; this phase is view-only for those). The existing item-edit modal still covers item-level fields.
- **KPI strip / bin-map** from the old `renderInventory` are dropped in favour of the master/detail; if the team wants the SKU-count/low/out KPIs back, add a `KpiTile` strip above the split in a follow-up.
- **Transactions pagination UI** — the endpoint is paginated (limit/offset) but the tab fetches the first 100; add load-more if movement history depth becomes an issue.
- **Stock form re-skin** — the inventory add/edit modal stays as-is (old style), to be migrated with the other forms in the job-form phase pattern.

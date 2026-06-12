# Jobs Module Migration Implementation Plan (Phase 2a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Jobs LIST experience out of `TotalImageERP.jsx` into `frontend/src/modules/jobs/` built on the Phase 1 primitives — DataGrid list (default), kanban board toggle, FilterBar chips replacing the dropdown filter panel — plus LiveTree saved-list deep links and the Ctrl+K search shortcut deferred from Phase 1.

**Architecture:** Filter state STAYS in the monolith (dashboard quick-actions at TotalImageERP.jsx:9159-9161 and the Create List modal at :3475 set it from outside) — the new `JobsModule` is a controlled component receiving `filters` + `onFilterChange`. Filtering logic moves to pure functions in `jobsFilters.js` (unit-testable). `JobsBoard` is slimmed to a presentational board (its internal duplicate filter/search/list-view code is deleted — `JobsModule` owns all of that now). The full-page Job Detail (lines ~2023-2739) and the giant job form modal (renderModal job branch, ~1,100 lines) are NOT touched — they are Phase 2b.

**Tech Stack:** React 18 + Vite, Phase 1 primitives (`frontend/src/ui/`), vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-06-11-ui-redesign-dense-jim2-design.md` §3.2

---

## Codebase facts (verified 2026-06-13 — do not re-derive)

- `renderJobs()` spans TotalImageERP.jsx:1897-2739. Structure: filter-option lists + `parseJobDate` + `filteredJobs` predicate (1897-1971) → `hasActiveFilters`/`clearFilters` (1973-1995) → status colour maps → `{!showJobDetail && <JobsBoard jobs={filteredJobs} onJobClick={(job) => { setActiveJob(job); openModal('job'); }} currentUser={currentUser} />}` (~2014-2021) → full-page Job Detail `{activeJob && showJobDetail && (...)}` (~2023-2739, DO NOT TOUCH).
- Monolith filter state (declared ~line 675+): `searchTerm, filterStatus, filterPriority, filterCustomer, filterAssignedTo, filterDateFrom, filterDateTo, filterDateField, filterShipCode, filterCustomerGroup, filterOpenFreight, filterQuick, activeJobList, showMoreFilters, jobsViewMode` (`jobsViewMode` default `'table'`, line 675).
- `JobsBoard` (components/jobs/JobsBoard.jsx, 114 lines) is imported ONLY by TotalImageERP.jsx:18 and used once at :2015. It currently has its own internal `view`/`filter`/`search` state + a hand-rolled list grid — all duplicating renderJobs' filtering. KanbanColumn + JobCard are presentational already.
- Normalized job fields used here: `id, customer, customerId, status, priority, assignedTo, due, date (in), invoice, custRef, ourRef, shipTo, total, items[{decorationType}], invoiceStatus, accMgr`.
- Job statuses: `QUOTE, New, ORDER, In Progress, PROOF, PRINT, Pick/Pack, FINISH, INVOICE, PAID, CANCEL`. Quick-filter ids in the monolith predicate: `overdue, dueToday, thisWeek, inProduction, needsInvoice, myJobs, urgent`.
- "My Jobs" quick filter matches `job.assignedTo === (currentUser?.full_name || currentUser?.username)` (NOT accMgr — LiveTree's mine list uses accMgr; keep both semantics as-is).
- LiveTree saved lists (ui/shell/LiveTree.jsx `SAVED_LISTS`): ids `mine, due-today, overdue, pickpack`. AppShell currently hard-wires `onSelectList={() => onNavigate('jobs')}`.
- ModuleBar search input is an uncontrolled-position `<input>` inside ModuleBar; Ctrl+K must focus it (Phase 1 deferral).
- Phase 1 primitives available: `DataGrid` (columns `{key,label,width,align,render}`, `rows`, `onRowClick`, `initialSort`), `FilterBar` (`filters` chips, `available` two-level menu, `onAdd/onRemove`, `right` slot), `StatusBadge`, `Button`, `Select`, `T` tokens, `parseD` in `ui/dates.js`.
- Tests: `cd frontend && npm test` (29 green now). Build: `npm run build`.
- PostToolUse hook errors about `check-sql-files.py` are a broken machine-local hook — ignore; writes succeed.

## File Map

| File | Responsibility |
|---|---|
| `frontend/src/modules/jobs/jobsFilters.js` | Create — pure filtering: `filterJobs`, `buildFilterOptions`, `QUICK_FILTERS`, `EMPTY_JOBS_FILTERS` |
| `frontend/src/modules/jobs/JobsList.jsx` | Create — DataGrid column defs + list rendering |
| `frontend/src/modules/jobs/JobsModule.jsx` | Create — FilterBar + view toggle + JobsList/JobsBoard composition (controlled) |
| `frontend/src/components/jobs/JobsBoard.jsx` | Modify — slim to presentational board only |
| `frontend/src/TotalImageERP.jsx` | Modify — renderJobs list branch → `<JobsModule>`; LiveTree deep-link mapping; delete moved code |
| `frontend/src/ui/shell/AppShell.jsx` | Modify — `onSelectList` prop pass-through; Ctrl+K handler |
| `frontend/src/ui/shell/ModuleBar.jsx` | Modify — search input ref for Ctrl+K |
| `frontend/src/modules/jobs/__tests__/jobsFilters.test.js` | Create |
| `frontend/src/modules/jobs/__tests__/JobsModule.test.jsx` | Create |

---

### Task 1: jobsFilters.js — pure filtering logic with tests

**Files:**
- Create: `frontend/src/modules/jobs/jobsFilters.js`
- Test: `frontend/src/modules/jobs/__tests__/jobsFilters.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/modules/jobs/__tests__/jobsFilters.test.js`:

```js
import { filterJobs, buildFilterOptions, QUICK_FILTERS, EMPTY_JOBS_FILTERS } from '../jobsFilters';

const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const today = new Date();
const yesterday = new Date(today.getTime() - 86400000);

const jobs = [
  { id: '1001', customer: 'BHP Group', customerId: 'BHP.HQ', status: 'PRINT', priority: 'Urgent', assignedTo: 'Emon', due: fmt(yesterday), invoice: '', custRef: 'PO-9', ourRef: '', shipTo: 'SYD', total: 500, items: [] },
  { id: '1002', customer: 'Onsite Rental', customerId: 'ONSIT', status: 'QUOTE', priority: 'Normal', assignedTo: 'Sam', due: fmt(today), invoice: '', custRef: '', ourRef: '', shipTo: 'MEL', total: 300, items: [] },
  { id: '1003', customer: 'BHP Group', customerId: 'BHP.WA', status: 'PAID', priority: 'Normal', assignedTo: 'Emon', due: fmt(yesterday), invoice: 'INV-1', custRef: '', ourRef: '', shipTo: 'SYD', total: 900, items: [] },
];

test('no filters returns all jobs', () => {
  expect(filterJobs(jobs, EMPTY_JOBS_FILTERS, null)).toHaveLength(3);
});

test('search matches id, customer, customerId, refs', () => {
  expect(filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, searchTerm: 'bhp' }, null)).toHaveLength(2);
  expect(filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, searchTerm: '1002' }, null)).toHaveLength(1);
  expect(filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, searchTerm: 'po-9' }, null)).toHaveLength(1);
});

test('status, priority, customer, assignee filters', () => {
  expect(filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, status: 'PRINT' }, null)).toHaveLength(1);
  expect(filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, priority: 'Urgent' }, null)).toHaveLength(1);
  expect(filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, customer: 'ONSIT' }, null)).toHaveLength(1);
  expect(filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, assignedTo: 'Emon' }, null)).toHaveLength(2);
});

test('quick filter overdue excludes finished statuses', () => {
  // 1001 PRINT overdue → in; 1003 PAID overdue → out
  const out = filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, quick: 'overdue' }, null);
  expect(out.map(j => j.id)).toEqual(['1001']);
});

test('quick filter myJobs matches assignedTo against current user', () => {
  const out = filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, quick: 'myJobs' }, { username: 'Emon' });
  expect(out.map(j => j.id)).toEqual(['1001', '1003']);
});

test('customerGroup filters on customerId prefix before the dot', () => {
  const out = filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, customerGroup: 'BHP' }, null);
  expect(out).toHaveLength(2);
});

test('buildFilterOptions produces sorted unique lists', () => {
  const o = buildFilterOptions(jobs);
  expect(o.uniqueCustomers.map(c => c.id)).toEqual(['BHP.HQ', 'BHP.WA', 'ONSIT']);
  expect(o.uniqueAssignees).toEqual(['Emon', 'Sam']);
  expect(o.uniqueShipCodes).toEqual(['MEL', 'SYD']);
  expect(o.uniqueGroups).toEqual(['BHP', 'ONSIT']);
});

test('QUICK_FILTERS exposes the seven quick filter ids', () => {
  expect(QUICK_FILTERS.map(q => q.id)).toEqual(['overdue', 'dueToday', 'thisWeek', 'inProduction', 'needsInvoice', 'myJobs', 'urgent']);
});
```

NOTE on `uniqueCustomers` expected order: the monolith sorts by `name`; 'BHP Group' ties for both BHP rows so Map insertion order applies for the tie — if the assertion fails on tie order, fix the EXPECTATION to match actual stable behaviour, never the sort logic.

- [ ] **Step 2: Run to verify failure**

Run: `cd "/d/Total Image Group/frontend" && npm test` — Expected: FAIL (cannot resolve ../jobsFilters)

- [ ] **Step 3: Implement jobsFilters.js**

Create `frontend/src/modules/jobs/jobsFilters.js`. This is a PORT of TotalImageERP.jsx:1899-1971 — semantics must be IDENTICAL (sentinel `'all'` values, same matching rules). Open the monolith at those lines and port faithfully into this shape:

```js
import { parseD } from '../../ui/dates';

export const QUICK_FILTERS = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'dueToday', label: 'Due Today' },
  { id: 'thisWeek', label: 'This Week' },
  { id: 'inProduction', label: 'In Production' },
  { id: 'needsInvoice', label: 'Needs Invoice' },
  { id: 'myJobs', label: 'My Jobs' },
  { id: 'urgent', label: 'Urgent' },
];

export const EMPTY_JOBS_FILTERS = {
  searchTerm: '',
  status: 'all',
  priority: 'all',
  customer: 'all',
  assignedTo: 'all',
  dateFrom: '',
  dateTo: '',
  dateField: 'due',
  shipCode: 'all',
  customerGroup: 'all',
  openFreight: false,
  quick: null,
  jobList: null,
};

export function buildFilterOptions(jobs) {
  const uniqueCustomers = [...new Map(jobs.map(j => [j.customerId, { id: j.customerId, name: j.customer }])).values()]
    .filter(c => c.id).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const uniqueAssignees = [...new Set(jobs.map(j => j.assignedTo).filter(Boolean))].sort();
  const uniqueShipCodes = [...new Set(jobs.map(j => j.shipTo).filter(Boolean))].sort();
  const uniqueGroups = [...new Set(jobs.map(j => (j.customerId ? j.customerId.split('.')[0] : null)).filter(Boolean))].sort();
  return { uniqueCustomers, uniqueAssignees, uniqueShipCodes, uniqueGroups };
}

export function filterJobs(jobs, f, currentUser) {
  return jobs.filter(job => {
    const term = (f.searchTerm || '').toLowerCase();
    const matchesSearch = !term ||
      String(job.id).toLowerCase().includes(term) ||
      (job.customer || '').toLowerCase().includes(term) ||
      (job.customerId || '').toLowerCase().includes(term) ||
      (job.invoice || '').toLowerCase().includes(term) ||
      (job.custRef || '').toLowerCase().includes(term) ||
      (job.ourRef || '').toLowerCase().includes(term) ||
      (job.shipTo || '').toLowerCase().includes(term);

    const matchesStatus = f.status === 'all' || job.status === f.status;
    const matchesPriority = f.priority === 'all' || job.priority === f.priority;
    const matchesCustomer = f.customer === 'all' || job.customerId === f.customer;
    const matchesAssigned = f.assignedTo === 'all' || job.assignedTo === f.assignedTo;

    let matchesDate = true;
    if (f.dateFrom || f.dateTo) {
      const jobDate = parseD(job[f.dateField]);
      if (jobDate) {
        if (f.dateFrom && jobDate < new Date(f.dateFrom)) matchesDate = false;
        if (f.dateTo && jobDate > new Date(f.dateTo + 'T23:59:59')) matchesDate = false;
      }
    }

    const matchesShipCode = f.shipCode === 'all' || job.shipTo === f.shipCode;
    const jobGroup = job.customerId ? job.customerId.split('.')[0] : '';
    const matchesGroup = f.customerGroup === 'all' || jobGroup === f.customerGroup;
    const matchesOpenFreight = !f.openFreight || (job.shipTo && !['PAID', 'CANCEL'].includes(job.status));

    const matchesJobList = !f.jobList || (
      (!f.jobList.customerId || job.customerId === f.jobList.customerId) &&
      (!f.jobList.status || job.status === f.jobList.status) &&
      (!f.jobList.priority || job.priority === f.jobList.priority)
    );

    let matchesQuick = true;
    if (f.quick) {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const due = parseD(job.due);
      const finished = ['PAID', 'CANCEL', 'FINISH', 'INVOICE'].includes(job.status);
      if (f.quick === 'overdue') matchesQuick = !!due && due < now && !finished;
      if (f.quick === 'dueToday') matchesQuick = !!due && due.toISOString().split('T')[0] === todayStr && !finished;
      if (f.quick === 'thisWeek') {
        const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
        matchesQuick = !!due && due >= now && due <= weekEnd && !finished;
      }
      if (f.quick === 'inProduction') matchesQuick = ['In Progress', 'PROOF', 'PRINT', 'Pick/Pack'].includes(job.status);
      if (f.quick === 'needsInvoice') matchesQuick = job.invoiceStatus === 'to_invoice' || job.status === 'FINISH';
      if (f.quick === 'myJobs') matchesQuick = job.assignedTo === (currentUser?.full_name || currentUser?.username);
      if (f.quick === 'urgent') matchesQuick = job.priority === 'Urgent';
    }

    return matchesSearch && matchesStatus && matchesPriority && matchesCustomer && matchesAssigned && matchesDate && matchesShipCode && matchesGroup && matchesOpenFreight && matchesJobList && matchesQuick;
  });
}
```

Before finalising, DIFF your ported predicate line-by-line against TotalImageERP.jsx:1913-1971 to confirm identical semantics (the only changes allowed: `filterX` state vars → `f.x` fields, `parseJobDate` → `parseD`).

- [ ] **Step 4: Run tests — expect PASS** (`npm test`)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/jobs/jobsFilters.js frontend/src/modules/jobs/__tests__/jobsFilters.test.js
git commit -m "feat: jobsFilters — pure jobs filtering ported from renderJobs, with tests"
```

---

### Task 2: JobsList — DataGrid list view

**Files:**
- Create: `frontend/src/modules/jobs/JobsList.jsx`
- Test: append to `frontend/src/modules/jobs/__tests__/JobsModule.test.jsx` (created here)

- [ ] **Step 1: Write failing test**

Create `frontend/src/modules/jobs/__tests__/JobsModule.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import JobsList from '../JobsList';

const jobs = [
  { id: '1001', customer: 'BHP Group', status: 'PRINT', priority: 'Urgent', accMgr: 'SM', total: 1500, due: '12/06/2026', items: [{ decorationType: 'Embroidery' }] },
  { id: '1002', customer: 'Onsite Rental', status: 'QUOTE', priority: 'Normal', accMgr: 'JC', total: 300, due: '15/06/2026', items: [] },
];

test('renders job rows with status badge and money formatting, fires onJobClick', () => {
  const onJobClick = vi.fn();
  render(<JobsList jobs={jobs} onJobClick={onJobClick} />);
  expect(screen.getByText('1001')).toBeInTheDocument();
  expect(screen.getByText('PRINT')).toBeInTheDocument();      // StatusBadge text
  expect(screen.getByText('$1,500')).toBeInTheDocument();      // money, no decimals
  expect(screen.getByText('Embroidery')).toBeInTheDocument();  // decoration column
  fireEvent.click(screen.getByText('BHP Group'));
  expect(onJobClick).toHaveBeenCalledWith(expect.objectContaining({ id: '1001' }));
});
```

- [ ] **Step 2: Run to verify failure** (`npm test`)

- [ ] **Step 3: Implement JobsList.jsx**

```jsx
import DataGrid from '../../ui/DataGrid';
import StatusBadge from '../../ui/StatusBadge';
import { T } from '../../ui/tokens';

const money = (v) => `$${(v ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;
const decoration = (job) => [...new Set((job.items ?? []).map(i => i.decorationType).filter(d => d && d !== 'None'))][0] ?? '—';

const COLUMNS = [
  { key: 'id', label: 'Job#', width: 80, render: (j) => <span style={{ fontWeight: 700, color: T.accentStrong }}>{j.id}</span> },
  { key: 'customer', label: 'Customer' },
  { key: 'status', label: 'Status', width: 100, render: (j) => <StatusBadge status={j.status} /> },
  { key: 'dec', label: 'Dec', width: 90, render: decoration },
  { key: 'priority', label: 'Priority', width: 70 },
  { key: 'accMgr', label: 'Acc Mgr', width: 70 },
  { key: 'total', label: 'Total', width: 80, align: 'right', render: (j) => money(j.total) },
  { key: 'due', label: 'Due', width: 90 },
];

export default function JobsList({ jobs, onJobClick }) {
  return (
    <DataGrid
      columns={COLUMNS}
      rows={jobs}
      rowKey="id"
      onRowClick={onJobClick}
      emptyText="No jobs match the current filters"
    />
  );
}
```

- [ ] **Step 4: Run tests — expect PASS**, **Step 5: Commit**

```bash
git add frontend/src/modules/jobs/JobsList.jsx frontend/src/modules/jobs/__tests__/JobsModule.test.jsx
git commit -m "feat: JobsList — jobs list on DataGrid with status badges"
```

---

### Task 3: Slim JobsBoard to a presentational board

**Files:**
- Modify: `frontend/src/components/jobs/JobsBoard.jsx`

JobsBoard's internal `view`/`filter`/`search` state and hand-rolled list grid duplicate what JobsModule now owns. After this task it renders ONLY the kanban columns from the (already filtered) `jobs` prop.

- [ ] **Step 1: Rewrite JobsBoard.jsx** to exactly:

```jsx
import KanbanColumn from './KanbanColumn';

const STATUSES = ['QUOTE', 'ORDER', 'In Progress', 'Pick/Pack', 'PROOF', 'PRINT', 'FINISH', 'INVOICE', 'PAID'];

export default function JobsBoard({ jobs, onJobClick }) {
  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
      {STATUSES.map(status => (
        <KanbanColumn
          key={status}
          status={status}
          jobs={(jobs ?? []).filter(j => j.status === status)}
          onJobClick={onJobClick}
        />
      ))}
    </div>
  );
}
```

(The `currentUser` prop, `parseJobDate`, `STATUS_COLORS`, controls row, and list grid are all deleted — superseded by JobsModule/JobsList. KanbanColumn/JobCard unchanged.)

- [ ] **Step 2: Verify nothing else breaks**

`grep -rn "JobsBoard" frontend/src/` must show only the import + single usage in TotalImageERP.jsx (still passing the now-ignored `currentUser` prop — fine until Task 4 rewires it) and the component file itself.

Run: `npm test` — all green (JobsBoard has no direct tests; JobsModule tests come next).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/jobs/JobsBoard.jsx
git commit -m "refactor: JobsBoard is presentational — internal filter/search/list duplication removed"
```

---

### Task 4: JobsModule — controlled composition

**Files:**
- Create: `frontend/src/modules/jobs/JobsModule.jsx`
- Test: append to `frontend/src/modules/jobs/__tests__/JobsModule.test.jsx`

- [ ] **Step 1: Write failing tests** (append):

```jsx
import JobsModule from '../JobsModule';
import { EMPTY_JOBS_FILTERS } from '../jobsFilters';

const moduleJobs = [
  { id: '2001', customer: 'Ventia', customerId: 'VENT', status: 'PRINT', priority: 'Normal', assignedTo: 'Emon', due: '12/06/2026', total: 100, items: [], shipTo: 'SYD' },
  { id: '2002', customer: 'CPB', customerId: 'CPB', status: 'QUOTE', priority: 'Urgent', assignedTo: 'Sam', due: '15/06/2026', total: 200, items: [], shipTo: 'MEL' },
];

const base = {
  jobs: moduleJobs,
  filters: EMPTY_JOBS_FILTERS,
  onFilterChange: vi.fn(),
  onClearFilters: vi.fn(),
  viewMode: 'table',
  onViewModeChange: vi.fn(),
  currentUser: { username: 'Emon' },
  onJobClick: vi.fn(),
};

test('table mode shows filtered rows; active filter renders a removable chip', () => {
  render(<JobsModule {...base} filters={{ ...EMPTY_JOBS_FILTERS, status: 'PRINT' }} />);
  expect(screen.getByText('2001')).toBeInTheDocument();
  expect(screen.queryByText('2002')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Remove Status filter'));
  expect(base.onFilterChange).toHaveBeenCalledWith('status', 'all');
});

test('board mode renders kanban columns instead of the grid', () => {
  render(<JobsModule {...base} viewMode="board" />);
  expect(screen.getByText('QUOTE')).toBeInTheDocument();   // column header
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('view toggle fires onViewModeChange', () => {
  render(<JobsModule {...base} />);
  fireEvent.click(screen.getByLabelText('Board view'));
  expect(base.onViewModeChange).toHaveBeenCalledWith('board');
});
```

(If a selector doesn't match KanbanColumn's actual header markup, inspect and adjust the SELECTOR, keeping intent.)

- [ ] **Step 2: Run to verify failure**, then **Step 3: Implement JobsModule.jsx**

```jsx
import { useMemo } from 'react';
import FilterBar from '../../ui/FilterBar';
import Button from '../../ui/Button';
import JobsList from './JobsList';
import JobsBoard from '../../components/jobs/JobsBoard';
import { filterJobs, buildFilterOptions, QUICK_FILTERS, EMPTY_JOBS_FILTERS } from './jobsFilters';
import { STATUS_COLORS, T } from '../../ui/tokens';

// Maps controlled-filter keys → FilterBar chip defs. 'all'/empty/null = inactive.
const CHIP_DEFS = [
  { key: 'status', label: 'Status', inactive: 'all' },
  { key: 'priority', label: 'Priority', inactive: 'all' },
  { key: 'customer', label: 'Customer', inactive: 'all' },
  { key: 'assignedTo', label: 'Assignee', inactive: 'all' },
  { key: 'shipCode', label: 'Ship To', inactive: 'all' },
  { key: 'customerGroup', label: 'Group', inactive: 'all' },
  { key: 'quick', label: 'Quick', inactive: null },
];

export default function JobsModule({
  jobs, filters, onFilterChange, onClearFilters,
  viewMode, onViewModeChange, currentUser, onJobClick,
}) {
  const filtered = useMemo(() => filterJobs(jobs ?? [], filters, currentUser), [jobs, filters, currentUser]);
  const options = useMemo(() => buildFilterOptions(jobs ?? []), [jobs]);

  const chips = CHIP_DEFS
    .filter(d => filters[d.key] !== d.inactive && filters[d.key] != null && filters[d.key] !== '')
    .map(d => ({
      key: d.key,
      label: d.label,
      value: filters[d.key],
      display: d.key === 'quick'
        ? (QUICK_FILTERS.find(q => q.id === filters.quick)?.label ?? String(filters.quick))
        : d.key === 'customer'
          ? (options.uniqueCustomers.find(c => c.id === filters.customer)?.name ?? String(filters.customer))
          : String(filters[d.key]),
    }));

  const available = [
    { key: 'status', label: 'Status', options: Object.keys(STATUS_COLORS).map(s => ({ value: s, label: s })) },
    { key: 'priority', label: 'Priority', options: ['Urgent', 'High', 'Normal', 'Low'].map(p => ({ value: p, label: p })) },
    { key: 'customer', label: 'Customer', options: options.uniqueCustomers.map(c => ({ value: c.id, label: c.name })) },
    { key: 'assignedTo', label: 'Assignee', options: options.uniqueAssignees.map(a => ({ value: a, label: a })) },
    { key: 'shipCode', label: 'Ship To', options: options.uniqueShipCodes.map(s => ({ value: s, label: s })) },
    { key: 'customerGroup', label: 'Group', options: options.uniqueGroups.map(g => ({ value: g, label: g })) },
    { key: 'quick', label: 'Quick', options: QUICK_FILTERS.map(q => ({ value: q.id, label: q.label })) },
  ];

  const removeFilter = (key) => {
    const def = CHIP_DEFS.find(d => d.key === key);
    onFilterChange(key, def ? def.inactive : 'all');
  };

  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ marginBottom: 10 }}>
        <FilterBar
          filters={chips}
          available={available}
          onAdd={onFilterChange}
          onRemove={removeFilter}
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {chips.length > 0 && (
                <Button size="sm" variant="ghost" onClick={onClearFilters}>Clear all</Button>
              )}
              <Button
                size="sm"
                variant={viewMode === 'table' ? 'primary' : 'secondary'}
                aria-label="Table view"
                onClick={() => onViewModeChange('table')}
              >
                ☰ List
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'board' ? 'primary' : 'secondary'}
                aria-label="Board view"
                onClick={() => onViewModeChange('board')}
              >
                ⊞ Board
              </Button>
            </div>
          }
        />
      </div>
      {viewMode === 'board'
        ? <JobsBoard jobs={filtered} onJobClick={onJobClick} />
        : <JobsList jobs={filtered} onJobClick={onJobClick} />}
    </div>
  );
}
```

Note: date-range filters (dateFrom/dateTo/dateField) remain settable from outside via `filters` but have no chip UI in this task — they were buried in the old "more filters" panel; FilterBar date support is a known Phase 2 extension (see FilterBar review notes). Don't add date pickers here.

- [ ] **Step 4: Run tests — expect PASS**, **Step 5: Commit**

```bash
git add frontend/src/modules/jobs/JobsModule.jsx frontend/src/modules/jobs/__tests__/JobsModule.test.jsx
git commit -m "feat: JobsModule — controlled jobs list/board with FilterBar chips"
```

---

### Task 5: Wire JobsModule into the monolith

**Files:**
- Modify: `frontend/src/TotalImageERP.jsx`

- [ ] **Step 1: Add import** (next to the JobsBoard import at line 18):

```js
import JobsModule from './modules/jobs/JobsModule';
```

- [ ] **Step 2: Replace the list portion of renderJobs**

In `renderJobs()` (starts :1897): DELETE the filter-options block, `parseJobDate`, the `filteredJobs` predicate, `hasActiveFilters`, and the `{!showJobDetail && <JobsBoard .../>}` JSX — i.e. everything that Task 1/4 now owns — and replace the JobsBoard JSX with:

```jsx
        {!showJobDetail && (
          <JobsModule
            jobs={jobs}
            filters={{
              searchTerm,
              status: filterStatus,
              priority: filterPriority,
              customer: filterCustomer,
              assignedTo: filterAssignedTo,
              dateFrom: filterDateFrom,
              dateTo: filterDateTo,
              dateField: filterDateField,
              shipCode: filterShipCode,
              customerGroup: filterCustomerGroup,
              openFreight: filterOpenFreight,
              quick: filterQuick,
              jobList: activeJobList,
            }}
            onFilterChange={setJobsFilter}
            onClearFilters={clearFilters}
            viewMode={jobsViewMode === 'board' ? 'board' : 'table'}
            onViewModeChange={setJobsViewMode}
            currentUser={currentUser}
            onJobClick={(job) => { setActiveJob(job); openModal('job'); }}
          />
        )}
```

KEEP: `clearFilters` (move it to component scope just above `renderJobs` if it references only setters — it does), the `statusColors`/`jStatusColors` maps IF the detail branch below uses them (check with grep inside 2023-2739; if only the deleted list code used them, delete them too), and the ENTIRE detail branch `{activeJob && showJobDetail && (...)}` untouched.

- [ ] **Step 3: Add the `setJobsFilter` dispatcher** at component scope (next to `clearFilters`):

```js
  const setJobsFilter = (key, value) => {
    const setters = {
      searchTerm: setSearchTerm,
      status: setFilterStatus,
      priority: setFilterPriority,
      customer: setFilterCustomer,
      assignedTo: setFilterAssignedTo,
      dateFrom: setFilterDateFrom,
      dateTo: setFilterDateTo,
      dateField: setFilterDateField,
      shipCode: setFilterShipCode,
      customerGroup: setFilterCustomerGroup,
      openFreight: setFilterOpenFreight,
      quick: setFilterQuick,
      jobList: setActiveJobList,
    };
    setters[key]?.(value);
  };
```

- [ ] **Step 4: Clean up orphans** — if `showMoreFilters` state and the old filter-panel JSX are now unreferenced, delete them (they were exclusively the old list UI). `grep -n "showMoreFilters\|filterOpenFreight" frontend/src/TotalImageERP.jsx` to confirm before deleting. Do NOT delete state still referenced elsewhere (dashboard actions reference setFilterStatus/setSearchTerm — those stay).

- [ ] **Step 5: Verify** — `npm test` green; `npm run build` succeeds; dev server: Jobs module shows FilterBar + DataGrid, clicking a row opens the job modal, board toggle works, dashboard "Overdue"/"To Invoice" quick actions still navigate and filter.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/TotalImageERP.jsx
git commit -m "feat: Jobs list runs on JobsModule; legacy filter code removed from renderJobs"
```

---

### Task 6: LiveTree saved lists deep-link into Jobs filters

**Files:**
- Modify: `frontend/src/ui/shell/AppShell.jsx`
- Modify: `frontend/src/TotalImageERP.jsx`

- [ ] **Step 1: AppShell forwards onSelectList**

In `AppShell.jsx`: add `onSelectList` to the destructured props; change LiveTree's prop from `onSelectList={() => onNavigate('jobs')}` to `onSelectList={onSelectList ?? (() => onNavigate('jobs'))}`.

- [ ] **Step 2: Monolith maps list ids to filters**

In TotalImageERP.jsx, add to the `<AppShell ...>` props:

```jsx
      onSelectList={(listId) => {
        clearFilters();
        if (listId === 'mine') setFilterQuick('myJobs');
        else if (listId === 'due-today') setFilterQuick('dueToday');
        else if (listId === 'overdue') setFilterQuick('overdue');
        else if (listId === 'pickpack') setFilterStatus('Pick/Pack');
        setShowJobDetail(false);
        setActiveModule('jobs');
      }}
```

(Semantic note: LiveTree's "My Jobs" count uses `accMgr` while the quick filter matches `assignedTo` — counts and list contents may differ. This mirrors the app's existing dual semantics; reconcile in Phase 2b when the detail/form lands. Do not "fix" silently.)

- [ ] **Step 3: Verify** — dev server: clicking Overdue in LiveTree lands on Jobs with the Quick: Overdue chip active and the grid filtered. `npm test` green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/ui/shell/AppShell.jsx frontend/src/TotalImageERP.jsx
git commit -m "feat: LiveTree saved lists deep-link into jobs quick filters"
```

---

### Task 7: Ctrl+K focuses global search

**Files:**
- Modify: `frontend/src/ui/shell/ModuleBar.jsx`
- Test: append one test to `frontend/src/ui/__tests__/ModuleBar.test.jsx`

- [ ] **Step 1: Write failing test** (append to ModuleBar.test.jsx):

```jsx
test('Ctrl+K focuses the search input', () => {
  render(<ModuleBar {...base} />);
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
  expect(screen.getByPlaceholderText('Search…')).toHaveFocus();
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: Implement in ModuleBar.jsx**

Add to imports: `import { useEffect, useRef } from 'react';`. Inside the component:

```jsx
  const searchRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
```

Add `ref={searchRef}` to the search `<input>`. Update the placeholder to `Search…  Ctrl+K`? NO — keep placeholder as `Search…` (test depends on it; a `title="Ctrl+K"` attribute on the input is allowed).

- [ ] **Step 4: Run tests — expect PASS** (30 total), **Step 5: Commit**

```bash
git add frontend/src/ui/shell/ModuleBar.jsx frontend/src/ui/__tests__/ModuleBar.test.jsx
git commit -m "feat: Ctrl+K focuses ModuleBar search (Phase 1 deferral closed)"
```

---

### Task 8: Phase 2a verification

- [ ] **Step 1:** `cd frontend && npm test` — all green (≈33 tests)
- [ ] **Step 2:** `cd backend && python -m pytest --no-cov -q` — `134 passed` (untouched)
- [ ] **Step 3:** `cd frontend && npm run build` — success
- [ ] **Step 4:** Dev-server smoke: Jobs list on DataGrid (dense rows, status colours, money right-aligned) · filter chips add/remove · board toggle · row click opens job modal · LiveTree Overdue deep-link · dashboard quick actions · Ctrl+K · Job Detail page (View Job) unchanged
- [ ] **Step 5:** Update CLAUDE.md "Key architecture": append `- frontend/src/modules/jobs/ — Jobs module (JobsModule, JobsList, jobsFilters) — first migrated module`
- [ ] **Step 6:** Commit

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — jobs module migration"
```

Phase 2b (Job Detail page + job form on primitives, Quotes view) is planned after this lands.

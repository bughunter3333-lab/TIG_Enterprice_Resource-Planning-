# Quotes View Implementation Plan (Phase 2b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Quotes module from a "coming soon" placeholder into a working view — the jobs experience locked to `status === 'QUOTE'` — by adding a `lockedStatus` prop to the existing `JobsModule` and routing the Quotes module through `renderJobs`.

**Architecture:** Quotes are jobs with `status === 'QUOTE'` (the codebase already treats them that way — `quoteCount`, the detail branch's quote-vs-invoice PDF logic, approval handling). So the Quotes view is the Jobs list pre-filtered and locked to QUOTE. No new list/detail components: `JobsModule` gains an optional `lockedStatus` prop; the monolith routes both `jobs` and `quotes` modules through `renderJobs`, passing `lockedStatus="QUOTE"` for quotes. The shared Job Detail branch (already QUOTE-aware) handles quote records unchanged.

**Tech Stack:** React 18 + Vite, Phase 1 primitives, vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-06-11-ui-redesign-dense-jim2-design.md` §3.4 (Quotes reuses the Jobs view).

---

## Scope note — why Job Detail is NOT in this phase

The original Phase 2b sketch paired Quotes with a Job Detail re-skin. Exploration (2026-06-13) showed the Job Detail page is a poor standalone re-skin target:
- Its secondary tab strip (Pick/Pack · Documents · Cost · Activity at TotalImageERP.jsx:2295-2313) has toggle-to-deselect semantics (clicking the active tab returns to the main 'job' view) that the `Tabs` primitive does not model — a verbatim swap would change behaviour.
- The detail card (lines 2033-2294) is wired to ~15 monolith setters/handlers (paymentModal, dispatchModal, jobDetailTab, PDF links). Extracting it means prop-drilling all of them — high risk, low visual gain (it is already dense Jim2 style).
- The detail card's header field grid is nearly identical to the Job form's header grid. They are two views of one entity and should be reworked **together** in the job-form phase (2c), not split.

Job Detail therefore moves to Phase 2c alongside the job form. Phase 2b is Quotes only.

---

## Codebase facts (verified 2026-06-13 — do not re-derive)

- `JobsModule` (`frontend/src/modules/jobs/JobsModule.jsx`) is controlled: props `jobs, filters, onFilterChange, onClearFilters, viewMode, onViewModeChange, currentUser, onJobClick`. It computes `filtered = filterJobs(jobs, filters, currentUser)` and `options = buildFilterOptions(jobs)` (both useMemo), builds `chips` from `CHIP_DEFS`, builds `available` (status options from `Object.keys(STATUS_COLORS)`, etc.), and renders FilterBar + (JobsList | JobsBoard).
- `CHIP_DEFS` includes `{ key: 'status', label: 'Status', inactive: 'all' }`.
- `filterJobs(jobs, f, currentUser, now?)` matches status via `f.status === 'all' || job.status === f.status`.
- `renderJobs()` (TotalImageERP.jsx:1931) renders `{!showJobDetail && <JobsModule .../>}` then the shared detail branch `{activeJob && showJobDetail && (...)}`. `activeModule` is in scope inside the component.
- Module router (TotalImageERP.jsx ~9173): `{!loading && activeModule === 'jobs' && renderJobs()}`. The "coming soon" placeholder array at ~9177 is `['ebusiness','documents','projects','assets','quotes']` — `quotes` must be removed from it.
- ModuleBar already has a `Quotes` tab (id `quotes`, badge `quoteCount`); LiveTree/AppShell already navigate by module id. No nav wiring needed.
- The detail branch already special-cases QUOTE (lines 1985, 2015, 2665): quote-vs-invoice PDF, quote approval. Clicking a quote row opens the same detail/modal as a job — no changes needed there.
- Tests: `cd frontend && npm test` (43 green). Build: `npm run build`.
- PostToolUse hook errors about `check-sql-files.py` are a broken machine-local hook — ignore; writes succeed.

## File Map

| File | Responsibility |
|---|---|
| `frontend/src/modules/jobs/JobsModule.jsx` | Modify — add optional `lockedStatus` prop |
| `frontend/src/modules/jobs/__tests__/JobsModule.test.jsx` | Modify — append lockedStatus tests |
| `frontend/src/TotalImageERP.jsx` | Modify — pass `lockedStatus` for quotes; route quotes module through renderJobs; remove quotes from placeholder |
| `CLAUDE.md` | Modify — note quotes view |

---

### Task 1: JobsModule `lockedStatus` prop

**Files:**
- Modify: `frontend/src/modules/jobs/JobsModule.jsx`
- Test: append to `frontend/src/modules/jobs/__tests__/JobsModule.test.jsx`
- Modify: `frontend/src/modules/jobs/JobsList.jsx` — hide the Status column when `lockedStatus` is set (redundant in a single-status view)

When `lockedStatus` is set, JobsModule (a) forces the status filter to that value regardless of `filters.status`, (b) hides the Status chip (it's implied by the module, not removable), and (c) removes Status from the "+ Filter" add menu (can't add a conflicting status). All other filters work normally within the locked subset.

- [ ] **Step 1: Write failing tests** (append to JobsModule.test.jsx)

```jsx
test('lockedStatus shows only matching jobs regardless of filters.status', () => {
  render(<JobsModule {...base} lockedStatus="QUOTE" jobs={[
    { id: '3001', customer: 'A', customerId: 'A', status: 'QUOTE', priority: 'Normal', assignedTo: 'Emon', due: '12/06/2026', total: 10, items: [], shipTo: 'SYD' },
    { id: '3002', customer: 'B', customerId: 'B', status: 'PRINT', priority: 'Normal', assignedTo: 'Sam', due: '12/06/2026', total: 20, items: [], shipTo: 'MEL' },
  ]} filters={{ ...EMPTY_JOBS_FILTERS, status: 'PRINT' }} />);
  // status:'PRINT' in filters is overridden by lockedStatus:'QUOTE'
  expect(screen.getByText('3001')).toBeInTheDocument();
  expect(screen.queryByText('3002')).not.toBeInTheDocument();
});

test('lockedStatus hides the Status chip and removes Status from the add menu', () => {
  render(<JobsModule {...base} lockedStatus="QUOTE" filters={{ ...EMPTY_JOBS_FILTERS, status: 'QUOTE' }} />);
  // no removable Status chip
  expect(screen.queryByLabelText('Remove Status filter')).not.toBeInTheDocument();
  // Status not offered in the + Filter menu
  fireEvent.click(screen.getByText('+ Filter'));
  expect(screen.queryByText('Status')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure** — `cd "/d/Total Image Group/frontend" && npm test` (lockedStatus not yet handled → first test fails because 3002 PRINT would show, or prop ignored)

- [ ] **Step 3: Implement in JobsModule.jsx**

Add `lockedStatus` to the destructured props (after `onJobClick`):

```jsx
export default function JobsModule({
  jobs, filters, onFilterChange, onClearFilters,
  viewMode, onViewModeChange, currentUser, onJobClick, lockedStatus,
}) {
```

Compute effective filters and use them for filtering:

```jsx
  const effectiveFilters = lockedStatus ? { ...filters, status: lockedStatus } : filters;
  const filtered = useMemo(() => filterJobs(jobs ?? [], effectiveFilters, currentUser), [jobs, effectiveFilters, currentUser]);
```

(Replace the existing `filtered` useMemo. Keep the `options` useMemo as-is.)

When building `chips`, exclude `status` if locked — change the `CHIP_DEFS.filter(...)` to also skip the locked key:

```jsx
  const chips = CHIP_DEFS
    .filter(d => !(lockedStatus && d.key === 'status'))
    .filter(d => filters[d.key] !== d.inactive && filters[d.key] != null && filters[d.key] !== '')
    .map(d => ({ /* unchanged */ }));
```

When building `available`, drop the status entry if locked. After the `available` array is defined, add:

```jsx
  const availableFiltered = lockedStatus ? available.filter(a => a.key !== 'status') : available;
```

and pass `available={availableFiltered}` to `<FilterBar>` (instead of `available={available}`).

Note: `effectiveFilters` is recomputed each render (cheap object spread); the useMemo dep on it is fine because filterJobs is the expensive part and the spread is trivial. Do NOT wrap effectiveFilters itself in useMemo (over-engineering).

- [ ] **Step 4: Run tests — expect PASS** (45 expected: 43 + 2)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/jobs/JobsModule.jsx frontend/src/modules/jobs/__tests__/JobsModule.test.jsx
git commit -m "feat: JobsModule lockedStatus — locks list to one status, hides its chip"
```

---

### Task 2: Wire the Quotes module

**Files:**
- Modify: `frontend/src/TotalImageERP.jsx`

- [ ] **Step 1: Pass lockedStatus for quotes in renderJobs**

In the `<JobsModule .../>` usage inside `renderJobs` (TotalImageERP.jsx, the `{!showJobDetail && (` block), add this prop (after `onJobClick={...}`):

```jsx
            lockedStatus={activeModule === 'quotes' ? 'QUOTE' : undefined}
```

- [ ] **Step 2: Route the quotes module through renderJobs**

Find the module router line `{!loading && activeModule === 'jobs' && renderJobs()}` (~line 9173) and change it to:

```jsx
                {!loading && (activeModule === 'jobs' || activeModule === 'quotes') && renderJobs()}
```

- [ ] **Step 3: Remove quotes from the coming-soon placeholder**

Find the placeholder array (~line 9177) `['ebusiness','documents','projects','assets','quotes']` and remove `'quotes'`:

```jsx
                {!loading && ['ebusiness','documents','projects','assets'].includes(activeModule) && (
```

- [ ] **Step 4: Verify** — `cd frontend && npm test` (45 green); `npm run build` succeeds. Dev-server smoke: click the **Quotes** tab in ModuleBar → grid shows only QUOTE jobs, no Status chip, "+ Filter" menu has no Status option; clicking a quote row opens the job detail (with the quote/approval affordances); the **Jobs** tab still shows all statuses with a working Status filter.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/TotalImageERP.jsx
git commit -m "feat: Quotes module renders the jobs view locked to QUOTE status"
```

---

### Task 3: Phase 2b verification

- [ ] **Step 1:** `cd frontend && npm test` — all green (45)
- [ ] **Step 2:** `cd backend && python -m pytest --no-cov -q` — `134 passed` (untouched)
- [ ] **Step 3:** `cd frontend && npm run build` — success
- [ ] **Step 4:** Dev-server smoke: Quotes tab (QUOTE-only, no Status chip) · Jobs tab unaffected (all statuses, Status filter works) · quote row opens detail · board/list toggle works in both · LiveTree + dashboard quick-actions still navigate to Jobs correctly
- [ ] **Step 5:** Update CLAUDE.md "Key architecture": change the jobs-module bullet to mention quotes, e.g. append to the existing `frontend/src/modules/jobs/` line: `; Quotes module reuses JobsModule via lockedStatus="QUOTE"`
- [ ] **Step 6:** Commit

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — quotes view via JobsModule lockedStatus"
```

---

## Known deferrals (recorded for later phases)

- **Job Detail page + Job form** → Phase 2c (the job-entity surface, reworked as a unit; shared header field grid).
- **"New Quote" affordance:** the ModuleBar "New Job" button still creates a job; creating a quote means setting status QUOTE in the form. A dedicated "New Quote" button (pre-setting QUOTE) is a future nicety, not in scope.
- **Filter options in Quotes view** are built from all jobs (`buildFilterOptions(jobs)`), so the customer/assignee menus may list entities that have no current quotes. Acceptable; tighten later only if it bothers users.
- **Dashboard "quotes awaiting approval"** could deep-link to the Quotes module — future wiring, not in scope.

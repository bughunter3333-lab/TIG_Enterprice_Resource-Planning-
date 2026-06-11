# ERP UI Redesign — Dense Data-First, Jim2 Anatomy

**Goal:** Re-skin and restructure the entire frontend into a dense, data-first design modelled on Jim2's layout (the team's current ERP), while extracting every module out of the 9,642-line `TotalImageERP.jsx` monolith into focused component folders. Complete the unbuilt Stock module on the new foundation. End state: feature-complete app on the new design, tested, ready for a team trial period. **Production deployment is explicitly out of scope** — it becomes its own phase after the trial.

**Tech stack (unchanged):** React 18 + Vite + TanStack Query v5 (JSX), FastAPI + SQLAlchemy + Alembic + PostgreSQL, pytest with SQLite in-memory.

---

## Decisions already made (validated with mockups)

These were chosen interactively via mockup comparison on 2026-06-11. Mockups persist in `.superpowers/brainstorm/1777-1781163103/content/`. Jim2 reference photos: `C:\Users\user\OneDrive\ERP\` (2.0 and stock subfolders).

1. **Direction: Dense Data-First Pro** — compact rows, more data on screen, row-level colour cues. Built for operators who live in the tool all day. Not a card-based SaaS look.
2. **Anatomy: Jim2 layout, modern skin** — top module bar, left live tree, filter chips, dense grid, bottom status bar.
3. **Live tree: yes** (full Jim2 parity) — open records + saved lists in a collapsible left panel.
4. **Accent: amber on zinc** — amber identity colour on dark-zinc chrome. Status colours stay semantic.
5. **Scope: everything** — all ~15 surfaces. Core modules get full treatment; secondary surfaces get shell + theme with lighter rework.
6. **Kanban survives as a toggle** on Jobs; the dense list view becomes the default.
7. **The June 10 Stock module spec is implemented as part of this work**, frontend re-targeted at the new primitives (see `2026-06-10-stock-module-design.md`).

---

## 1. Design system

New folder `frontend/src/ui/` is the single source of visual truth.

### Tokens — `frontend/src/ui/tokens.js` + CSS variables in `index.css`

```js
export const T = {
  // Surfaces (zinc)
  chrome: '#18181b',        // module bar, status bar
  chromeRaised: '#27272a',  // active tab on chrome, search box
  page: '#fafafa',          // app background
  panel: '#ffffff',         // tables, forms, tree
  hairline: '#e4e4e7',      // borders — layering is done with borders, not shadows
  hairlineSoft: '#f4f4f5',  // row separators, table header bg

  // Text
  text: '#18181b',
  textMuted: '#71717a',
  textFaint: '#a1a1aa',     // chrome inactive items
  headerText: '#52525b',    // table column headers

  // Accent (amber identity)
  accent: '#eab308',        // logo block, active indicators, tree highlight border
  accentStrong: '#ca8a04',  // primary buttons
  accentTint: '#fef9c3',    // selected row background
  accentFocus: '#fef08a',   // input focus ring

  // Status (semantic, used app-wide for job/stock states)
  statusQuote: '#7c3aed',
  statusConfirm: '#b45309',
  statusDecorate: '#1d4ed8',
  statusReady: '#15803d',
  statusOverdue: '#b91c1c',
  statusCancel: '#71717a',
};
```

### Type & density rules

- Font: system stack (`'Segoe UI', system-ui, sans-serif`); **13px base**, 12px in grids, 11px uppercase column headers.
- `font-variant-numeric: tabular-nums` on all money/qty columns.
- 4px spacing grid. Table rows ~30px. Radii 3–4px. No drop shadows on data surfaces.
- Money right-aligned; dates DD/MM; status text uppercase + semibold in its status colour.

### Primitives — `frontend/src/ui/`

Each is one file, built once in Task 1, reused by every module:

| Primitive | Responsibility |
|---|---|
| `DataGrid.jsx` | Dense table: column defs (`{key, label, width, align, render}`), client sort, row click/double-click, selected-row tint, sticky header, empty/loading/error states built in |
| `FilterBar.jsx` | Active filters as removable chips + "+ Filter" dropdown of available fields. Replaces Jim2's full-page filter form |
| `StatusBadge.jsx` | Status text in semantic colour; one mapping table for all job/stock statuses |
| `Button.jsx` | primary (amber) / secondary (outline) / danger / ghost; sm + md sizes |
| `Field.jsx`, `Select.jsx` | Label-above-input, dense (26px input height), amber focus ring, inline error text |
| `Tabs.jsx` | Underline-style tabs for detail panels |
| `Modal.jsx` | Replaces hand-rolled overlay divs |
| `KpiTile.jsx` | Dense stat cell (label + value + optional delta) for dashboard and module headers |
| `Toast.jsx` | Mutation success/error feedback (replaces silent failures) |

## 2. App shell — `frontend/src/ui/shell/`

Replaces `Rail.jsx`, `LabelPanel.jsx`, `Topbar.jsx`, `Shell.jsx`.

- **`ModuleBar.jsx`** (top, 40px, chrome): amber TIG block; module tabs — Dashboard · Jobs · Quotes · Purchases · Stock · CardFiles · Accounts · overflow menu for secondary modules; right side: global search (Ctrl+K — searches jobs, customers, SKUs via existing list queries), user menu (profile, Admin Tools for admin role, logout).
- **`LiveTree.jsx`** (left, 190px, collapsible to 0 with a rail toggle):
  - **OPEN** — records opened this session (jobs/stock/POs), each row: number + status in colour. Click = jump back to it. Persisted in `localStorage` (`tig.openRecords`, max 15, LRU).
  - **LISTS** — saved filters with live counts: My Jobs, Due Today, Overdue, Despatch Ready (counts derived from the already-cached jobs query; no new endpoints).
  - Module-specific sections appear per active module (e.g. recent SKUs under Stock).
- **`StatusBar.jsx`** (bottom, 24px, chrome): user, branch/location, company name, connection dot (green/red, driven by polling the existing `/health` endpoint every 60s).
- **`AppShell.jsx`** composes the three around a content slot; owns `activeModule`, `openRecords`, and the navigate-to-record mechanism (`openRecord({type, id})`) that LiveTree, DataGrid cells, and Stock tabs all share.

## 3. Module migration — method and order

**Method per module:** extract from `TotalImageERP.jsx` into `frontend/src/modules/<name>/`, rebuild UI on primitives, **API calls and business logic copied verbatim** (re-skin + relocate, not rewrite), smoke-test module CRUD in dev server, delete the inline `render<X>()` from the monolith, commit. The app builds and works after every step.

**Order:**

1. **Foundation** — tokens, primitives, shell; wire shell into the app (modules render inside it, still old-styled)
2. **Jobs** — `modules/jobs/`: list on DataGrid + FilterBar (default view; filters: status, acc mgr, customer, date range, due window); kanban as toggle (existing JobsBoard restyled); job form on Jim2's layout — header field grid, comments strip, line-items grid, totals box (SubTotal / Tax / Total / Prepaid / Balance Due) bottom-right
3. **Stock** — `modules/stock/`: full build per June 10 spec — backend first (migration, endpoints, tests), then master/detail UI: left DataGrid list + right `Tabs` (Details · Locations · Pricing · Transactions · Committed); Job#/PO# cells navigate via `openRecord`
4. **Quotes** — same treatment as Jobs list/form (quotes are jobs with status QUOTE; reuse the job form)
5. **Purchase Orders** — list + PO form + goods receipt flow
6. **CardFiles (Customers)** — list + customer detail incl. ship-tos
7. **Accounts** — accounts views + Accounts Payable merged under one module tab
8. **Dashboard** — dense KPI strip (KpiTile), activity feed, decoration mix chart, restyled
9. **Secondary surfaces** — Reports, Analytics, Email, Scheduling, Styles, Settings, User Management, Admin panel, Migration Wizard, Login: new shell + theme + primitives where cheap; no functional rework
10. **Monolith deletion** — `TotalImageERP.jsx` reduced to a thin module router (~200 lines); orphaned helpers removed

## 4. Stock module backend (from June 10 spec, unchanged)

- Extend `InventoryItem`: `item_type`, `gl_group`, `barcode`, `buy_unit`/`sell_unit`, `buy_tax_pct`/`sell_tax_pct`, cost-tracking columns (`last_cost`, `avg_cost`, `last_cog`, `avg_cog`, `max_cog`, `last_po_cogs`, `avg_po_cogs`, `last_ex`, `last_effective_date`, `price_template`)
- New tables: `stock_locations` (per-branch qty + bins, unique per sku+branch), `stock_price_levels` + `stock_price_breakpoints` (qty-break pricing)
- Extend `StockMovement`: `job_id`, `po_id`, `po_line`, `location_branch`, `qty_bal`, `pack_num`, `bin`, `link_tran_id`, `link_gl`
- One Alembic migration, all additive/nullable. Endpoints: `GET/POST/PATCH/DELETE /inventory/{sku}/locations`, `GET/PUT/POST/DELETE /inventory/{sku}/pricing...`, `GET /inventory/{sku}/transactions`, `GET /inventory/{sku}/committed` — exactly as specced in `2026-06-10-stock-module-design.md`.

## 5. Error handling

- `DataGrid` standardises query states: loading row, error strip with retry button — no more blank screens on failure.
- All mutations report through `Toast`: success confirmation, failure with the server's error message. No silent catch.
- Connection dot in StatusBar turns red when `/health` is unreachable, so warehouse staff can tell "app broken" from "network down".

## 6. Testing

- **Backend:** full pytest suite stays green after every task; Stock module adds the unit + integration tests listed in its spec; Alembic migration tested upgrade *and* downgrade.
- **Frontend:** primitives get unit tests (DataGrid sort/selection, FilterBar chip logic, StatusBadge mapping) since every module depends on them; each module migration is gated on a dev-server smoke test of that module's CRUD before commit.
- **Trial-readiness checklist (end of build):** lint + full test suite green; production bundle builds; login → create job → add line items → stock lookup → PO round-trip smoke test; all modules reachable in the new shell; no console errors on any module.

## Out of scope (deferred to post-trial phase)

- Production deployment. Agreed direction when the time comes: single VPS in Sydney (DigitalOcean/Vultr), Docker Compose (postgres + FastAPI + Caddy), automatic HTTPS on a company subdomain, nightly `pg_dump` to object storage with 30-day retention, firewall to 80/443/SSH, real Jim2 data import via the Migration Wizard. To be specced as its own design after the team trial.
- Any new business features beyond the Stock module spec.

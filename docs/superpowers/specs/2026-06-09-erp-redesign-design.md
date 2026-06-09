# TIG ERP — UI/UX Redesign + Jim2 Migration Features
**Date:** 2026-06-09  
**Status:** Approved  
**Scope:** Full frontend redesign, Jim2 field parity, Admin Tools panel, Jim2 CSV migration wizard

---

## 1. Problem

The existing `TotalImageERP.jsx` is a single ~2 000-line file with a dense, template-looking UI.  
It lacks the field depth of Jim2 Business Engine (the ERP being migrated from) and has no mechanism for admin customisation or data import.

---

## 2. Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Visual style | Clean Light SaaS | Professional, well-lit — suits embroidery/print context |
| Navigation | Icon Rail + Label Panel | Linear/Slack pattern — scales to 15+ modules |
| Jobs view | Kanban board (list view toggle) | Visualises production flow; list view for dense scanning |
| Dashboard | Split KPIs + Activity feed | Balanced for owner (financials) and staff (jobs) |
| Admin access | In-app toggle panel | Admin lock icon turns amber, panel swaps in — no separate URL |

---

## 3. App Shell Architecture

```
┌──────────────────────────────────────────────┐
│  [Rail 52px] │ [Label Panel 196px] │ [Main]   │
│              │                     │          │
│  Icon Rail   │  Nav items grouped  │ Topbar   │
│  (dark bg)   │  by section         │ Content  │
│              │                     │          │
│  Lock icon   │  "Admin Tools" link │          │
│  (amber)     │  (admin-only)       │          │
└──────────────────────────────────────────────┘
```

**Icon Rail** (`52px`, `#0f172a`):
- Logo tile (TIG, blue rounded square)
- Nav icons: Dashboard, Jobs, Quotes, Purchases, Customers, Stock, Accounts
- Spacer → avatar + lock icon at bottom
- Lock icon is amber; clicking it toggles Admin Tools panel

**Label Panel** (`196px`, `#1e293b`):
- Section headings: WORK, FINANCIALS, ADMIN (admin section only shown to admin users)
- Active item: blue right-border, blue text
- Counts/badges on Jobs and Quotes

**Topbar** (`50px`, white):
- Page title + breadcrumb sub-label
- Global search bar (200px)
- New Job CTA button
- Notification bell with red dot

**Content area**: scrollable, `#f1f5f9` background, `18px` padding

---

## 4. Dashboard

**KPI strip** (5-column grid):
- Revenue (this month)
- Jobs Open
- Due Today
- Paid
- + New Job CTA button (blue gradient)

**Two-column panel row**:
- Left: Recent Activity feed — timestamped job events (#3291 moved → FINISH, etc.)
- Right: Decoration Mix bar chart — EMB / DTF / Screen / DTG / Vinyl / Sub / Pad

**Kanban preview strip** (below panels):
- Mini read-only columns: QUOTE → ORDER → IN PROGRESS → PROOF → PRINT → FINISH → INVOICE → PAID
- Job counts per column, click-through to full Jobs Kanban

---

## 5. Jobs — Kanban Board

**Column headers**: QUOTE, ORDER, IN PROGRESS, PROOF, PRINT, FINISH, INVOICE, PAID  
**Column header styling**: coloured dot + column name + count badge

**Job cards** (per column):
- Job # (blue, bold) + Customer name
- Description (truncated to 1 line)
- Status badge + Due date chip
- Decoration type tag (EMB / DTF / etc.)
- Total $ (right-aligned)
- Left-border accent = status colour

**Board controls** (topbar row):
- Filter chips: All / Due Today / Overdue / Mine
- View toggle: Board / List (⊞ / ☰)
- Search within jobs

**List view** (toggle): dense table — Job #, Customer, Status badge, Dec type, Total, Due date, actions menu

---

## 6. Job Form — Jim2 Field Parity

The job form gains five fields to match Jim2's job header. These exist in the backend model but need migration + frontend exposure.

### Backend additions (migration required)

| Field | Column | Type | Notes |
|---|---|---|---|
| Price Level | `price_level` | `VARCHAR(50)` | Retail / Trade / Wholesale / VIP / Cost |
| Account Manager | `acc_mgr` | `VARCHAR(100)` | Free text (sales rep initials or name) |
| Invoice Description | `invoice_desc` | `TEXT` | Appears on the printed invoice |
| External Job Ref | `ex_job_ref` | `VARCHAR(100)` | Customer's own PO or reference number |
| Requested By | `requested_by` | `VARCHAR(100)` | Free-text person who placed the order |

New Alembic migration: `m7n8o9p0q1r2_jim2_job_fields.py`

### Frontend placement

In the Job form header section (right column, below Customer):
```
[Price Level ▾]  [Acc Mgr ________]
[Ex Job Ref _______________]
[Requested By _____________]
[Invoice Desc (multiline textarea)]
```

---

## 7. Admin Tools Panel

Accessible only to users with `role = 'admin'`. Toggled by the amber lock icon in the rail (and matching "Admin Tools" link in label panel). Visually distinct: dark slate background with amber accents.

### Sub-sections

**1. Job Header Fields**
- Toggle on/off + drag-to-reorder for: Price Level, Acc Mgr, Contract, Ex Job Ref, Requested By, Invoice Desc
- Changes saved to `admin_settings` JSON column (no migration needed — store as JSON)

**2. Status Workflow**
- Draggable chips for the 8 default statuses
- Add / remove / rename custom statuses
- Colour picker per status

**3. Price Levels**
- Table: Level name | Discount % | Default (radio)
- Defaults: Retail 0%, Trade 10%, Wholesale 20%, VIP 25%, Cost 50%
- Add / edit / delete rows

**4. Decoration Types**
- Enable / disable per decoration type
- Show/hide in new job form and decoration mix chart

**5. Jim2 Migration Wizard**
Five sequential steps (Next button gated on completion of current step):

| Step | Action |
|---|---|
| 1. Export from Jim2 | Instructions + download link for Jim2 CSV export |
| 2. Import Card Files | Upload `cardfiles.csv` → maps to `customers` table |
| 3. Import Stock/Items | Upload `items.csv` → maps to `inventory_items` table |
| 4. Import Jobs | Upload `jobs.csv` → maps to `jobs` + `job_items` tables |
| 5. Validate & Confirm | Row counts, error list, confirm or rollback |

CSV field mapping is defined in a separate mapper config (not in the wizard UI). The wizard calls `POST /admin/migrate/...` endpoints (to be implemented in backend).

---

## 8. Jim2 Feature Parity (from screenshot analysis)

Features observed in Jim2 screenshots and their target in our ERP:

| Jim2 Feature | Our Implementation |
|---|---|
| Job tabs: Job / Cost / Starts / Linked Jobs / Invoice Details | Job form sections (accordion or tabbed) |
| Financial footer: SubTotal / Tax / Total / Paid / Balance Due | Already exists in PDF generator; expose in job view |
| Create Quote + Create Similar buttons | Add "Duplicate as Quote" action on job actions menu |
| Accounts module: Debtors / Creditors | Phase 2 — not in this redesign sprint |
| Scheduling module | Phase 2 |
| eBusiness / Documents tabs | Phase 2 |
| Left nav tree (all modules) | Covered by Icon Rail + Label Panel |
| Dashboard module with widgets | Our dashboard covers this |
| Lock Rate checkbox on job | Add `lock_rate: bool` field to job header |
| Status set by bulk OpenFreight Script | Not applicable |

Items marked "Phase 2" are out of scope for this redesign sprint.

---

## 9. Implementation Order (New Shell First)

1. **App shell** — icon rail, label panel, topbar (new `Shell.jsx`, `Rail.jsx`, `LabelPanel.jsx`)
2. **Dashboard** — KPI strip, activity feed, decoration mix chart (`Dashboard.jsx`)
3. **Kanban Jobs** — board + list view toggle (`JobsBoard.jsx`, `JobCard.jsx`)
4. **Job Form updates** — add 5 Jim2 fields (frontend + Alembic migration)
5. **Admin Tools panel** — toggle + all sub-sections (`AdminPanel.jsx`)
6. **Jim2 Migration Wizard** — CSV upload + validation UI + backend endpoints

Each step ships independently. Step 1 replaces only the shell — existing page content renders inside the new content area unchanged.

---

## 10. File Structure (target)

```
frontend/src/
├── components/
│   ├── shell/
│   │   ├── Shell.jsx           # root layout
│   │   ├── Rail.jsx            # icon rail
│   │   ├── LabelPanel.jsx      # label panel
│   │   └── Topbar.jsx          # top bar
│   ├── dashboard/
│   │   ├── Dashboard.jsx
│   │   ├── KpiStrip.jsx
│   │   ├── ActivityFeed.jsx
│   │   └── DecMixChart.jsx
│   ├── jobs/
│   │   ├── JobsBoard.jsx       # kanban + list toggle
│   │   ├── KanbanColumn.jsx
│   │   ├── JobCard.jsx
│   │   └── JobForm.jsx         # modal / full-page form
│   └── admin/
│       ├── AdminPanel.jsx      # toggle shell
│       ├── FieldConfig.jsx
│       ├── StatusWorkflow.jsx
│       ├── PriceLevels.jsx
│       ├── DecorationTypes.jsx
│       └── MigrationWizard.jsx
├── hooks/
│   └── useJobsQuery.js
└── TotalImageERP.jsx           # retained as router root during migration
```

---

## 11. Out of Scope (this sprint)

- Accounts module (Debtors / Creditors / General Ledger)
- Scheduling module
- eBusiness / email integration
- Mobile / tablet responsive layout
- Dark mode
- Multi-tenant / multi-branch support

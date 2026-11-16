# Role-based Home (2026-10-19)

The app used to open on a Dashboard that showed every role the same thing, and
the top bar offered every module to everyone, including the ones whose every
route would answer 403. Now the app opens on **Home**, chosen for the role, and
the top bar leaves out a module only when the role can read nothing in it.

Both are decided by one thing: **the routes the role may call**, as the server
counts them from the gates on its own routes (`backend/app/core/access.py`, see
`2026-10-12-users-and-roles.md`). Nothing on screen decides visibility from a
role's name.

## Owner decisions (2026-10-19), final

1. **Each person may read their own role's access** — `GET /users/me/access`.
   Only an admin reads every role's (`GET /users/access`).
2. **The top bar hides no module a role can read anything in; Home is tailored
   per role.** So a module whose area has no route the role may read is hidden —
   derived from the gates, not listed by hand.
3. **Money reports are for staff and above** (`require_staff`). Overseas staff
   lose them; staff, managers and admins keep them. That covers the reports
   (`sales-summary`, `gst`, `aged-receivables`, `aged-payables`, customer
   statements, `inventory-valuation`, `job-profitability`, `bas-summary`), the
   bills (`/ap/bills`, `/ap/bills/{bill_id}`, `/ap/summary`), the customer
   statement PDF, and every analytics route that answers with currency amounts.
   Routes that answer only counts, days or on-time percentages stay open to
   everyone signed in.
4. **An invoice is overdue by the customer's payment terms**, counted from the
   invoice date (else the date in), using the customer's terms, else the
   company default, else Net 30 — not by the job's delivery date. Aged
   receivables are bucketed by days overdue: `current` (not yet due),
   `days_1_30`, `days_31_60`, `days_61_90`, `over_90`, on every row, line and
   total.

## `GET /users/me/access`

Gate: `require_any`. Not `get_signed_in_user`: `GET /users/me` is the only route
allowed to skip the own-password check, and `test_access_gates.py` holds it to
that.

```json
{
  "role": "staff",
  "areas": [{ "area": "Accounts", "view": [4, 14], "change": [4, 10] }],
  "allowed": ["GET /jobs", "GET /reports/aged-receivables", "POST /jobs", "POST /jobs/{job_id}/status"]
}
```

- `areas` is the caller's own column of the access table, in the same order.
- `allowed` is every route the role may call, sorted and unique, as
  `"METHOD /path"`: methods other than HEAD and OPTIONS, the path as the server
  matches it — router prefix included, `{param}` as declared — without the
  website's `/api` prefix.

The website reads it once (`api.users.myAccess`, `lib/useMyAccess.js`, query key
`['my-access']`) and keeps it for five minutes. It is dropped as soon as nothing
on screen uses it — on sign-out — so the next person to sign in on that browser
gets their own.

## The rule: visibility comes from `canCall`

`lib/access.js`:

- `canCall(access, method, path)` — true when `allowed` holds that method with a
  template matching the path, each `{param}` standing for exactly one non-empty
  segment. The template itself matches too. False until access has loaded.
- `areaView(access, area)` — the role's `[n, of]` reads in an area, or null.

**What a role gets is content; whether it shows is `canCall`.** Each Home tile
declares the routes it reads (`needs`) and shows only when every one is allowed.
The role picks which tiles and in what order; it never makes one visible.

**The top bar** (`ui/shell/ModuleBar.jsx`) hides a module only when its area's
read count for the role is 0. An area the table does not list keeps its module.

| Module | Area |
| --- | --- |
| Home | — (always shown) |
| Jobs, Quotes | Jobs and quotes |
| Purchases | Purchasing |
| Stock | Stock |
| Card Files | Card files |
| Customers | Customers |
| Accounts | Accounts |
| Reports | Reports |

While access is loading the bar draws no module tabs, rather than tabs that then
vanish. If access cannot be loaded it draws them all: the server still enforces
every route. **New Job** is hidden once access has loaded and `POST /jobs` is not
allowed.

## Home (`frontend/src/modules/home/`)

- A header line: *Home*, the person's name, and today's date in their own time.
- **To-dos** — the exception queues: overdue, due today, quotes expiring,
  finished not despatched. When every one has loaded and counts nothing, the
  section reads *Nothing needs you right now.* instead of a row of zeros.
- **Insights** — the rest.
- A section with no tile the person may see is left out.
- Each tile is one button: its title, a number of at most four characters
  (`1.2K`), and the unit and what it means underneath. Its accessible name is
  all of those together. While its data loads the tile is busy and keeps its
  size; if the data cannot be loaded it says *Couldn't load* — never 0 — and
  still opens its list.

### The job tiles

Each counts one shared job view (`modules/jobs/jobMetrics.js`) and opens the jobs
list on the quick filter for that view (`jobsFilters.js`), so **a count is the
length of the list it opens**. All of them read `GET /jobs`. Day comparisons use
day keys (`lib/dates.js`), never `toISOString`.

| Tile | Section | Counts | Opens |
| --- | --- | --- | --- |
| Overdue | To-dos | committed work (New to Pick/Pack) due before today | Jobs, *Overdue* |
| Due today | To-dos | committed work due today | Jobs, *Due today* |
| Quotes expiring this week | To-dos | quotes valid until today through today + 7 | **Quotes**, *Quotes expiring this week* |
| Finished not despatched | To-dos | FINISH or INVOICE with no despatch recorded | Jobs, *Finished not despatched* |
| My jobs | Insights | committed work the person manages or is assigned | Jobs, *My jobs* |
| Due this week | Insights | committed work due today through today + 7 | Jobs, *Due this week* |
| Pick/Pack | Insights | status Pick/Pack | Jobs, *Pick/Pack* |
| With the customer | Insights | status PROOF | Jobs, *With the customer* |
| To invoice | Insights | status FINISH | Jobs, *To invoice* |
| Orders not started | Insights | status ORDER | Jobs, *Orders not started* |
| In progress | Insights | status In Progress | Jobs, *In progress* |

### Tiles per role (`ROLE_TILES` in `homeSections.js`)

| Role | Tiles, in order |
| --- | --- |
| admin | To invoice |
| manager | Overdue, Due today, Due this week, With the customer |
| staff | My jobs, Due today, Overdue, Pick/Pack, Finished not despatched, Quotes expiring this week |
| overseas_staff | My jobs, Orders not started, In progress, With the customer, Due today, Overdue |

A role not listed gets the staff tiles.

Adding a tile is one entry in `TILES` — its title, section, `needs`, the source
it reads and how it counts it, its unit and footer, and where it opens — plus its
id in the roles that should see it. A tile reads a `source` passed to
`HomeModule` (today `jobs`, `inventory`, `purchaseOrders`, each shaped like a
query result) and opens either a quick list or a module.

## What went

- The Dashboard (`components/dashboard/*`) and its pieces: nothing used them once
  Home took its place. Alt+D now opens Home.
- The job status strip is on Jobs and Quotes only; Home has its own counts.

## Not done

- Money, stock, purchasing and users tiles — the next pass, on the same rule.
- A role changed by an admin reaches the top bar and Home within five minutes,
  or at the person's next sign-in. The server applies it at once.
- The status strip, the notification bell and the notifications list still count
  the same things for every role, and the notifications work out "quote
  expiring" with their own date arithmetic rather than the shared view.

## Second pass: money, stock, purchasing and accounts tiles

Each tile below counts exactly what the screen it opens shows. It declares the
routes it reads **and the routes that screen reads**, so a tile never opens onto
a refusal, and it shows only when every one is in the person's `allowed`.

### How a tile's routes are checked

`canSee` looks each of a tile's `needs` up in `allowed` **as written** — the
route templates the server declares — rather than reading it as a path with
`canCall`. Read as a path, `GET /jobs/order-requirements` passes for anyone
allowed `GET /jobs/{job_id}` (the `{job_id}` takes `order-requirements`).
Exact lookup is never looser than `canCall`.

### Where the data comes from

The job, stock and purchase-order tiles read the lists the app has loaded
(`sources` passed to `HomeModule`). The rest Home fetches itself
(`FETCHED` in `HomeModule.jsx`), and only while a tile the person may see reads
it — a role never calls a route it may not. Each uses the query key of the
screen the tile opens, so the tile and the screen share one answer:

| Source | Route | Query key |
| --- | --- | --- |
| `agedReceivables` | `GET /reports/aged-receivables` | `['reports/aged-receivables']` |
| `apSummary` | `GET /ap/summary` | `['ap-summary']` |
| `ledgerHealth` | `GET /accounting/health` | `['ledger-health']` |
| `basQuarter` | `GET /accounting/reports/bas?date_from&date_to` (this quarter) | `['ledger-bas', from, to]` |
| `users` | `GET /users` | `['users']` |
| `garmentReqs` | `GET /jobs/order-requirements?type=garment` | `['orderRequirements', 'garment']` |

A source that fails shows *Couldn't load* on every tile that reads it, never $0
or 0; the other tiles are unaffected.

### The tiles

| Tile | Section | Needs | Counts | Opens |
| --- | --- | --- | --- | --- |
| Owed to us | Insights | `GET /reports/aged-receivables` | `totals.total`, across `rows.length` customers | Reports, *Aged Receivables* |
| Overdue receivables | To-dos | `GET /reports/aged-receivables` | `totals.total − totals.current` (the 1–30 … over-90 columns), and the lines with `days_overdue > 0` | Reports, *Aged Receivables* |
| Supplier bills overdue | To-dos | `GET /ap/summary`, `GET /ap/bills` | `overdue_amount`, on `overdue_count` bills | Accounts, *Payables* (its Overdue card) |
| Ledger health | To-dos | `GET /accounting/health` | each side of the agreement check that is out (receivables, payables), plus each document listed under its findings (unposted, mismatched, paid with balance owing, invoiced without date); 0 reads *in agreement* | Accounts, *Ledger Health* |
| GST this quarter | Insights | `GET /accounting/reports/bas` | `net_gst` for the current BAS quarter, *payable* or *refund due* | Accounts, *Reports*, BAS, from/to = that quarter |
| Accounts needing attention | To-dos | `GET /users` | active accounts with `must_change_password` or without `totp_enabled` | Admin, *Users and roles*, filtered to *Needs attention* |
| Needs reorder | To-dos | `GET /inventory` | `needsReorder` (`stock/lowStock.js`) over the loaded inventory | Stock, chip *Needs reorder* (same rule) |
| Supplier POs late | To-dos | `GET /purchase-orders` | status Sent or Partial with an expected day key before today (`isLatePO`) | Purchases, filter *Late* (same rule), search cleared, no saved list on top |
| Garment lines to order | To-dos | `GET /jobs/order-requirements` | rows of the garment requirements (one per stock code) | Order Requirements, *Garment Requirements* |

Money is shown compact (`formatMoney`: `$0`, `$999`, `$1.2K`, `$1.2M`). The BAS
quarter is `basQuarter` in `accounting/accountingFormat.js`: Jul–Sep, Oct–Dec,
Jan–Mar, Apr–Jun, as day keys, so it is the viewer's own day.

The Order Requirements module (`activeModule 'order-requirements'`) had nothing
navigating to it; it renders and works (tests in
`modules/order-requirements/__tests__/`), so the garment tile links to it.

### Tiles per role, now

| Role | To-dos | Insights |
| --- | --- | --- |
| admin | Overdue receivables, Supplier bills overdue, Ledger health, Accounts needing attention | Owed to us, GST this quarter, To invoice |
| manager | Overdue, Due today, Needs reorder, Supplier POs late, Garment lines to order | Due this week, With the customer |
| staff | unchanged | unchanged |
| overseas_staff | unchanged | unchanged |

Overseas staff see none of the money tiles even under a list that names them:
the routes are not in their `allowed`.

### How a tile opens its screen

`HomeModule` calls `onOpenQuickList(quick)` for a job tile and
`onOpenLink(link)` for the rest (this replaced `onNavigate`). A link is
`{ module, ...that screen's opening props }`, or `{ admin: true, usersFilter }`;
`open` may be a function of the day (the GST tile's range). `TotalImageERP.jsx`
holds the link only while its module (and admin mode) is on screen, so reaching
a module any other way opens it as before. The opening props each screen gained:

| Screen | Prop |
| --- | --- |
| `ReportsModule` | `initialTab` |
| `accounting/AccountingModule` | `initialTab`, `initialReport` (`{ report, from, to }`) |
| `accounting/ReportsTab` | `initialReport`, `initialFrom`, `initialTo` |
| `stock/StockModule` → `StockList` | `initialChip` (new chip `reorder`, *Needs reorder*) |
| `purchase-orders/POModule` | filter `status: 'late'` and a *Late* button (`poFilters` `isLatePO`, `filterPOs(pos, f, today)`) |
| `components/admin/AdminPanel` → `users/UsersModule` | `usersFilter` → `initialFilter: 'attention'`; a *Needs attention N* chip (`userRules` `needsAttention`, `filterUsers({ attention })`) |

## Money surfaces follow the routes (decision 3)

Anything that calls a route moved to `require_staff` is offered only when the
person may call it, by `offers(access, failed, method, path)` in `lib/access.js`
(hook: `useOffer()` in `lib/useMyAccess.js`): canCall once access has loaded,
nothing while it loads, everything if it cannot be loaded (the server still
enforces every route) — the top bar's rule.

- **Reports**: a tab shows only if its route is allowed. Overseas staff keep
  *Overview* and *On-Time Delivery*. A tab it was sent to that is not shown falls
  back to Overview once access is known.
- **Accounts**: *Payables* shows only with `GET /ap/bills`.
- **Customers**: the statement *Download PDF* shows only with
  `GET /customers/{customer_id}/statement.pdf`; the on-screen statement stays.
- Analytics (`AnalyticsModule`) is imported by the monolith but mounted nowhere,
  so no screen calls an analytics route.

**Aged Receivables** shows the new buckets — Current, 1–30, 31–60, 61–90 and
Over 90 days overdue (`current`, `days_1_30`, `days_31_60`, `days_61_90`,
`over_90`) — in the totals, the table, its footer and the CSV. Its last column
reads `oldest_due`, which the server sends; it read `oldest_invoice`, which the
server never sent, so it was always blank.

## Still not done

- *Overview* in Reports works out total revenue, inventory value and revenue by
  customer from the loaded jobs and stock, so overseas staff still see those
  figures there. No route gates it; whether they should is an owner decision.
- The customer's *Aged AR* tab (`CustomersDetail.jsx`) still ages by the job's
  due date on the client, not by payment terms as decision 4 says.
- Aged Payables (`/reports/aged-payables`, unchanged by this work) puts 1–30
  days overdue in `days_31_60`, 31–60 in `days_61_90` and over 60 in `over_90`,
  so its columns are labelled one bucket late. Backend.

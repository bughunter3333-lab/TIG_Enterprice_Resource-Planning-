# Jim2 parity, and better — roadmap (2026-11-06)

The owner asked for every Jim2 feature TIG relies on, done better. TIG uses all
four areas of Jim2 (jobs/quotes/despatch, stock and purchasing, accounts, CRM
and scheduling). "Better" means, in this order of everything below: **fewer
clicks**, **works on a phone or tablet on the floor**, **the system does the
routine itself**, and **reports anyone can read at a glance**. Whether the
books stay in this app or go to MYOB/Xero is undecided (ask the accountant), so
operations come first and accounting waits on that answer.

How this was mapped (2026-11-06): Jim2 v4.6 help (jim2help.happen.biz/46,
~70 topic pages and the full contents) and review sites for what Jim2 does and
where users complain; a module-by-module read of this repo (routers, models,
frontend modules, `docs/backlog.md`) for what is built; and the JIM1–JIM31 /
ORD1–ORD12 notes from photographs of TIG's live Jim2 plus both simulations for
what TIG actually uses.

## Where the app stands

| Area | Built | Partly | Missing | Biggest gaps |
| --- | --- | --- | --- | --- |
| Jobs & quotes | 18 | 11 | 8 | status vocabulary (Booked/Confirmed/Picked/ProdExt), production board, job-list bulk actions, kits, email→job, quote revisions |
| Customers / CRM | 7 | 6 | 5 | contacts + activities timeline, leads, customer groups tree, customer price level, self-service login |
| Stock & warehouse | 13 | 6 | 6 | barcode scanning, reorder from sales velocity, kits, client-held stock, returns into RET |
| Purchasing | 7 | 7 | 2 | POs from selected jobs, PO approval, supplier ETAs, indent size curve, one receive path |
| Despatch & freight | 7 | 4 | 3 | OpenFreight wiring, carrier booking/labels/tracking, label fields, freight lines |
| Invoicing & receivables | 10 | 6 | 5 | returns/credit notes, auto-PAID, credit control, dunning, payment links |
| Payables | 6 | 2 | 2 | bills from receipts, bulk/ABA payments |
| Ledger / BAS | 7 | 3 | 5 | bank rec & feeds, budgets/cash flow, GST sessions, year end (or Xero/MYOB export) |
| Platform | — | — | — | screens built but unreachable, admin settings nothing reads, watchouts, audit trail, live list counters |

## Better than Jim2 — where Jim2 users hurt

From Happen's own documented limits and reviews: reporting is basic (Phocas or
SQL needed), report editing needs RAP/SQL skills, the UI is heavy for CRM-only
staff, Jim2 Mobile lacks watchouts and back orders, bank feeds are file uploads,
supplier credits must be applied before paying, 25-list cap per object, no
native Shopify. This app answers several already (web on any device, credit
notes applied inside a bill, AI assistant, live API); the phases below keep to
that.

## Phases

### Phase 0 — finish what is half-built (no owner decisions needed) — DONE 2026-11-07

Done: every built screen in the sidebar (Analytics' forecast tab crashed — fixed);
job list row selection with a bar to change status, move the due date and raise
POs per supplier (`POST /jobs/bulk-due`, `POST /purchase-orders/from-jobs`);
search finds jobs by the PO on their lines; ship label with Ship Code, Attn,
Ship Via, Sender Ref; pinned comments (`POST /jobs/{id}/comments/{id}/pin`);
credit hold on the customer form; a Sites tab (a site jobs deliver to is not
deleted — it failed with a server error on Postgres); every PDF escapes record
text (`app/core/pdf_text.py`); the four Admin tabs that saved settings nothing
read are no longer offered.

1. **Reach every built screen**: sidebar entries for Suppliers, Scheduling,
   Email, Import, Styles, Order requirements and Analytics (all built, none
   reachable except by search or a Home tile).
2. **Job-list daily controls** (JIM24, JIM26): change due date on selected jobs,
   create POs from selected jobs, filter jobs by PO number.
3. **Ship label completeness** (JIM28): Attn, Ship Code and Ship Via on the
   label. (FREIGHT / FUEL.LEVY lines at despatch need a price rule — Phase 2,
   with carrier booking.)
4. **Writers for fields nothing writes**: pinned comments, customer credit hold,
   ship-to editing on the customer screen.
5. **Admin settings that save but do nothing** (Status Workflow, Job Fields,
   Price Levels): wire them or remove them — never leave a control that lies.
6. **Safety**: escape database text in every PDF. (Requiring 2FA for admins is
   an owner decision: it locks out anyone not yet enrolled.)

### Phase 1 — the floor (fewer clicks, phone-ready)

1. **Strict workflow** like Jim2's: configurable statuses and allowed moves per
   role, a time allowance per status and a computed "due at this status";
   adds Booked/Confirmed, Picked and ProdExt *(decision: JIM9/JIM23)*.
2. **Production board**: work in progress by station (embroidery, print,
   subcontract), drag to hand off, replacing "Line 1 given to … for EMB"
   comments; usable on a tablet at the machine.
3. **Watchouts**: alerts on a customer, stock item or logo that pop up when it
   is added to a job ("ask if name badges are needed").
4. **Phone screens for picking, receiving and stocktake** with barcode/camera
   scanning.
5. **Copy / Move / Merge** of lines between jobs; Create Similar already exists.
6. **Returns and customer credit notes** against job lines, into RET, with
   inspection *(decision: S2-07)*.

### Phase 2 — stock and buying (the system does the routine)

1. **Reorder from sales velocity** (Jim2 Procurement): suggested POs per
   supplier from average daily sales, lead time and min/max.
2. **PO approval and supplier ETAs**; one receive path *(decision: D5)*.
3. **Indent size curve**: per-size quantities ordered, received, closed short
   *(decision: S2-20 / B2-08)*.
4. **Kits** (garment + transfers as one SKU) and kit stock.
5. **Client-held stock** ring-fenced for one customer *(decision: S2-11)*.
6. **OpenFreight / carrier booking** from the despatch screen, tracking back on
   the job, and FREIGHT / FUEL.LEVY lines priced from the booking *(decision:
   what the Jim2 bulk script does, F6; how freight is charged)*.

### Phase 3 — customers and scheduling

1. **CRM**: several contacts per account, an activity timeline (calls, emails,
   notes, tasks) on the customer and the job, follow-up reminders, leads and a
   quote pipeline with win/loss reasons.
2. **Customer groups tree** and a **default price level per customer**.
3. **Scheduler**: staff and machine calendar with tasks and appointments
   (Outlook/Google sync later).
4. **Email into jobs**: an order email becomes a job (AI drafts the lines), the
   thread stays on the job; reply from the job.
5. **Customer self-service**: order history, statements, re-order; then the
   uniform **allowance** programs *(decision: S2-10, S2-19 cost centres)*.

### Phase 4 — money and reporting (after the accounting decision)

1. **Credit control and collections**: auto-PAID *(decision: S2-08)*, COD and
   zero-limit rules *(S2-14)*, scheduled reminders and statement emails,
   online payment links.
2. **Either** bank reconciliation, bank feeds, ABA bulk payments, GST sessions
   and year end **or** a clean export/sync to Xero/MYOB *(decision: JIM10)*.
3. **Dashboards and report builder** for lists and reports (not only job
   documents), scheduled/emailed reports, budgets and cash flow.
4. **Perpetual inventory** so job margin meets the P&L *(decision: SIM-F37)*.

## Owner decisions made (2026-11-06)

- **Admin 2FA**: required for every admin, switched on once the owner's own
  account is enrolled.
- **Statuses (JIM9/JIM23)**: add all three — Booked and Confirmed as separate
  steps, Picked, and ProdExt (out at an external decorator).
- **Priority (JIM7)**: two fields — urgency (Low/Normal/High/Urgent) as today,
  plus Jim2's order category (Normal/Branch/Employee).
- **Returns (S2-07)**: only plain (undecorated, not personalised) goods return to
  stock, through a returns location and an inspection (restock or scrap);
  decorated or personalised goods are never restocked.

## Owner decisions still open, in the order the phases need them

| When | Decision |
| --- | --- |
| Now | Require 2FA for every admin (locks out anyone not enrolled yet) |
| Phase 1 | JIM9/JIM23 — the statuses (Booked vs Confirmed, Picked, what ProdExt means); JIM7 — Priority as urgency or Jim2's order category; S2-07 — returns rules |
| Phase 2 | D5 — retire the inline PO "Confirm Receipt"; S2-20 — size-curve indents; S2-11 — client-held stock; F6 — the OpenFreight bulk script; JIM22 — staff editing stock positions |
| Phase 3 | S2-10 — allowances; S2-19 — cost centres; S2-16 — logo set-up charged once |
| Phase 4 | JIM10 — who keeps the books; S2-02, S2-06, S2-08, S2-14 — money rules; SIM-F37 — perpetual inventory |

## Added from the owner's generic Jim2 workflow (2026-11-07)

A general description of Jim2's end-to-end flow (CRM → quote → order → PO →
receipt → job → schedule → despatch → invoice → receipts → banking → reports)
confirmed the phases above and added four items not yet in them:

- **Attachments on a job** — artwork files, proofs, a signed delivery note
  (Jim2 Documents tab). Phase 3, with email into jobs.
- **Labour time on a job** — embroidery and print time against the job, for
  job costing. Phase 3.
- **Sales by rep** and **slow-moving stock** reports. Phase 4.
- **Supplier payment runs** (pay many bills at once). Phase 4, with ABA files.

## Not planned

Payroll (Jim2 has none either), retail POS/EFTPOS, gift cards, hire stock,
manufacturing beyond kits, managed-print contracts, multi-company and
multi-currency revaluation — none appear in TIG's use of Jim2. Revisit if the
business changes.

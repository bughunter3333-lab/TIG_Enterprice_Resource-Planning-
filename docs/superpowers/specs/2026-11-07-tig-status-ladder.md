# TIG's status ladder (2026-11-07)

Roadmap Phase 1, item 1. The owner described how TIG moves a job in Jim2:

> The job stays in **Booked** while dropped in from NOP / the ordering portal.
> After the order is released, **Confirmed**. Then Pick/Pack, Desp/Ready,
> Picked, Inco/Pick — all changed by hand. After despatch the status is
> **FINISH (green)**, then **FINISH (red)**, then it is invoiced by hand.

Answers to the follow-up questions: *inco/pick* is an **incomplete pick** (part
picked, the rest waiting on stock); FINISH turns red when **a person marks it
ready** to invoice; **every** order starts at Booked, staff-keyed or portal; TIG
uses **In Progress, PROOF, PRINT and ProdExt** (out at an external decorator).

## The ladder

Stored values do not change where a status already exists: every job, report,
export and test that says `ORDER` keeps working. The screen shows TIG's names.

| Stored value | Shown as | Meaning | Reserves stock |
| --- | --- | --- | --- |
| `QUOTE` | Quote | Priced, not ordered | no |
| `New` | **Booked** | Taken (portal or staff), waiting to be released | no |
| `ORDER` | **Confirmed** | Released: credit checked, stock reserved | yes |
| `In Progress` | In Progress | Worked on in-house | yes |
| `PROOF` | PROOF | Waiting for the customer's logo approval | yes |
| `Picked` *(new)* | Picked | Pulled from the shelves | yes |
| `Inco/Pick` *(new)* | Inco/Pick | Part picked, the rest waiting on stock | yes |
| `PRINT` | PRINT | Decorated in-house | yes |
| `ProdExt` *(new)* | ProdExt | Out at an external decorator | yes |
| `Pick/Pack` | Pick/Pack | Packing | yes |
| `Desp/Ready` | Desp/Ready | Packed, waiting for the carrier | yes |
| `FINISH` | FINISH (green) | Despatched | yes |
| `Ready` *(new)* | Ready to invoice (red) | Checked by a person, ready to invoice | yes |
| `INVOICE` | Invoiced | Invoiced (the next invoice number) | depleted |
| `PAID` | Paid | Paid | depleted |

Rules kept: anyone may skip forward or go back one step (an admin further);
only staff and above touch an invoiced status; the proof gate applies from
`PRINT` on, so `ProdExt` (after PRINT) never sends a logo out unapproved, while
`Picked` and `Inco/Pick` (before PRINT) may happen during proofing. Despatch is
offered from Pick/Pack on, and `Ready` is despatchable like FINISH (a further
consignment).

**Booked first**: a new job is made at `New` (Booked) unless it is a quote;
releasing it is the move to `ORDER` (Confirmed), where the credit check runs
and stock is reserved — the existing gate, unchanged. This is the new-job
form's default; the API still takes a job straight to ORDER (import, Create
Similar, scripts), through the same gate.

## As built (2026-11-07)

- Server: `VALID_STATUSES`, `PRODUCTION_LADDER`, `_BACK_A_STEP` in
  `app/routers/jobs.py`; `COMMITTED_STATUSES` and `FINISHED_STATUSES`
  (FINISH, Ready) in `app/core/reservations.py`, read by every "finished,
  awaiting invoice" count (ai, analytics, reports). Back a step: ORDER to
  Booked or Quote; Picked to PROOF, In Progress or ORDER; Inco/Pick to Picked;
  PRINT to Inco/Pick, Picked, PROOF or In Progress; ProdExt to PRINT,
  Inco/Pick or Picked; Pick/Pack to ProdExt or PRINT; Ready to FINISH. A
  quote may also be Booked. Despatch-and-invoice works from Ready as from
  FINISH. Jim2 import: Booked → New, Confirmed → ORDER, Ready → Ready,
  Picked, Inco/Pick, ProdExt as themselves.
- Screen: `frontend/src/modules/jobs/jobStatuses.js` holds the ladder, the
  names (`statusLabel`: Booked, Confirmed, Ready to invoice, …) and
  `FINISHED_STATUSES`; every status chip is `StatusBadge` (four hand-coloured
  copies in the monolith and Scheduling were replaced). The record page's
  road shows Inco/Pick and ProdExt only for a job standing on one; its next
  step from Picked is Print for a decorated job and Pick/Pack otherwise,
  from FINISH "Mark ready to invoice", from Ready "Invoice job".
- The pick panel's "Mark Complete" sent a fully picked job to FINISH — gone,
  with no despatch (F30). It now offers "Mark picked" (every line picked) or
  "Mark Inco/Pick" (some picked), only while the job is before PRINT.
- Colours: Inco/Pick and ProdExt take PROOF's amber (someone outside holds the
  job: the supplier, the decorator); Picked takes production blue.
- `jobs.order_category` (migration `f8a9b0c1d2e3`), Normal/Branch/Employee,
  any other value refused (422); on the job form beside Priority, carried by
  Create Similar. The Jim2 import reads Jim2's Priority as the category when
  it is Normal, Branch or Employee; any other value stays the urgency.

Review (three independent lenses, 2026-11-07) and what changed from it:

- Going to ProdExt is proof-checked from anywhere, PRINT and Pick/Pack
  included: a logo whose artwork changed at PRINT (`PATCH /logos/{id}` resets
  its proof) or a logo line added after printing went out unapproved.
- Back a step widened for staff: Pick/Pack back to Picked or Inco/Pick (the
  way an undecorated job came, or a short found while packing); Inco/Pick
  back as far as Picked reaches (the pick panel marks it straight from before
  Picked).
- The pick panel counts a line with stock on back-order as part picked, as
  the server does (`_fully_picked`); its rule is `pickMoveFor` in
  `frontend/src/modules/jobs/jobPicking.js`.
- The record page reads a garment line given a decoration type (EMB, DTF…)
  as decorated; its road starts at Booked for every non-quote job, and draws
  a side step in its main step's place (Inco/Pick where Picked is, ProdExt
  where PRINT is), so the ring never stands behind a step drawn as done.
- TIG's names reach every place a job status is written: the Jobs filter,
  chip and status bands, the Job List results, the customer's jobs and
  statement, comment chips, the Reports pie, Analytics, the email picker,
  the sales register, the unprint dialog and the stock tabs.

## Priority and order category (JIM7)

Owner decision 2026-11-06: two fields. `priority` keeps urgency
(Low/Normal/High/Urgent); a new `jobs.order_category` holds Jim2's order
category (Normal/Branch/Employee), default Normal. One migration.

## Colours — approved by the owner 2026-11-07

TIG reads FINISH green when despatched and red when ready to invoice; Jim2
shows invoiced jobs black. Today FINISH is teal and INVOICE/PAID green, so
green FINISH would read the same as invoiced. Proposal: FINISH green, Ready
red, INVOICE/PAID dark slate (Jim2's black), the new production statuses in the
production / waiting colours of their neighbours. Built only after a yes.

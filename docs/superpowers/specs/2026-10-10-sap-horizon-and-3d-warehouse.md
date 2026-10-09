# SAP Horizon theme and the 3D warehouse — decisions

**Date:** 2026-10-10 · **Status:** built (theme and warehouse); shell and page layouts next

## Direction

The owner set the reference: SAP S/4HANA. *"We do not need any backdated looking ERP."*
The design language is SAP Fiori, Horizon theme. The business domain model stays;
screens, navigation and look follow Fiori. No SAP logos or marks are used.

Research behind it (Fiori/Business Central, enterprise design systems, Linear/Stripe,
plus audits of the jobs, stock/purchasing, customers and dashboard screens) agreed
on: a home page per role whose numbers open exactly what they count; list report
and object page layouts; actions in one bar with one primary; status by label and
shape, colour for meaning; keyboard-operable grids; no dead buttons.

## Theme

- Every colour in `frontend/src/ui/palette.js` is taken from SAP's open-source theme
  package `@sap-theming/theming-base-content` (Apache-2.0 — its REUSE file covers
  every file, the fonts included), `content/Base/baseLib/sap_horizon/css_variables.css`.
  The SAP variable is named beside each value so a later Horizon release can be
  followed by diffing that file.
- Type is SAP 72 and 72 Mono, self-hosted from the same package (`src/ui/fonts.css`).
  Font names that start with a digit must be quoted in CSS, or the declaration is void.
- The shell is white with dark text (Horizon), not dark chrome.
- Status colours (`STATUS_COLORS`) come from Fiori's indication palette and group by
  phase: QUOTE violet; production blue; PROOF orange (the customer is holding it up);
  Pick/Pack and FINISH teal; INVOICE and PAID green; CANCEL grey. "In Progress" no
  longer uses the warning colour.
- Focus ring is `sapContent_FocusColor` (#0032a5); the old cyan ring was 1.8:1.

## One definition per job count

`frontend/src/modules/jobs/jobMetrics.js` defines overdue, due today, due this week,
in production, pick/pack, to invoice and "mine" once, on the server's lifecycle.
The status strip, nav tree, quick filters and bell all read it, so a count is
always the length of the list it opens. Dates compare as local calendar days
(`frontend/src/lib/dates.js`): `toISOString()` is the UTC day, which in Sydney is
yesterday until 10–11am.

- Overdue / due today count committed work not yet delivered: ORDER to Pick/Pack.
  Quotes have a validity date instead; from FINISH the goods have gone.
- To invoice is FINISH. In production is ORDER to PRINT.

## Money fields the server owns

Paid / invoiced status, deposit and balance owing change only by recording a
payment or by invoicing. Create and update ignore them (`_SERVER_OWNED_MONEY` in
`backend/app/routers/jobs.py`); `balance_due == total_inc - deposit` on every
write. The job form shows them read-only.

Customer outstanding, revenue, aging and the statement tab count invoiced jobs
(INVOICE, PAID) only — the ledger's basis — and revenue is ex GST.

## The 3D warehouse

Built from the owner's sketches and a photo of aisle B (2026-10-10):

- Aisles E D C B A, left to right standing at receiving; packing/despatch bench
  between the racks and receiving.
- Bays 1–10 per aisle. Odd bays on the right walking up the aisle from receiving,
  even bays facing them on the left; bays 1 and 2 at the receiving end. Position 1
  is at the receiving end of a bay.
- Levels A–L on four orange beams of three rows (A–C, D–F, G–I, J–L), an orange
  beam closing the top, and an open shelf above it for excess boxes (not mapped
  by bin; drawn empty because its contents are not recorded).
- Six boxes per level. Blue uprights, orange beams, open-front kraft boxes with a
  white location label on the front lip.

The layout is an admin setting per branch (`warehouse_layout:<branch>`), validated
by `modules/warehouse/layout.js`; an invalid one falls back to the default and says
so. Occupancy comes from `GET /inventory/bin-map?branch=` — one row per bin and SKU.
Stock is counted per SKU per branch, not per box, so the figures shown are branch
totals and say so.

A box's **label colour** is its state: blue stock on hand, orange slotted with none
on hand, red more on hand than the SKU's bins hold (judged only when every bin it
uses has a capacity), white nothing slotted. The selected box is hi-vis yellow
with a focus-blue outline. Codes are printed on the labels of the aisle the camera
stands in, nearest first — printing all 3,600 would cost the frame rate.

Bins whose codes do not fit the layout (e.g. legacy `A-01-04`) are listed under
"Not on the map" with the reason, never dropped.

The scene is lazy-loaded (three.js, React Three Fiber 8, Drei 9 — pinned for
React 18) and renders on demand. Headless SwiftShader does not draw troika text;
check labels on a real GPU (`--use-angle=d3d11`).

## Next

The S/4HANA shell (shell bar with search, notifications and profile; Jim2 ribbons
removed), a role-based home, a sign-in page in the same world, then list report and
object page layouts for jobs, stock, purchasing and customers.

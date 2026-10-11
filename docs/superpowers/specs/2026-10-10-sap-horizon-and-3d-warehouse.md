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

### Moving around (2026-10-11)

Clicking a box — in the scene or in the search results — takes the camera to a
**front view** of it: standing in the box's own aisle, square to its face, level
with it (`layout.js` `frontView`). Picking the same box again faces it again.

The move is eased only where a person could travel it: in a straight line that
stays out of the racking (`clearPath`) and does not have to turn right round.
Anything else — another aisle, the facing rack — is a cut. Eased, those moves flew
through cartons and over the top of the rack.

After that the view belongs to the person, as on a map: **drag moves**, right-drag
(or Ctrl/Shift-drag) turns, scroll zooms toward the cursor; one finger moves and
two fingers zoom and turn on touch. A drag slides over the rack face when the
camera is looking across at it and over the floor when it is looking down. A hint
on the canvas names the gestures, in touch words on a touch screen.

**Racking, to the camera.** A turn or a drag cannot carry the eye off the walkway
it is standing on (`heldToWalkway`: held to *that* walkway, not the nearest one to
where a quick move landed, and only the eye — the pivot stays). A zoom is let
through: an aisle is too narrow to back away from a rack and see more of it, so
scrolling out backs the eye through the racking behind, and everything between it
and the open space in front of what it is looking at is cut away (`sightStart`
sets the camera's near plane), as in a section drawing. Boxes that are cut away do
not answer the pointer. The two kinds of move are told apart by distance: a turn or
a drag leaves the eye exactly as far from its pivot as the last change did.

An earlier version stepped the camera back down the aisle when a zoom-out was
blocked. It guessed which gesture had been blocked and guessed wrong (a blocked
turn stepped back; further out than the step, it pulled the view in), so it is
gone: nothing here moves the camera except the hand, a pick, and Reset view.

The hover label is dropped whenever the view moves, because the box under the
pointer is no longer the one it named.

Three things used to pull the view back and must stay fixed:

- `focus` is memoised. A new object on every render re-ran the fly-to whenever the
  screen re-rendered (a data refresh, a keystroke).
- A drag that ends over a box is not a click (`e.delta` in `Bins3D`).
- Any drag or scroll cancels the easing; deselecting a box does not fly home. Only
  first load, "Reset view" and a new layout go to the overview.

The selected box keeps its size: scaled up, its body covered its own opening and
label, and from the front it was a blank yellow block.

### Adding stock to a box (2026-10-11)

The bin panel has **Add stock** for admins and managers (the same gate as the
Locations tab): choose the product, whether the box becomes its primary or overflow
bin, and what is going in. `POST /inventory/bin-map/put-away` does it in one
transaction, through the shared ledger paths.

- A product's existing bin is never replaced silently: the server answers 409 naming
  it unless `replace` is set, and the form then offers the choice.
- A box is one box however its code was typed. `E.02.H.04` on file is the box the
  map draws as E.2.H.4; both sides compare the parsed code, and new codes are stored
  plain.
- Stock is counted per branch, not per box, so the form asks what is going in
  instead of guessing from a quantity. **Already on hand** is the default: nothing
  is added, and the only thing recorded is units that had no location at all being
  placed at this branch (a "Put Away" movement that leaves the item total alone, as
  a stocktake and a transfer treat them). **New stock** has to be chosen, and its
  quantity is an "Adjustment" that raises the total (`new_stock` on the request).
  Inferring "new" from a typed quantity counted received stock twice. The form says
  what the total will do before saving, and the confirmation reports what the
  server did.
- The item's pick location (`InventoryItem.location`, which picking slips and the
  job pick list print) follows its primary bin at HQ, under the plain code, so a
  re-slotted product sends the picker to the box the map shows. Editing bins on the
  Locations tab does not do this yet.
- A slot given a different box starts with that box's capacity or none; it does not
  inherit the previous box's.
- The quantity is on the stock audit trail with the user's name (movement rows carry
  no user), and so is a changed pick location, with what it was before.
- Agreeing to replace a bin is agreeing to replace *that* bin: the tick does not
  carry over to another slot or to a box that has since changed, and the request
  names the bin (`replace_bin`) so the server refuses if the slot holds a different
  one by then. Saving bins on the Locations tab refreshes the map.
- Once a save is on its way it cannot be called off, and it is never queued for
  later while offline. A save that fails after the form has gone is reported as a
  toast, as a success would be.

## Next

Done since this was written: the S/4HANA shell bar with page headers (Jim2 ribbons
removed) and the sign-in page.

Still to do: a role-based home, then list report and object page layouts for jobs,
stock, purchasing and customers. In the warehouse: the 86 legacy bin codes need
re-slotting to aisle.bay.level.box before they appear on the map.

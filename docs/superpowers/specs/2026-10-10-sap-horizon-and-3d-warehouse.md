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
stands in, nearest first — printing all 3,600 would cost the frame rate. Walking an
aisle prints them for what is in reach as it goes (below).

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

**Racking is solid to the camera.** Whatever the gesture, the eye never enters
racking (`heldToWalkway`). From an aisle it stays on that aisle's walkway — that
one, not the nearest to where a quick move landed. Coming in from above or outside,
it lands on the nearest walkway. Above the racks and outside the building it is
free. Only the eye is held, never the pivot; if that leaves the pivot nearer than
the controls allow, the pivot is moved on, or the two keep correcting each other.

An aisle is too narrow to back away from a rack and see more of it. A scroll-out
that the rack behind stops lifts the camera up out of the aisle instead
(`liftOut`), still looking at the same spot, and from there the view is free. That
it was a scroll-out is known from the wheel event itself.

Three earlier versions did more and were wrong: one stepped back down the aisle
whenever a zoom-out seemed blocked, guessing the gesture from how the camera had
moved (a blocked turn stepped back too); one told a zoom from a turn by distance,
and mistook the controls' own limits for a zoom; one cut the racking away with the
near plane so the eye could back through it, which also cut the front off the
overview. Nothing here infers a gesture or changes what is drawn.

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

### Walking an aisle (2026-10-12)

A blue line runs down the middle of every walkway, from a disc in front of the
racking to just past the last bay. Clicking it — anywhere on that aisle's floor —
stands the camera on the line at that spot, and from there it is Street View:

- **drag** looks round, all the way round and up and down (the scene follows the
  hand, and it is not eased);
- **scroll**, a click further along the line, or Forward / Back walks along it —
  forward is the way the eye is looking, and side-on to a rack it means up the
  aisle, so a rack can be read while walking past it;
- **Turn left / Turn right** are quarter turns that land square (along the aisle or
  flat on to a rack) and level, whatever the view had been dragged to;
- **Higher / Lower** move a beam's worth of rows at a time, between the bottom row
  and the top one;
- a **box clicked** on the way is faced from exactly the map's front-view spot,
  and the walk goes on from there at that height.

Every one of those is a button over the view (`WalkControls`) and a key (arrows,
Page Up / Down, Esc to leave) once a click has put the keyboard in the view, and
the aisle buttons start a walk without the mouse. The controls say where the walk
has got to in the racking's own words — "Aisle B · bay 3 on the right, bay 4 on the
left" — and whose section each bay is in.

**Box codes are printed as the walk moves**: for the boxes in reach of the eye, on
both racks, refreshed each time it has gone a box along or a row up.

How it is built, and why:

- `walk.js` is the maths: a pose is `{ aisleIndex, z, height, yaw, pitch }` and
  every move returns a new one. `Walk3D.jsx` eases the camera to it (`WalkRig`) and
  draws the lines (`WalkLines`).
- **The map's orbit controls are switched off while a walk drives the camera**
  (`enabled={!walk}`), and `CameraRig` does nothing until they are back on. Two
  things steering one camera is what went wrong with it three times.
- **The eye cannot be in racking, by construction.** It rides the centre of the
  walkway and leans off it by at most 0.7 m, inside a free half-width of 0.75 m.
  Nothing has to be corrected afterwards, so none of the map's rack rules apply.
- The lean is deliberate: facing a rack, the eye backs against the one behind, as a
  person does to read a label. On the centre line a face is 0.9 m off and shows two
  levels.
- The eye rides **level with a row of boxes**, not at a fixed height. At exactly
  eye height it looked straight through the gap under a beam: a white band across
  the racks, and a click that hit nothing.
- The lens is wider while walking (60° against the map's 42°), set when the walk
  starts and put back when it ends.
- Stepping on to a line, changing aisle and leaving are **cuts**: the straight way
  is through racking. Leaving lifts the camera out above the aisle, looking down at
  where it stood (`liftOut`) — "Reset view" ends a walk and goes to the overview in
  one go.
- A walk does not outlive the layout it started in, or a change of branch.
- A drag that ends on the line is not a click on it (`e.delta`, as for boxes), and
  a box in front of the line takes the click.

The hand-over between the walk and the map is where an independent review found
faults that no test of either half shows, and each is now held by a probe:

- **The hand-over happens in the commit that ends the walk** (layout effects in
  `CameraRig` and `WalkRig`). As passive effects, a frame could be drawn in between
  with the controls back on, the walking lens still in, and the controls' aim from
  before the walk — the camera could come out above the wrong aisle.
- **The walk keeps the map's note of where the eye is** (`lastEye`). The map judges
  a move by where the eye was; left stale, "Reset view" after a walk began its
  flight from the aisle the map had last been in, through the racks.
- **The controls' own events are ignored while they are off.** They still report a
  pointer released or cancelled; acting on it reprinted the codes round the map's
  old aim.
- **Control presses are a list** (`nudges`, each with an id), not "the last one".
  The scene renders on its own; two presses before its next render reached it as
  one.
- **The scene says which aisle the eye is in** (`onWalkAt`), not only the bays. A
  box picked in another aisle takes the walk there, and the words, the pressed
  aisle and the lit line go with it.
- An overview asked for during a walk is planned when the walk ends, from where the
  eye is then.

**Scene probes** (`frontend/scene-probes/`, `npm run test:scene`): the real
`Warehouse3D` and `WarehouseModule` in jsdom with only the GL renderer faked, sent
real pointer, wheel, click and key events, with every frame's eye position logged.
39 probes cover the map's rules and the walk. They take a few minutes, so they are
not part of `npm test` — run them after touching the camera, the walk or their
hand-over. They used to live outside the repo and were lost once.

### Company sections (2026-10-12)

A run of racking can be marked as holding one company's stock: "aisle B, bays 3, 5
and 7 are Zone Bowling's". (Called a *rack section* throughout — `zones.js` is an
older static table the dashboard reads.)

- A section is a **rectangle on one rack face**: from one box along to another, and
  from one level up to another. Along a face the boxes run bay by bay, so "along"
  is the pair (bay, box); odd bays face even bays across the walkway, so a section
  is all odd or all even. Both sides of an aisle are two sections.
- **Marking** (admins and managers, the gate for editing stock positions): choose
  the customer, then click two boxes at opposite corners — or type their codes; the
  form is the control, the view is the picture. One box is already a section. Whole
  bays and all levels are ticked to start with, because that is the usual case;
  unticked, the section is exactly between the two boxes. The section being marked
  is drawn in the selection yellow as it is entered. While marking, a click on a box
  is a corner: it does not open the box or move the camera.
- Sections **cannot overlap** — a box is one company's. The form says whose the
  boxes already are before saving; the server (`POST /rack-sections`) refuses with
  409 naming the company if someone else got there first, and the list is fetched
  again. The overlap rule is the application's; the database holds the
  part it can (no two sections start at the same box), so a save sent twice is
  stored once. Two different overlapping sections saved in the same instant by two
  people could still both be stored — either can be removed.
- **Where it shows:** a wash of the company's colour over its boxes with a frame
  round them; the name on a sign on every beam that carries them (on the steel, so
  it covers no box, and there is one at eye level); a bar along the top of the rack
  with the name above it, which is what shows from the overview; the box's panel
  and hover label; and the walk's "where am I" line. None of it takes a click.
- Each company has one colour (`SECTION_COLORS`: Horizon accents that mean nothing
  else on the map), given in the order companies were first marked, so a company
  keeps its colour as others are added.
- Choosing a section in the list **walks to it**, facing its rack: an aisle is too
  narrow to see a rack face from anywhere else.
- A section that no longer fits the racking (the layout was edited) is listed as
  that, not drawn and not dropped. Removing a section asks first and says the stock
  is not touched. Deleting a customer removes its sections.
- Sections are an overlay: if they cannot be loaded the racking is still shown and
  the list says so.

API (`backend/app/routers/rack_sections.py`, table `rack_sections`):
`GET /rack-sections?branch=` (anyone signed in), `POST /rack-sections`
`{ branch, customer_id, from_bin, to_bin }` and `DELETE /rack-sections/{id}` (admin
or manager). The two bins are corners in either order; the server stores them
normalised and knows nothing of the layout — whether a section fits the racking is
the map's business, as it is for bins.

### A bin is a real box (2026-10-12)

Any text used to be accepted as a bin, on purpose ("a receiving bay is a real place
with no aisle"). The owner asked for the opposite after `dasdas` was saved as a bin
at 3PLP: attributes are to be precise. So a bin being set must be an
aisle.bay.level.box code **that exists in the branch's racking layout**.

- The server holds the rule (`backend/app/core/racking.py`): it reads the same
  `warehouse_layout:<branch>` setting the map draws from, by the same checks, and
  falls back to the default racking exactly when the map does. A test pins the
  default against `layout.js`. The refusal names the part that is wrong and what
  there is: "Primary bin 1 'B.44.A.1' is not in the racking at HQ: there is no bay
  44 (bays 1 to 10)".
- It applies to the Locations tab's add and update and to put-away from the map.
  Codes are stored under their plain spelling.
- **Codes on file from before the check are left alone** until they are re-slotted:
  a bin sent back exactly as it stands is not judged, so the rest of its row can be
  saved. The Locations tab points them out, in both modes ("One bin on file is not a
  box in the racking: 3PLP dasdas").
- The tab applies the same rule as it is typed (`modules/stock/locationRules.js`),
  against each branch's own layout: the field is marked, the problems are listed by
  branch, and nothing is saved while any changed row has one.
- **The field offers the locations that exist** (`warehouse/BinField.jsx`,
  `binSuggest.js`): every box is known from the layout, so as a code is typed the
  field lists the real boxes it could become, one for each way the part being typed
  can go on — `B` offers B.1.A.1; `B.` one per bay; `B.2.` one per level, B.2.A.1
  first. Arrows and Enter, or a click, take one. The same field is used for the two
  corners when marking a section.
- **Capitals mean the system knows the location.** What is typed is shown in
  capitals for as long as it leads to a real box, and in small letters when it does
  not (even if typed in capitals). A real location half typed is said to be
  unfinished, not wrong; it still cannot be saved.
- The screen and the server are held together by one list of stored layouts and how
  each is read (`warehouse/__tests__/layoutCases.json`), run by both test suites,
  and the server tidies a code with exactly what JavaScript's `trim()` removes. A
  layout or a code one side accepted and the other did not would be a bin the
  screen calls real and the save refuses.
- Two bins being two boxes is judged when a bin is changed: a row whose bins were
  already one box can still have its other fields saved.
- The other attributes of a position are bounded as well: a position is only opened
  at a real branch; a position's two bins are two different boxes; a capacity is a
  whole number from 0 to 100,000; a zone is at most 20 characters.
- A **zone** is still free text. What a valid zone is has not been decided.

## Next

Done since this was written: the S/4HANA shell bar with page headers (Jim2 ribbons
removed) and the sign-in page.

Still to do: a role-based home, then list report and object page layouts for jobs,
stock, purchasing and customers. In the warehouse: the 86 legacy bin codes need
re-slotting to aisle.bay.level.box before they appear on the map; and a company's
section is only a marking so far — nothing checks that the stock put into it is
that company's.

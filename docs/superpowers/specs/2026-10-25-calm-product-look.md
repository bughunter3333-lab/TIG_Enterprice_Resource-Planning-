# The calm product look (2026-10-25)

The owner asked for a real step up in UI/UX and sent references: the **Humaplus**
HR dashboard, the **FlowAI** SaaS product, the **spline.one** design system, a
**UX-laws** series and two resource lists (21st.dev and friends). Decisions
taken with the owner:

- **The references' look replaces SAP Horizon's visuals; Fiori's page patterns
  stay** — role Home, list report, record (object) page with a header, sections
  and actions.
- **Overview screens breathe; work grids stay dense**, with a per-person
  Compact / Comfortable switch.
- **First pass:** the design system, the shell, Home, the Jobs list and the job
  record, and Dispatch. Reviewed before it rolls out to every module.
- **Type:** Geist and Geist Mono (`@fontsource-variable/geist`, `-mono`).

It supersedes the visuals of `2026-10-10-sap-horizon-and-3d-warehouse.md`; the
3D warehouse is unchanged.

## What we took from each reference

| Reference | Taken | Left |
| --- | --- | --- |
| Humaplus | The figure card: label + info → large tabular number + a tinted change chip → a quiet inset footer ("from last month · See detail →"). Segmented controls. A stacked distribution bar. Sidebar group labels and count badges. | Avatars and illustration. |
| FlowAI | Restraint: near-monochrome chrome, 13px type, hairline borders, search and an assistant in the top bar, a dense but calm table. | — |
| spline.one | Status chips that do not rely on colour alone. A pill toolbar over a table. Light and dark built from one set of tokens. | The black primary button: fashion, not an ERP. |
| UX laws | **Hick** — fewer, ranked actions per screen. **Miller** — a record in sections, not one wall. **Fitts** — the next action large and near. **Similarity** — one blue means "do". **Peak-end** — a dispatch ends on a clear "Dispatched" moment. | — |

## The system

All values live in `frontend/src/ui/palette.js`; `tokens.js` (`T`) and
`tailwind.config.js` read it; `index.css` mirrors the few CSS needs, and
`ui/__tests__/paletteMirror.test.js` fails on drift.

**Colour.** A near-neutral ground (`paper` #f5f5f6), white surfaces (`panel`)
drawn with hairlines (#e4e4e7), a second neutral for the sidebar (`rail`
#fafafa). One blue (`accent` #0b63f6, 5.1:1) for the primary action, links,
selection and focus — nothing decorative. The traffic light (`ok`, `warn`,
`danger`) and the job's phase are the only other hues. Text #111114 / muted
#55575f / faint #6e7079 (4.9:1, the floor for small words).

**Status by phase** (`STATUS_COLORS`, `statusTint` in `tokens.js`): intake
(QUOTE, New) violet · production (ORDER, In Progress, PRINT) blue · PROOF amber,
the one production state waiting on someone outside · fulfil (Pick/Pack,
Desp/Ready, FINISH) teal · billing (INVOICE, PAID) green · CANCEL grey. **New
moved from production to intake**: since F11 a New portal order reserves
nothing until it is confirmed, so it belongs with the quote. Every chip's word
passes 4.5:1 on its own tint (blue and green are the closest, 4.6).

**Type.** Geist for every word, Geist Mono for codes and IDs (job numbers,
SKUs, ship codes) — data, never decoration. Tabular figures app-wide. A tight
scale: 12 small/labels · 13 grid · 14 body · 15 card titles · 20 page titles ·
28 figures. New work uses weights 400 / 500 / 600; older screens still carry
700, which Geist renders, until each is redrawn.

**Shape and depth.** 8px corners on controls and fields, 12px on cards, 6px on
chips. Cards rest on a 1px hairline with the faintest lift; menus, toasts and
dialogs take the one deep shadow. Cards never nest.

**Density.** 32px fields (big enough to hit without aiming). Grid rows 32px
compact (default) or 40px comfortable — `lib/useDensity.js`, the switch is
`ui/DensityToggle.jsx`, remembered per person in the browser.

**States.** Every control has hover, focus (a white gap then a 2px blue ring,
visible on any fill), pressed (an inset, never a lift), disabled (its own
palette, not opacity). Grids load as skeleton rows (a hidden "Loading…" for
screen readers) and say what to do when empty (`emptyHint`).

**Motion.** 150ms for state, 240ms for a panel; nothing decorative, nothing on
page load.

**Browser surfaces.** Text selection, the caret, scrollbars and the focus ring
are themed from the palette.

## Components (`frontend/src/ui/`)

`Button` (primary / secondary / ghost / danger; sm 28 · md 32 · lg 36; `tile`)
· `IconButton` (square, labelled) · `Card` (title, info, actions, footer) ·
`StatusBadge` (phase chip with a dot) · `SegmentedControl` (radiogroup) ·
`DensityToggle` · `Tabs` (underline, optional count) · `Field` / `Select`
(`fieldStyle.js`) · `FilterBar` (pills + a dashed "Filter") · `DataGrid` ·
`KpiTile` (a figure in a strip) · `Modal` · `Toast` (and `lib/NotificationProvider`,
now the same look).

## Screens in the first pass

**Shell.** A left sidebar (`rail`): the brand, the modules in groups — Work
(Home, Jobs, Quotes), Operations (Purchases, Stock), Relationships (Customers,
Card Files), Finance (Accounts, Reports) — each with an icon and its count; then
the open jobs and saved lists (the old nav tree); the person at the foot. It
collapses to an icon rail. A slim white top bar: where you are, search (Ctrl+K),
**Ask** (opens the assistant — the floating bubble is gone), notifications, New
job, admin. Same access rules as before: a module shows only when the role can
read in its area (`lib/access.js`). Choosing a space from the sidebar opens it
at its list, also from a job's record. The shell's `<main>` is the one landmark
and the one page padding; the monolith no longer adds a second.

As built: `ui/shell/Sidebar.jsx`, `TopBar.jsx`, `shellModules.js` (the groups,
`shownGroups`), `AppShell.jsx`. `ModuleBar` is gone.

**Home.** Figure cards in the Humaplus anatomy, each one a button that opens
what it counts. Above them, for anyone who reads jobs, **work in hand**: one dark
band (the Axio reference) with the count between quote and payment, a stacked
bar by stage and links to the stages that are not already a tile
(`modules/home/workInHand.js`). The page breathes; it is the overview.

**Jobs list.** A pill toolbar (filters, group, List / Board, density), phase
chips, a dense grid. Above it the job counts are quiet pills — the number first,
coloured only when it needs someone — each opening the list it counts. The board
is trays, one per status (New included): the phase colour is one dot by the
column title, cards carry no stripe, and a card's overdue reading is the
record's own (`dueOf`), so the two never disagree.

**Job record.** One header: job, customer, status, the money that matters (total,
paid, balance) and the single next action for the status. Sections below
(details, lines, comments, documents) instead of every panel at once; money
shown once, not three times. As built: `modules/jobs/record/` (`lifecycle.js`
decides the next step; `JobRecordHeader`, `JobStepper`, the cards).

**Dispatch.** The ready list, packed: the columns you type into keep a tint down
the whole table, header included. It ends on **Dispatched** — the session the
server recorded (number, jobs, cartons, the time it stamped, each line), with the
manifest and CSV one click away. Every figure on it comes from the server's
reply, never from the batch as sent; a refused batch stays on the list with the
selection kept, and the error says why.

## Not in this pass

Every other module keeps its layout and picks up the new tokens, type and
primitives automatically. Dark mode: the tokens make it possible; it is not
built. Field borders are 1.5:1 against white (they were 1.4:1); each field is
identified by its label, but a stronger edge is an open question.

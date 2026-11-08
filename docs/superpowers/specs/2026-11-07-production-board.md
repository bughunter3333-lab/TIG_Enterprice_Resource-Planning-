# Production board (2026-11-07)

Roadmap Phase 1, item 2. Who has which work on the floor, by lane — replacing
Jim2's free-text hand-off comment ("Line 1 given to Lina for EMB", JIM17/JIM20,
`docs/backlog.md`). Jobs module only.

## Owner decisions (2026-11-07)

- **A card is a job at a lane.** One card per job per lane, listing that job's
  lines there. A job with in-house embroidery and outside printing shows a card
  in each lane.
- **Lanes:** Picking · Embroidery (in-house) · Print (in-house) · one lane per
  outside decorator · Packing.
- **A hand-off records who has the work; it never changes the job's status.**
  Status is still moved by hand (Jim2's hand-off comment carried no status).
- **Handed to a lane, plus an optional person** (free text, e.g. Lina). Every
  hand-off also writes a printed (Inc) comment on the job, Jim2-style.

## What is on the board

Jobs in work: `ORDER` (Confirmed) through `Desp/Ready` — reserved, not yet gone.
A job leaves the board when it is despatched (FINISH), cancelled, or sent back
to Booked or Quote.

The unit that moves is a **garment** — a goods line (`display_type` product,
not a decoration, alteration or charge). It is what physically goes from the
shelf to a machine to the packing bench. Its decoration — the logo lines that
apply to it, or its own decoration type — is shown on it, not as cards of its
own.

## Where a garment is

Handed off: the lane it was handed to (`job_items.station`), with the person
(`station_holder`) and when (`station_at`).

Not handed off yet, the board places it where its work is — so the board is
right from the first order, and moves on by itself as picking is recorded:

1. Not picked in full (the pick rule, `_fully_picked`: all of it picked and
   nothing on back-order) → **Picking**.
2. Picked, and decorated → its decoration's lane:
   - a logo made by a decorator (`Logo.made_by = subcontract`) → **that
     decorator's lane** (`Logo.supplier_id`);
   - else embroidery (`EMB`) → **Embroidery**; any other decoration type →
     **Print**.
   A garment with more than one decoration goes to the first one's lane;
   handing it on moves it to the next.
3. Picked, nothing to decorate → **Packing**.

A garment's own decoration type with no logo record has no decorator, so it is
taken as in-house.

## Lanes

`picking`, `embroidery`, `print`, `packing`, and `decorator:<supplier id>` for
each supplier named as the decorator of a logo, or holding work now. Shown in
that order (decorators by name between Print and Packing). A decorator lane is
labelled with the supplier's name.

## Hand-off

`POST /production-board/hand-off` — `{job_id, from_lane, to_lane, holder?}`:
every garment of the job now in `from_lane` goes to `to_lane`, to `holder` if
given (trimmed, at most 50 characters; blank is none). Refused:

- a job not in work (409);
- `from_lane` with none of the job's garments in it — the card already moved,
  on another tablet (409, so a stale drag never moves the wrong thing);
- an unknown lane, or a decorator that is no supplier (422).

Handing to the lane a card is already in, with a new person, is how work
changes hands at one machine. Writes `station`, `station_holder`,
`station_at` on each line, moves the job's version (`updated_at`, as a pick
does), and adds the trail comment, `inc` so it prints on the job sheet:

> Lines 1, 3 given to Lina for Embroidery

(no "to <person>" when none is given). It does not touch status, stock,
reservations or money; a locked job's work still changes hands (the lock is
on what was sold, not on the floor).

Who: `require_any` — the roles that move work through production, overseas
staff included (`docs/superpowers/specs/2026-10-12-users-and-roles.md`).
`GET /production-board` is `require_any` too and carries no money.

## Screen

`frontend/src/modules/production/` (`ProductionModule`, `ProductionLane`,
`HandOffSheet`, pure `productionBoard.js`; server logic in
`backend/app/core/production_board.py`, the pick rule shared through
`app/core/picking.py`; migration `a9b0c1d2e3f4`): a lane per
column, a card per job — job number, customer, due (overdue in red), urgency
when High or Urgent, its garments with quantity and decoration, the person
holding it and since when. Ordered by due date, then urgency.

- **Tap a card** → a hand-off sheet: the lanes as large buttons and a person
  field (with the names used before). Works on a tablet at the machine.
- **Drag a card** to another lane (mouse) → the same hand-off, to the lane
  alone; a person is named on the sheet.
- Offered only when `GET /users/me/access` allows the hand-off route; read
  only otherwise. Refreshes every 30 seconds and after each hand-off.
- "Open job" from the sheet goes to the job record.

Reached from the sidebar (Jobs group) as **Production**.

## Not in this

Status moves from the board, machines and capacity, start/stop time (labour,
Phase 3), partial quantities at a station, a hand-off history table (the
printed trail is the history), raising the decorator's PO from the board.

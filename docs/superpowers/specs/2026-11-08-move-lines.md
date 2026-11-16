# Moving lines to another job (2026-11-08)

Roadmap Phase 1, item 5. Owner decision 2026-11-08: **move** only — lines from
one job to another open job of the **same customer**; the stock reserved moves
with them. (Copy, merge and split are not wanted now.)

`POST /jobs/{job_id}/move-lines` — `{item_ids, to_job_id}`:

- Both jobs are the same customer's and open: Quote, Booked, or in work
  (Confirmed through Desp/Ready). Not gone (FINISH, Ready), invoiced, paid or
  cancelled, and not locked (`_require_mutable`). Not the same job.
- A garment takes its decoration and alteration lines with it (the lines that
  apply to it). A decoration line on its own, whose garment stays, is refused:
  it would apply to a line on another job.
- A line still on order — on a purchase order with stock to come
  (`po_no` and a back-order) — is refused: the purchase order names the job it
  is buying for, and the goods would arrive for the wrong one. Receive it first.
- A line that has gone out on a despatch (`qty_delivered`) is refused.
- The lines go to the end of the other job, in their order, keeping their
  prices, picks and where they are on the floor.
- **Stock:** what the lines reserve (goods lines' supply) is released from the
  first job if it reserves stock (`COMMITTED_STATUSES`), and reserved for the
  other if it does — each at its own branch. Two open orders at one branch:
  the stock stays reserved, nothing posted twice.
- Both jobs' totals are worked out again from their lines; both versions move.
- The trail on each job: "Lines 2, 3 moved to job 1218800" and "Lines 4, 5
  moved here from job 1218774".
- `require_staff`, as editing a job's lines is (`PATCH /jobs/{id}`).

Screen: on the job record's lines, tick lines and **Move to job…**; the other
job is chosen from the customer's open jobs.

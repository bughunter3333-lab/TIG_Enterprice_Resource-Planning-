# Time at each status (2026-11-09)

Roadmap Phase 1, item 1 (the rest of the strict workflow). Owner decision
2026-11-08: sensible defaults, editable by an admin.

- `jobs.status_changed_at` — when a job came to its status. Written by the one
  status gate, `_apply_status_transition`, so every path that changes a status
  stamps it (migration `c1d2e3f4a5b6`; a job already at its status takes its
  last change, `updated_at`).
- Allowances: whole working days a job may sit at each open status; 0 is no
  limit. Defaults (`app/core/status_times.py`): Booked 1, Confirmed 1,
  In Progress 3, PROOF 3, Picked 1, Inco/Pick 5, PRINT 2, ProdExt 7,
  Pick/Pack 1, Desp/Ready 1, FINISH 2, Ready 2. Stored as the admin setting
  `status_allowances`; `GET /status-allowances` (anyone signed in),
  `PUT /status-allowances` (admins; open statuses only, whole days 0–60).
- Working days are Monday to Friday, counted on the screen in the person's own
  day (no public holidays yet): moved on Monday, 2 on Wednesday; moved on
  Friday, 1 on Monday.
- Over its allowance, a job shows a clock and the days beside its status on
  the job list ("4d") and the whole sentence on the job ("At Proof 4 working
  days — its allowance is 3"), and is in the shared view **Over time at their
  status** (a quick filter, like Overdue).
- Admin → Status times edits the days.

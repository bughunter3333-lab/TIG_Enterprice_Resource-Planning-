# Watchouts (2026-11-09)

Roadmap Phase 1, item 3. Owner decision 2026-11-08: **on a customer** only.

- `customers.watchout` (migration `d2e3f4a5b6c7`), at most 500 characters —
  "Always ask if name badges are needed". Typed on the customer form; blank
  clears it.
- Every job for the customer reads it from the customer, never copies it
  (`Job.customer_watchout`, read with the job like a logo's code), so a change
  on the customer shows on all their jobs at once.
- Shown as a warning note on the job (under its header) and on the job form as
  soon as the customer is chosen — where the order is taken and where it is
  worked on.

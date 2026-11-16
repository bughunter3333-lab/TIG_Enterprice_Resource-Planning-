# Two requests at once: one lock order, nothing lost (2026-11-15)

Found by an audit of every row lock, and each reproduced on real Postgres
before it was fixed (`backend/tests/postgres/test_concurrency.py`).

## What went wrong

- **Stock went missing.** `post_movement` and `adjust_location` read the count,
  added the movement in Python and wrote the figure back. Two movements of one
  SKU at once each wrote what they had read: on the test, 50 + 5 + 7 ended at
  55 on the item and 62 on its shelf — a lost movement and a ledger that no
  longer agreed with itself.
- **Deadlocks**, a server error for whichever request Postgres stopped:
  - invoicing a job (stock, then the customer) while another order of the same
    customer was confirmed (the customer, then the stock) — the likeliest, as a
    school's orders share garments;
  - a remittance paid oldest invoice first (jobs by invoice date) and one
    allocated by hand (jobs by number) over the same invoices;
  - two bulk changes naming the same jobs in different orders.
- **Two jobs booked at once got the same number**; the second was refused as a
  job that already exists.
- **A delivery filling a job while the job was cancelled** — the cancel had read
  the job before the delivery saved it, and failed its version check (a 500).

## The rule

Every request takes its row locks in one order (`app/core/row_locks.py`); a row
already held is taken again for nothing:

1. the document-number sequence, when an invoice or credit-note number may be
   issued (`invoice_numbers._lock_sequence`);
2. the order-number lock of a portal order, then the job-number lock;
3. the one document the request is about — a purchase order or goods receipt,
   a credit note;
4. jobs, by id;
5. customers, by id;
6. stock, by SKU: the item, then its positions by branch.

Locks are `FOR NO KEY UPDATE`, which still stops another writer but not the key
share Postgres takes when a row referring to the locked one is inserted (a job
line, a comment, a payment, a movement).

- The status gate (`_apply_status_transition`) takes the sequence (if it will
  number the job), the job and its customer before its checks and moves.
- A route that changes jobs reads them under the lock (`row_locks.locked_job`,
  `_locked_for_moves`), so it sees what the last request saved.
- Batches — bulk status, despatch batches, a despatch, unprint — take every lock
  they need before their first savepoint (`_locked_for_moves`): a lock taken in
  a savepoint that is rolled back is let go.
- A receipt locks the jobs it may fill before it shelves anything
  (`receiving.lock_for_receipt`).
- `_recalculate_customer_balance` locks the customer before it flushes the
  caller's stock.
- Stock figures change in SQL — `stock = stock + :q`, floored where they were —
  never read, added to and written back (`stock_ledger._apply`,
  `stock_location.adjust_location`).
- A position is written only under its item's lock (`adjust_location` takes it
  first), so an item's lock guards all its positions and only the order of
  items across SKUs matters: a request moving several SKUs in an order of its
  own — a stocktake, a transfer, a batch — locks them first
  (`row_locks.lock_stock`).
- A movement that meets a position another request deleted makes it again, so
  the units do not read unlocated. A transfer moves a positive quantity; one
  within a branch leaves the position as it is.
- Job numbers are given out under an advisory lock (`_next_job_id`).
- Every transaction on Postgres waits at most `LOCK_TIMEOUT` (10 s,
  `app/database.py`, `SET LOCAL` so it holds through the transaction pooler)
  for a row another holds.

Whatever still meets — that wait running out, a deadlock the order does not
cover, a version moved by another request — is a 409 "try again"
(`app/main.py`, `_try_again`), not a 500.

## Not covered

- An import (Jim2 job list) still locks each row's job and customer as it comes.
  It is run alone.
- A job that becomes back-ordered after a receipt has locked its jobs is filled
  unlocked; the 409 catches the rare collision.

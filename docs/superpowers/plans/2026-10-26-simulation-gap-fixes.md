# Closing the simulation gaps (2026-10-26)

An adversarial re-check of the 38 order-to-despatch findings (`docs/backlog.md`,
SIM F01–F38) against the code and its tests found 10 fully fixed, F37 open by
design, and 27 **partly** fixed: the stated fix holds on the main path, but a
second path, a race, an edge case or the screen still shows the old fault. This
plan is the decision for each. Every fix lands with a test that reproduces the
gap first.

Decisions marked **(rule)** pick a business rule; each is reversible.

## Backend — jobs (`routers/jobs.py`, `logos.py`, `import_data.py`, `dispatch_sessions.py`, `core/job_totals.py`, `core/invoice_numbers.py`)

| # | Gap | Fix |
| --- | --- | --- |
| F01 | The duplicate-order check reads, then writes: two overlapping retries both book | Take a transaction-scoped advisory lock keyed on (customer, order number) before the check (`pg_advisory_xact_lock`; a no-op on SQLite, which has one writer). The same check runs on PATCH when `serial_no` or `item_no` changes. No unique index: live data may already hold duplicates, and an index would fail the deploy — they are listed by the ledger health check instead (see B) |
| F02 | A line edited into a logo code stays a goods line and is bought | `_reconcile_items` resolves the logo for an existing line when its stock code changes, exactly as `_new_line` does; a line that becomes a service loses its back-order and reservation |
| F09 | A line can take another customer's logo, or an inactive one | `_logo_for` matches the job's customer and active logos only |
| F12 | A portal decoration line with an unregistered code is bought as a garment | **(rule)** For an intake (portal) line that carries a `decoration_type`, whose code is neither a stock item nor one of the customer's active logos, and which has no `applies_to_line`: 422 naming the line ("register the logo first"). Staff lines are not refused |
| F19 | `applies_to_item_id` is not validated | It must name a goods line on the same job and not the line itself; 422 otherwise |
| F26 | The portal reads any logo's cost through the intake response | Follows from F09 (the logo must be the job's customer's), and a service role's responses carry no cost or margin fields |
| F04 | A job with no lines is invoiced at whatever total the caller sent; an import overwrites the header of a job with lines | **(rule)** Only the Jim2 import writes header totals. A job created or edited through the API with no lines totals 0, and a lineless job's stored totals are not changed by PATCH. An import row for an existing job that has lines may not change its totals (row error naming both figures). Imported header parts must agree (`total_inc = total_ex + tax`, to the cent) |
| F10 | Other job endpoints accept and drop misspelt fields | Every request body in `jobs.py` and `dispatch_sessions.py` forbids unknown fields (status, bulk status, duplicate, payment, dispatch, pick, sessions and their lines). Each field the frontend sends is checked against them |
| F14 | Moving an open order to another branch leaves its reservation at the old one | A PATCH that changes the branch of a committed, open job moves the reserved quantity (posted out at the old branch, in at the new) |
| F22 | A job already despatched can be despatched again; one batch can name a job twice | **(rule)** A job with `dispatched_at` is refused (409, naming the date and connote) unless the request says `again: true` — a further consignment, e.g. back-ordered sizes. A further consignment appends its connote (`C1, C2`) instead of overwriting. One batch naming a job twice is a 400 |
| F24 | A typed invoice number can race an issued one | The typed-number path takes the same company-settings row lock as `issue()` before checking who holds the number |
| F27 | Growing an open order is never credit-checked; two orders at once both pass | **(rule)** The credit check also runs when a committed, not-yet-invoiced job's total goes up. The customer row is locked for the check. The backlog's wording is corrected: an order over the limit is refused (422); "Ordered on account" is the comment on one inside it |
| F28 | Create Similar and the Jim2 import write no opening comment | Duplicate writes "Created as {status} — a copy of job {id}"; import writes "Imported from Jim2" |
| F31 | The job page keeps its own proof; changed artwork stays approved | A line with a logo reports `logo_proof_status` (and `logo_id`, `logo_code`). PATCH `/logos/{id}` that changes `artwork_ref` or `stitch_count` puts the logo back to pending. `Job.proof_status` stays for jobs with no logo lines |
| F33 | An import puts an invoice date back on a job that is not invoiced | The import writes `invoice_date` only on rows whose status is INVOICE or PAID. Entering an invoiced status always sets `invoice_status`, keeping only an existing date |

## Backend — stock, purchasing, payables (`purchase_orders.py`, `goods_receipt.py`, `core/receiving.py`, `inventory.py`, `core/reservations.py`, `core/job_weight.py`, `core/purchase_order_document.py`, `core/despatch_documents.py`, `reports.py`, `core/bill_matching.py`, `accounts_payable.py`, `core/ledger_reports.py`)

| # | Gap | Fix |
| --- | --- | --- |
| F03 | PATCH on a goods receipt can reopen an accepted one (stock credited twice) or mark one Accepted without shelving it | Accepted is reached only through the accept endpoint and is final: PATCH may move between Pending, Inspecting and Rejected and nothing else (409 otherwise) |
| F18 | Two accepts at once can both shelve; a receipt cannot say which PO line it is for | Accept locks the receipt row and re-checks its status. (The screen sending `po_item_id` is in C) |
| F29 | PATCH on a PO sets Partial or Received by hand, whatever the lines say | Partial and Received are derived from the lines only. PATCH may set Draft, Sent, or Cancelled (Cancelled only while nothing is received); 422 otherwise |
| F15 | Auto-reorder raises a PO with no GST or inc-GST total | It totals through `_set_totals` like every other PO write. Health lists POs whose stored totals disagree with their lines |
| F17 | The PO document prints the stored totals; a cancelled or received PO can be emailed | The document totals its lines. Emailing a Cancelled or Received PO is a 409 |
| F25 | A PO received but not billed is in neither aged payables nor committed spend | Aged payables gains `received_not_billed`: per PO, received value inc GST, billed inc GST, outstanding. Committed spend totals the lines (F15) |
| F36 | Bill matching has no "ordered" figure | `po_match` gains `ordered_inc` (the PO's lines inc GST). Matching stays at PO level; the docs say so |
| F16 | Raising a PO from requirements does not refuse in-house work | `from-requirements` refuses in-house logo lines (422 naming them) |
| F14 | Two definitions of a goods line; location endpoints return a stale counter | `reservations.GOODS_LINES` matches `_is_stock_line` (product lines that are not services). The location endpoints return the derived committed figure |
| F08 | A bought-in goods line is neither weighed nor flagged | A goods line with no stock item is weighed by its own `weight_kg`, and counted as unweighed when it has none |
| F21 | The delivery note prints the order quantity for lines not yet supplied | It prints what is going (picked, else supplied) and shows the rest as back-ordered; a line with nothing going is listed as back-ordered only |
| F01 | (old data) | Health lists portal orders booked twice (same customer and order number, not cancelled) |

## Frontend (`frontend/src/…`)

| # | Gap | Fix |
| --- | --- | --- |
| F01 | The search box cannot find a portal order number or contact; only the newest 500 jobs are loaded | The client filter also matches order no. (serial), contact, requested by, ex-job ref and connote; with two or more characters typed, the list also asks the server (`GET /jobs?search=`) and merges what it finds |
| F02, F19 | No way to link a decoration or alteration to its garment from the screen | The line editor has an "Applies to" choice (the job's goods lines), sent as `applies_to_item_id` for saved lines and `applies_to_line` for new ones; the stock-code field suggests the customer's logos |
| F06 | The Customers list sums the 500 newest jobs instead of reading the balance | Balance and over-credit read `customer.balance` from the server |
| F08 | The Stock module's Details tab cannot see or edit weight | Weight per unit (kg) on Details, saved with the item |
| F09 | Logos cannot be edited | Edit on the Logos tab (price, cost, position, stitches, who makes it, active) through `PATCH /logos/{id}` |
| F16 | The decoration worklist does not show who makes it | Columns for made by and decorator; "Not set" where the server has none |
| F17, F29 | The PO status dropdown offers derived statuses | It offers only Draft, Sent and Cancelled; Partial and Received are shown, not chosen |
| F18 | The goods-receipt form does not say which PO line a row is for | Each row sends its `po_item_id` |
| F21 | Ship labels printed before despatch ignore the cartons and connote; the selection is gone after | The Dispatched view prints delivery notes and ship labels for the jobs it recorded |
| F22 | Ship Via is pre-filled with the ship-to code; despatched jobs are offered again | Ship Via starts from the job's `shipVia`. Jobs already despatched are hidden unless "Show despatched" is ticked, and sending one again says it is a further consignment (`again: true`) |
| F23 | Overseas staff can print a tax invoice or proforma from the job page | Tax invoice and proforma in the Print menu are offered only where `GET /jobs/sales-register` is allowed |
| F25 | Aged payables shows nothing for received, unbilled goods | A "Received, not billed" section beside committed spend |
| F31 | The job page shows and edits a per-job proof | Where the job has logo lines, the proof panel shows each logo's proof (approve through the logo, where offered); the per-job proof stays for jobs without logos |
| F36 | Bill screen shows received vs billed only | Ordered, received and billed |

## Round 2 (2026-10-30) — what the re-check still broke

A second adversarial pass ran each gap's original probe against the fixes and
tried to get round them. 10 closed; 17 had a further path. Decisions:

| # | Still broken | Fix |
| --- | --- | --- |
| F01 | Changing only the customer, or a Jim2 re-import writing an order number, books a repeat | The repeat check also runs when `customer_id` changes and on every import row for a portal job. Server search also matches the customer code and ship-to code, as the screen's own filter does |
| F02 | A logo line recoded to a garment code keeps its logo (never bought); a line keyed before its logo was registered never links | On a recode to a code that is no customer logo, the line drops its logo and is a goods line again. A line with no logo whose code matches one of the customer's active logos is linked on any save |
| F09 | Moving a job to another customer keeps the first customer's logo lines; Create Similar copies a retired logo | **(rule)** Changing a job's customer while it carries another customer's logo lines is a 422 naming them. Create Similar refuses a line whose logo is retired (422 naming it) |
| F12 | A portal decoration line marked only by `emb_code`/`dec_code` is bought | The refusal also applies when the line carries an `emb_code` or `dec_code` (not blank, not "None") |
| F19 | Turning the garment into a note, or deleting it, leaves the alteration pointing at nothing | After the lines are final, every line's `applies_to_item_id` is checked, not only the ones resent; a dangling one is a 422 naming both lines |
| F27 | Moving a committed job to another customer is never credit-checked | Changing the customer of a committed, not-yet-invoiced job runs the credit check against the new customer |
| F14 | `branch: ""` stores an empty branch the derived figures do not read as HQ | A blank branch is stored as null (HQ) |
| F04 | A re-import whose file has no total columns zeroes the job's totals, and refuses jobs with lines | The import writes only the total columns the file carries; the agreement checks compare only what it carries |
| F31 | Changing the decoration type, colour count or position keeps the approval | Those also put the logo back to not proofed |
| F18 | Two receives of the same PO line at once both credit it | Both receive paths lock the PO row before crediting its lines |
| F29 | A cancelled PO can still be received | Both receive paths and goods-receipt create refuse a Cancelled PO (409) |
| F25 | A short-shipped PO can never be closed; a PO can be created as Received | **(rule)** A Partial PO may be set to Received — "closed short": the rest is not coming. Create always starts at Draft or Sent with nothing received |
| F17 | The PO document prints a cancelled order as live; Email shows on Cancelled / Received | The document says CANCELLED on a cancelled PO; the screen hides Email supplier where the server refuses it |
| F08 | The picking slip prints a stored weight that goes stale; a goods line with no stock code is neither weighed nor flagged | The picking slip weighs the job when it prints; a goods line with a quantity and no stock code counts as unweighed |
| F21 | A further consignment's delivery note prints running totals; the list's pre-despatch notes and labels print the last consignment's carton and connote | **(rule)** Each despatch records what went per line (new table `dispatch_line_items`: session line, job line, quantity — one migration on `c5d6e7f8a9b0`). What goes is what is picked (else supplied) less what earlier consignments took; a despatch with nothing left to send is a 409. A session's delivery note prints its own quantities. The list no longer prints delivery notes or ship labels before a despatch is recorded — the Dispatched view does |
| F25 | (found while fixing) A PO closed short or cancelled left its job lines pointing at it; the buying list skips a line with a PO, so the missing units were never bought again | Closing short releases the job lines still back-ordered on it; cancelling releases every line on it |
| F06 | The job form's credit banner sums the loaded jobs | It reads the customer's server balance |
| F23 | The job record's Documents tab opens a tax invoice for anyone | Gated the same way as the Print menu |

## Not changed

- **F37** — job margin vs the ledger's cost of sales stays an owner decision.
- The jobs list still loads the newest 500 jobs; search now reaches past them (F01). Paging the list is a separate piece of work.

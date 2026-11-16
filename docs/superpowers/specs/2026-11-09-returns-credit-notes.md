# Returns and customer credit notes (2026-11-09)

Roadmap Phase 1, item 6. Owner decisions: only **plain** goods (not decorated,
not personalised) go back to stock, through a returns location and an
inspection (restock or scrap); decorated goods are credited but never
restocked (S2-07, 2026-11-06). The credit note lives in this app's ledger;
on an invoice already paid it is **credit on the customer's account**, used
against their next invoice; credit notes have their **own series, CN-0001**;
only **managers and admins** raise one (2026-11-09).

Revised 2026-11-10 after review: credit used later is its own ledger entry;
returns are not stock until inspected; an amount can be credited; a credit
note is never dated in a locked period.

## The credit note

`POST /jobs/{job_id}/credit-notes` (`require_manager`) on an invoiced job
(INVOICE, PAID): `{lines: [{item_id, qty, goods_back}], reason, credit_date?}`
**or** `{amount, reason, credit_date?}` — one or the other.

- A line is credited at the quantity given, priced as the job line is (the
  same formula as the job's totals, `core/job_totals.py`: ex GST plus 10%, or
  inc GST for a line priced inc, its GST rounded line by line). Never more than
  the line's quantity less what earlier credit notes took.
- An **amount** (inc GST) credits no lines: an invoice imported from Jim2 as a
  header has none, and a price adjustment needs none. Its GST is in the
  invoice's own proportion of what is left (a GST-free invoice credits no GST);
  never more than is left.
- `goods_back` (garments only): the goods are coming back. Plain goods wait in
  the returns area (RET) for inspection; decorated goods — a decoration type
  of their own, a logo or alteration line applying to them, or a logo line
  naming no garment (it decorates them all, as the production board reads it)
  — are credited and never come back into stock. A decoration or charge line is
  credited as money only.
- Numbered CN-0001, CN-0002 … (the next after the highest used, under the lock
  invoice numbers take), stamped with the date and who raised it.
- **Dated** today or earlier ("today" being the shop's: up to a day ahead of the
  server's UTC date), not before the invoice, and after the ledger's lock date
  — a note dated in a lodged period would be posted on another day while its
  documents kept this one.
- **Applied** at once to the job's invoice, up to what the invoice still owes;
  the rest is **credit on account** (the invoice paid already, or the credit
  larger than what is owed). The note that credits everything left on an
  invoice takes the invoice's exact remainder (ex, GST, inc).

`POST /credit-notes/{id}/apply` (`require_manager`) — `{job_id, amount}`:
credit on account against another invoice of the same customer, up to what it
owes and what is left of the credit.

## What it touches

- **The invoice:** `jobs.credited` (applied credit) joins the invariant
  `balance_due = total_inc − deposit − credited` (`credit_notes.owed`), kept by
  invoicing, `_settle_money`, every payment (`_take_payment` works it out
  afresh, never decrements) and each application. A fully credited invoice is
  paid off, as a payment would pay it. The job record shows Credited apart
  from Paid.
- **Ledger:** the credit note's entry is fixed once raised — Dr sales (ex),
  Dr GST collected (GST), Cr receivable (inc) untagged, as credit on the
  customer's account (`source_type` `credit_note`, dated the note's day). Each
  application is its own entry (`credit_application`, dated the day applied):
  Dr receivable untagged, Cr receivable tagged with the invoice. Using credit
  later never re-dates the note, so neither period's GST moves.
- **Customer balance** = what their invoices owe less their unapplied credit.
- **Ledger health:** expected receivables per job subtract the credit applied;
  unapplied credit is expected on the customer's account; an invoice paid and
  credited past its total is listed (`paid_and_credited_past_total`).
- **Aged receivables:** unapplied credit shows as a credit line (current); as
  at a past day, credit applied after it is added back, as payments are.
- **Statements** (screen and PDF, one source — the screen reads the server's):
  each credit note as a credit; what settled an invoice is payments plus credit.
- **Sales register, GST report and BAS summary** (from documents): credit notes
  dated in the period subtract from sales and GST collected; the ledger's BAS
  reads the posted entries (its G1 counts `credit_note` entries too).
- **Jim2 re-import:** credit applied here counts as settlement — the file's paid
  amount plus it must fit the total.

## Returns

- Goods back wait in the returns area, **not as stock**: nothing can be
  promised, picked or reordered against goods nobody has looked at.
- `POST /credit-notes/{id}/lines/{line_id}/inspect` (`require_staff`) —
  `{outcome: restock | scrap}`. Restock brings them into stock at the job's
  branch: `post_movement` type **Return** (an on-hand type,
  `stock_ledger.ON_HAND_TYPES`). Scrap writes them off; they never were stock,
  so nothing moves. Once only. A code no longer a stock item cannot be
  restocked (409); it can be written off.
- `GET /returns?status=waiting|restocked|scrapped` (`require_any`, no money;
  tagged `returns`, the Stock area) — waiting oldest first, done latest first.
- Goods back are checked against what went out: never more than the line
  supplied less what earlier credit notes brought back. A code that is no
  stock item (an indent) is credited but has no shelf to return to.

## Guards

- An invoice with a credit note against it (or applied to it) stays invoiced:
  unprinting or cancelling it is refused (`_keep_credited_invoices` in the
  status gate), since its credit would then stand against no sale.
- A payment, a remittance and an application lock the invoice as they read
  it, and the customer's balance is locked before it is summed, so two at once
  never settle the same balance or write a balance missing the other.

## Screens

- On an invoiced job, a **Credit notes** card (staff read; managers and admins
  raise): **Credit / return…** — lines with quantity and whether the goods come
  back, or an amount; the reason; the date; the credit worked out as it is
  typed by the server's rules. Raising reloads the open job.
- **Returns** (Operations, beside Stock): waiting at RET, Restock to the
  job's branch / Write off (asked once more). 48px buttons for a tablet.
- On the customer: credit on account, applied to one of their open invoices
  (from the server's statement, every invoice); the Statement tab is the
  server's statement.
- PDF: an **adjustment note** (the ATO's name for a GST credit note) —
  `GET /credit-notes/{id}/pdf`; an amount credit prints one adjustment row.

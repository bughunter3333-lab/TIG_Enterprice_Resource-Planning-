# General ledger — design

**Date:** 2026-09-25 · **Status:** built

## Why

The system tracks jobs, stock, purchasing and despatch well, and reports on
money — GST, BAS, aged debtors and creditors, statements, stock valuation, job
profitability. But each report recomputes from the operational tables in its
own way, and there is no ledger underneath. So there is no profit and loss, no
balance sheet, nowhere to record rent, wages or bank fees, and no way to prove
that the debtors report and the GST report describe the same business.

A double-entry ledger that operational documents post into automatically is the
thing that separates an ERP from an operations tool. Every open-source ERP
reviewed is built around one.

## What the open-source ERPs agree on

Read for design only. ERPNext and Dolibarr are GPL-3.0 and no code is taken.

| Principle | ERPNext | Odoo | Tryton |
| --- | --- | --- | --- |
| An entry is lines; each line is a debit *or* a credit to one account | GL Entry | `account.move.line` | Move Line |
| An entry cannot post unless debits equal credits | on submit | on post | on post |
| A posted entry is never edited or deleted; it is corrected by a reversing entry dated when the correction is made | "Immutable Ledger" | reversal | posted is permanent |
| Nothing posts into a closed period | Accounts Frozen Till | lock dates | open periods only |
| Invoices, bills and payments post automatically; manual journals are for adjustments | yes | yes | yes |
| Receivable and payable lines are matched to the payments that settle them | Payment Ledger | reconciliation | Reconciliation |

From ERPNext's Australian localisation: GST collected and GST paid are separate
accounts, and BAS labels are read off those accounts rather than recomputed
from invoices.

Sources: ERPNext accounting and AU localisation references; Odoo 18 accounting
documentation; Tryton `account` module design (moves, periods, reconciliation);
ERPNext "Immutable Ledger" and Period Closing Voucher documentation.

## Decisions

**Accounts are found by role, not by code.** The posting code asks for "the
receivables account", never for `1100`. Accounts can be renumbered or renamed
without breaking posting, and an account holding a role cannot be deactivated.

**Only posted entries exist.** No drafts. The immutability invariant then holds
from the moment a row is written, and a manual journal is checked before it is
submitted rather than saved half-finished.

**One posting function.** Every entry goes through `ledger.post()`, which
enforces: at least two lines; each line a debit or a credit, never both, never
negative; amounts in whole cents; debits equal credits exactly; every account
exists and is active; the date is after the lock date. This is the ledger's
`_apply_status_transition` — the one door everything goes through.

**Automatic entries are owned by their source document.** One active entry per
source (an invoice, a payment, a bill). Changing the source reverses the entry
and posts a new one; a person cannot reverse an automatic entry directly — they
change the invoice or the bill. Manual journals are reversed by hand.

**Invoicing posts on the same boundary as stock.** Entering INVOICE or PAID
posts the invoice; leaving them reverses it. That is the boundary stock already
uses, so an INVOICE → FINISH move puts back both the stock and the revenue.

**Amounts are signed, then split.** Each line is built as a signed amount and
turned into a debit or credit by its sign. A negative invoice becomes a credit
note with no special case.

**Automatic entries balance by construction.** What the customer owes is the
total including GST; GST is exactly what the document states; income is the
difference. So an invoice or bill can never fail to post over a cent of
rounding, and the GST figure BAS reads is always the document's own. (The
first design put any disagreement into a Rounding account; deriving the income
line made that unnecessary. The Rounding account remains for manual use.)

**Inventory is periodic in this version.** Supplier bills against a purchase
order post to Purchases (cost of sales); other bills to the account chosen on
the bill. Stock on the balance sheet is set by an adjustment at stocktake.
This is how most Australian small businesses on Xero run, and it is honest
about where the numbers come from. Perpetual inventory — cost of goods sold
posted from each shipment at average cost — is the next step, and depends on
the stock ledger's cost figures being trusted first.

**Receivables net per customer.** A deposit taken before invoicing credits
receivables and is offset when the invoice posts, rather than being modelled as
a separate advance.

**Reversals are dated when they are made.** As in ERPNext's immutable ledger,
so a correction never reaches back into a closed period.

## Chart of accounts

Australian small-business, Xero-style numbering. Roles in brackets.

| Code | Account | Category |
| --- | --- | --- |
| 1000 | Business Bank Account (bank) | asset |
| 1100 | Accounts Receivable (receivable) | asset |
| 1200 | Inventory (inventory) | asset |
| 1400 | GST Paid (gst_paid) | asset |
| 2000 | Accounts Payable (payable) | liability |
| 2100 | GST Collected (gst_collected) | liability |
| 2200 | PAYG Withholding Payable | liability |
| 2300 | Superannuation Payable | liability |
| 3000 | Owner's Capital | equity |
| 3100 | Retained Earnings (retained_earnings) | equity |
| 3900 | Opening Balance Equity (opening_balance) | equity |
| 4000 | Sales (sales) | income |
| 4900 | Other Income | income |
| 5000 | Purchases (purchases) | cost of sales |
| 5100 | Decoration Subcontract | cost of sales |
| 5200 | Freight Inwards | cost of sales |
| 6000 | General Expenses (default_expense) | expense |
| 6100 | Rent | expense |
| 6200 | Wages & Salaries | expense |
| 6210 | Superannuation | expense |
| 6300 | Bank Fees | expense |
| 6400 | Utilities | expense |
| 6500 | Motor Vehicle | expense |
| 6900 | Rounding (rounding) | expense |

## Postings

| Event | Debit | Credit |
| --- | --- | --- |
| Job enters INVOICE/PAID | Receivable — total inc GST | Sales — total ex GST; GST Collected — GST |
| Job leaves INVOICE/PAID | reversal of the above, dated today | |
| Customer payment recorded | Bank | Receivable |
| Supplier bill entered | Purchases or chosen account — ex GST; GST Paid — GST | Payable — inc GST |
| Bill changed / deleted | reversal, then a fresh posting if it still exists | |
| Bill paid | Payable | Bank |
| Manual journal | as entered, balanced | |

## Reports, all read from journal lines

Trial balance; profit and loss (income, cost of sales, gross profit, expenses,
net profit); balance sheet (assets = liabilities + equity, with retained
earnings and current-year earnings split on the Australian financial year);
general ledger by account with running balance; BAS on an accrual basis
(G1, 1A, 1B, net).

## Proving it is right

- The ledger's BAS must equal the existing `/reports/bas-summary` for the same
  data. Two independent computations agreeing is the check.
- A ledger health view ties the receivables account to the sum of jobs'
  balances due, the payables account to unpaid bills, and lists invoiced jobs
  with no posting.
- The balance sheet must balance, and the trial balance must total to zero, on
  every test dataset.

## What building it found

Two independent calculations disagreeing is the point of having both. On the
first run against real data the ledger's BAS and the document BAS differed, and
chasing the difference found three defects the ledger did not cause:

- **The BAS claimed GST credits on purchase orders.** 1B summed PO tax by order
  date. A PO is not a tax invoice; one cancelled, never billed or billed next
  quarter still reduced the GST payable. 1B now reads supplier bills.
- **Invoiced jobs could carry no invoice date,** and the BAS selects by it, so
  their sales and GST were silently absent. Only a status change to INVOICE
  stamped the date — not PAID, not creating a job already invoiced, not the
  CSV import. All four paths now stamp it, and the import reads Jim2's
  "Inv Date" (day-first) into ISO so text comparisons in reports hold.
- **Jobs marked PAID with no payment recorded** — the job says paid, no money
  was ever entered. The ledger keeps them owed and lists them.

## Permissions

Reading the ledger and its reports: admin or manager — a profit and loss with
wages in it is not for every account. Posting manual journals, editing the
chart, setting the lock date and bringing history into the ledger: admin.

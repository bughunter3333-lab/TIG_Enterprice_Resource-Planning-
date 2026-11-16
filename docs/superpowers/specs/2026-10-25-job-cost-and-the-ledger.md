# Job margins and the ledger's cost of sales — why they differ

Simulation finding F37 (LOW, by design). After the simulated order-to-despatch cycle,
the job profitability report showed a job cost total of **$249.50** while the ledger's
profit and loss showed cost of sales of **$182.50**. Both are right. They measure
different things, and this note says what each one counts so nobody reconciles them by
hand expecting them to agree.

## What each figure is

| | Job profitability (`GET /reports/job-profitability`) | Ledger cost of sales (`/accounting/reports/profit-loss`) |
| --- | --- | --- |
| Basis | What the job *should* have cost: each product line's `purchase_price × order_qty` | What the business *was billed*: supplier bills coded to Purchases |
| When it is counted | When the job is FINISH, INVOICE or PAID | When the bill is entered (accrual), whichever job it was for |
| Stock | Costed at the line's purchase price, whether it came off the shelf or was bought for the job | Not counted until a bill arrives — the ledger is a **periodic** inventory system |
| Opening stock | Counted, at the line's price, when it is sold | Never: a stock adjustment or opening count posts nothing to the ledger |
| Goods receipts | Not involved | Post nothing — the bill does |
| Inbound freight and duty | Not in the line price | In cost of sales only if billed and coded to Purchases; the landed-cost charges on a goods receipt reach stock COG (`avg_cog`), not the ledger |
| In-house decoration and alterations | Counted when the line carries a cost: a decoration line applying a logo now takes the logo's `cost_ex` (logo master, 2026-10-25) | Wages and running costs, under expenses — never cost of sales |
| Subcontracted decoration | The logo line's cost | The decorator's bill, coded to Purchases |

## Why the ledger is periodic

The ledger posts from documents that carry money: invoices, customer payments, supplier
bills, supplier payments and manual journals (`app/core/ledger_postings.py`). Stock
movements carry quantities, not values, so they post nothing. That keeps the ledger
exact for GST and the BAS — every figure in it is on a tax invoice — at the cost of
cost of sales following purchases rather than sales. Over a year the two converge,
less the change in stock held; over one job they need not.

## Reading them together

- **Margin by job or client:** use job profitability. It is the like-for-like figure, and
  the one Jim2 showed as sell minus components.
- **Gross profit for the period:** use the ledger, adjusted for the change in stock
  value — the stock valuation report (`/reports/inventory-valuation`) at the start and
  end of the period.
- **Where a job's cost is understated:** a product line with no `purchase_price`, or an
  in-house decoration line whose logo has no `cost_ex`, counts as costing nothing.

## Not done, deliberately

Moving to **perpetual** inventory — receipts debiting an Inventory asset, invoicing
posting cost of sales at average cost — would make the two figures meet per job. It is
a change to the chart of accounts, the BAS and every past period's comparatives, so it
is a decision for the owner and the bookkeeper, not a fix. Recorded in
`docs/backlog.md` (SIM-F37).

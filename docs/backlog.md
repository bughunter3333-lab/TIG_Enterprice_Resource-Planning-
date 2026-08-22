# Backlog

Work that is scoped and justified but not yet done. Each item says what it is,
why it is worth doing, and what it touches — enough to start from without
re-deriving it.

Delete an entry when it ships. An entry that has sat here for months without
becoming more urgent is telling you it was never worth doing; delete that too.

---

## Tier D — small stock and design items

Carried over from the open-mercato architecture study. All three are hours, not
days, and none blocks anything else.

### D1. Record who moved stock

`stock_movements` says what moved and, since `2ece832`, where — but not who.
Every other audited action in the system carries an actor: `JobComment` stores
`initials` and `author_name`, and goods receipts store `created_by`.

Add a nullable `user_id` (or `created_by` username, matching the goods-receipt
convention) to `StockMovement`, set it in `post_movement`, and surface it in the
Stock → Transactions tab. `post_movement` is the single funnel now, so this is
one signature change rather than ten call sites — which is most of the reason it
is cheap.

The actor has to reach `app/core/stock_ledger.py`, which currently takes no user.
Passing it explicitly from each router is the honest option; a request-scoped
context variable would not work, because `get_current_user` is sync and FastAPI
runs sync endpoints in a threadpool with a copied context.

*Touches:* `backend/app/models/inventory.py`, `backend/app/core/stock_ledger.py`,
the four routers that call it, a migration, `StockTransactionsTab.jsx`.

### D2. Guard the PO receive button against a double submit

`POST /purchase-orders/{id}/receive` now moves stock by the clamped delta
(`59c6d98`), so a repeat submission cannot over-receive against the order. What
is still missing is the in-flight lock on the client: the Confirm Receipt button
at `TotalImageERP.jsx:3714` stays enabled while the request is out, so an
impatient double-click sends two requests.

The goods-receipt path refuses a second accept outright with a 409
(`goods_receipt.py`). The PO path has no equivalent status guard — receiving a
`Received` order should be refused rather than silently doing nothing.

*Touches:* `backend/app/routers/purchase_orders.py` (status guard),
`frontend/src/TotalImageERP.jsx` (disable while pending).

### D3. Keep `index.css` and `tokens.js` in step

`frontend/src/index.css` duplicates six colour values from
`frontend/src/ui/tokens.js`, with a comment asking a human to keep them
matching and nothing enforcing it. That is exactly how the palette re-skin left
an amber focus ring in the CSS while every `.jsx` file had moved to steel-blue.

A ~10-line vitest asserting every hex in `index.css` appears in `tokens.js`
closes it. Two values (`#c3ccd6` scrollbar thumb, `#eff6ff` active-tab tint)
have no token yet and need one first, so the test is not drop-in green.

Deliberately *not* doing the rest of that recommendation: no ESLint plugin, no
ratcheting palette baseline. The repo has no ESLint at all, ~1,700 raw colour
utilities, and a warn-level rule nobody can clear in one sitting is noise that
trains you to ignore lint output.

*Touches:* `frontend/src/ui/tokens.js`, `frontend/src/ui/__tests__/tokens.test.jsx`.

---

## Known gaps, deliberately open

Not scheduled, recorded so they are not rediscovered as surprises.

- **Historical stock movements have no branch.** Rows written before `2ece832`
  carry a null `location_branch`. The branch they hit is not recorded anywhere,
  so backfilling one would be inventing it. The Transactions tab shows a branch
  for new rows and blank for old, which is the true state.
- **Legacy stock has no location.** Items received before per-location tracking
  show a non-zero "Not yet located" figure on the Locations tab. That is the
  honest reading, and it resolves itself as stock is put away. Production was
  deliberately not backfilled to HQ — asserting a location the business has not
  confirmed is the fabrication the reconciliation strip exists to expose.
- **The job-save conflict path is unverified in the UI.** The backend returns a
  409 with a readable message and `api.js` surfaces it, but whether that reaches
  a visible toast on the job screen in `TotalImageERP.jsx` has not been traced.
- **Fourteen columns have no writer.** Tracked with reasons in
  `backend/tests/unit/unwritten_columns.json`; the test fails on a fifteenth.

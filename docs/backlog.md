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

### D4. An ESLint `no-undef` pass over the frontend — done

A name used inside a component but never imported is invisible to everything we
run. `npm run build` emits the reference happily — esbuild does not resolve
identifiers — and the monolith import smoke test in
`frontend/src/__tests__/monolithImports.test.js` only proves the module graph
resolves, because the reference is not evaluated until the component renders.

That is not hypothetical: it happened while wiring the job-edit guard. The build
passed on a `TotalImageERP.jsx` calling two functions that did not exist.

The narrow fix is ESLint with `no-undef` at error, and nothing else turned on.
That rule has close to no false positives and catches exactly this. It is
explicitly *not* the broader design-system lint rollout, which the open-mercato
study argued against and still argues against: the repo has ~1,700 raw colour
utilities, and a warn-level rule nobody can clear in one sitting trains people
to ignore lint output.

*Touches:* `frontend/eslint.config.mjs`, `frontend/package.json`,
`.github/workflows/test.yml`.

**Outcome.** Done as described. The first run over `src` reported 11 errors
against 401 warnings, and four of the errors were live crashes:
`ReportsModule.jsx` called `useQueryClient()` without importing it, so the Back
Orders tab threw on render and its refresh-after-mutation had never worked, and
`StylesModule.jsx` called `notify` at three sites with no import. The remaining
errors were three `catch {}` blocks swallowing real API failures — bulk status
change and bulk delete discarded every per-job rejection, which had become
wrong the moment jobs were made lockable in `b4f6671` — plus one dead `??`
operand and one redundant escape. The rule earned its place on the first run.

### D5. Decide whether the inline PO receive should exist at all

Two paths still receive stock against a purchase order: the "Confirm Receipt"
button on the PO card, and the goods-receipt panel below it. Both are now
truthful — the shelf and the order agree either way — so the double-receive no
longer goes unflagged. What remains is a product decision rather than a defect.

The case for retiring the inline button: it touches no cost field, so anything
received through it stops `last_cost` and `avg_cog` tracking, and the landed
costing built to make COG truthful never sees those deliveries. The goods-receipt
panel also pre-fills each line with its outstanding quantity, while the inline
form starts empty and needs a figure typed per line — so the ergonomics argument
runs the other way from what you would expect.

The case for keeping it: it is one click for the common "the whole order turned
up" case, and people may be used to it.

Note the two paths deliberately differ on over-delivery. The receipt records
what arrived, because it is a document someone reviews. The inline button clamps
at the quantity ordered, because it is a number typed straight into a button
with no review step — the clamp is a guard against a fat-fingered 999, not an
accounting rule. If the inline path is retired, that distinction goes with it.

*Touches:* `backend/app/routers/purchase_orders.py`,
`frontend/src/TotalImageERP.jsx`,
`backend/tests/integration/test_stock_paths_guarded.py`.

---

## Security follow-ups

From the audit of 2026-08-27. The confirmed findings were fixed in `88063a7`;
these are the ones that need more than an edit.

### S1. Per-account login lockout

The only brute-force control is slowapi's 10/minute on login and 5/minute on
2FA verify, keyed on IP. That key is now taken from a value the client cannot
set, but IP is the wrong axis regardless: staff reach the API through one Vercel
rewrite and share an egress address, so tightening the limit throttles the whole
team together. Nothing anywhere counts failures against an *account* — there is
no `failed_logins` or `locked_until` column.

Two details make it matter more than it looks. 2FA is optional, so for anyone
who never enrolled the password is the entire barrier. And a wrong TOTP code
costs nothing: the pre-MFA cookie is not deleted on failure, so one 300-second
window absorbs unlimited attempts, and a fresh window can be minted by calling
login again.

One migration adding `failed_logins` and `locked_until` to `users`, then the
counter in `login()` and `verify_2fa()`. Return the *same* generic 401 for a
locked account as for a wrong password — a distinct 429 would be a new
account-existence oracle. Database-backed, so it survives the free-plan cold
starts that reset the in-memory limiter. Do not add Redis for this.

### S2. Escape job text before it reaches ReportLab and the invoice email

`Paragraph()` parses a mini-XML markup language and `escape` appears nowhere in
`backend/app/routers/pdf.py`. A line-item description containing font or anchor
markup alters a tax invoice; an unclosed tag raises and 500s that job's PDF
permanently.

The path that makes this a real boundary crossing rather than "staff can type
things": a supplier CSV goes through `POST /import/inventory` into
`InventoryItem.name`, the frontend copies that into a job line description, and
`pdf.py` renders it. The person who prints the invoice is not the person who
wrote the string. `email_router.py` builds its whole HTML body as an f-string
with the same exposure.

Escape the DB-derived values only. Do **not** apply a blanket helper across all
call sites — several pass intentional literal markup, and a sweep would render
those as visible tag text.

### S3. Confirm which X-Forwarded-For entry the platform sets

`88063a7` changed the rate-limit key from the leftmost entry to the rightmost,
which is correct if the platform appends exactly one hop. That could not be
confirmed without sending traffic at production. Send a request carrying a junk
X-Forwarded-For and check which value arrives last. If the platform replaces the
header rather than appending, leftmost and rightmost are the same value and the
change is still correct.

### S4. CI hardening

`.github/workflows/test.yml` declares no `permissions:` block, so the default
GITHUB_TOKEN scope applies, and all four actions are pinned to floating major
tags. A compromised upstream action would run with whatever the repo default is
on a push to main — which is what Render and Vercel deploy from. Add
`permissions: contents: read` and pin the actions to commit SHAs. The workflow
correctly uses `pull_request` rather than `pull_request_target`, and references
no secrets, so a fork PR has nothing to steal today.

---

## Frontend tooling — open decisions

### F1. Whether to adopt Prettier at all

Prettier is installed and configured (`.prettierrc.json`, `npm run format`), but
is deliberately *not* wired into the pre-commit hook. The hook runs ESLint only.

The reason is measured, not stylistic. This codebase is dense, and Prettier
rewrites roughly 2.3 lines for every line in a file it touches:

| file | lines | lines Prettier changes |
| --- | --- | --- |
| `src/modules/ReportsModule.jsx` | 1,222 | 3,275 |
| `src/modules/StylesModule.jsx` | 895 | 2,476 |
| `src/api.js` | 1,301 | 1,239 |
| `src/TotalImageERP.jsx` | 9,849 | 19,807 |

All 110 source files are affected. Print width is not the cause — widening it
from 100 to 200 only moves ReportsModule from 3,275 to 2,815 — so there is no
configuration that makes this cheap.

That leaves two honest options, and no middle one:

- **Adopt it in a single dedicated formatting commit**, recorded in a
  `.git-blame-ignore-revs` file so `git blame` and GitHub both skip it. Best
  done *before* the monolith is decomposed, not after, since the extracted
  modules would otherwise each need their own reformat.
- **Leave it off**, and keep ESLint as the only enforced gate. The existing
  style is internally consistent; it is dense rather than untidy.

What is not viable is per-file adoption on touch, which was the original plan:
it would put a 3x reformat on top of every one-line fix, permanently.

This is a judgement call about a public repository's history, so it is recorded
rather than taken.

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

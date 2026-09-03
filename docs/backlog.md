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

### F2. The rest of the monolith, measured

`TotalImageERP.jsx` held 28 zero-argument render functions — `const renderX =
() => {...}` closing over the component scope. Eleven were converted to real
components; what remains is listed here with the numbers that decide the order,
so the next pass does not start by re-deriving them.

Two of the 28 (`renderReports`, `renderScheduling`) are thin wrappers around
`ReportsModule` and `SchedulingModule` and are indirection, not candidates. So
is `renderDashboard`, which is nine lines around `<Dashboard>`.

**Method.** Prop counts below are not estimates. Each function was written to a
temporary standalone module and linted; `no-undef` plus `react/jsx-no-undef`
name exactly the identifiers it takes from an enclosing scope, and anything the
monolith imports is separated out as an import rather than a prop. The same
pass is what makes the extraction checkable: drop a prop and the new file fails
`no-undef` before it ever renders.

**A prop count overstates coupling where the state is private.** Thirty of the
component's 131 `useState` pairs are read by exactly one render function and
nowhere else, so they should move down into the component rather than be
threaded through it:

| function | private state |
| --- | --- |
| `renderJobs` | commentInput, jobDetailTab, jobsViewMode, pickState, printDropdownOpen |
| `renderOpenFreightModal` | ofAccountDirty, ofModalOpen, ofParcelForm, ofParcelModal, ofTab |
| `renderImport` | importFiles, importLoading, importPreviews, importResults |
| `renderModal` | openDecIdx, skuDropdown, supplierDropdown |
| `renderCardFiles` | cardFileForm, cardFileGroup, cardFileSearch |
| `renderOrderRequirements` | orderReqPoModal, orderReqSelected, orderReqTab |
| `renderAIAssistant` | aiOpen, aiPos |
| `renderWarehouse` | selectedBin, selectedWarehouseZone |
| `renderCustomers` | custDetailTab, selectedCustomer |
| `renderSuppliers` | suppTab |

`renderImport` was the clearest case and is now done: 287 lines whose entire
prop surface was four `import*` state pairs plus the query client. The state
moved down with it, the client comes from context, and
`src/modules/import/ImportModule.jsx` takes **no props at all** — which is what
makes it mountable in a test with no scaffolding. The same reading was applied to the next
two, with different outcomes. `renderCardFiles` gave up its 131-line create/edit
dialog to `src/modules/card-files/CardFileFormModal.jsx`; what is left there is
the detail panel, whose state really is shared with the monolith.
`renderOpenFreightModal` was **not** extracted — it turned out to be
unreachable, which is F6.

**Remaining, by prop surface:**

| function | lines | props |
| --- | --- | --- |
| `renderWarehouse` | 251 | 8 |
| `renderPOListPage` | 35 | 9 |
| `renderStockListPage` | 41 | 9 |
| `renderImport` | 287 | 9 |
| `renderJobListPage` | 48 | 13 |
| `renderPurchaseOrders` | 126 | 13 |
| `renderSuppliers` | 183 | 13 |
| `renderCustomers` | 245 | 14 |
| `renderOpenFreightModal` | 453 | 14 |
| `renderCardFiles` | 285 | 15 |
| `renderOrderRequirements` | 307 | 15 |
| `renderAIAssistant` | 230 | 19 |
| `renderJobs` | 998 | 48 |
| `renderModal` | 1,757 | 71 |

**`renderModal`'s 71 is an artefact of the union.** It is one modal shell around
five mutually exclusive `modalType` branches, and measured separately four of
the five are clean. *(The four clean ones are now extracted to
`src/components/forms/`; the shell and the job branch remain.)*

| branch | lines | props |
| --- | --- | --- |
| `customer` | 154 | 4 |
| `supplier` | 53 | 5 |
| `po` | 152 | 10 |
| `inventory` | 236 | 11 |
| `job` | 1,126 | 48 |

So splitting the shell yields four form modals totalling 595 lines at 11 props
or fewer, and isolates the job editor as the one piece that genuinely needs
decomposing before it can move. `renderJobs` at 48 props is the same shape of
problem and should be read the same way before anyone tries to lift it whole.

### F3. Two things the extraction audit turned up

**`DispatchModal` is unreachable.** `dispatchModal` is declared in
`TotalImageERP.jsx` and passed to the component, but nothing anywhere sets
`open: true`, so it never renders. That was already true while it was
`renderDispatchModal` inside the monolith — the extraction did not cause it, but
it did give dead code its own file alongside ten live ones, which is worse than
leaving it buried. Dispatch really runs through `dispatchBatch` →
`api.dispatchSessions.create`, with the UI in `src/modules/jobs/DispatchList.jsx`;
the dead modal still calls the older single-job `api.jobs.dispatch`. The file
carries a header saying so. Delete it and its state, or wire it and retire the
batch path — keeping both is what gets the wrong one edited.

**The prop shape is the halfway house, not the destination.** Nine of the eleven
take a state object plus its setter (`stocktakeModal` / `setStocktakeModal`), so
every keystroke inside an extracted modal still writes to state that lives in
the monolith. Worth being precise about what that does and does not mean: it is
*not* a regression, because before the extraction the same state lived in the
same place and the same setters ran, so the re-render cost is unchanged. What it
means is that the extraction bought explicit dependencies and a testable unit,
and has not yet bought isolation. The end shape is `<StocktakeModal open
inventory onClose={...} />` — the monolith owning `open` and the seed data
because that is what the menu item that opens it needs, and the modal owning its
own form fields.

**Correction to F2's count.** The "30 state variables can move down" measurement
was taken *after* the eleven were extracted, so their state no longer sat inside
a render function and was not counted. `confirmModal`, `paymentModal`,
`stockAdjustModal`, `unprintModal`, `salesRegModal`, `transferModal`,
`stocktakeModal`, `stockFlowModal`, `invoiceJob` and `documentPrint` are all
additional cases of exactly the same thing. The real figure is nearer forty, and
the eleven already extracted are the cheapest ones to finish.

### F4. A new palette cannot reach the app through tokens.js alone

The sign-in screen now runs a different design direction — "press room": CMYK
process colours, newsprint stock, trim marks, Archivo. It is scoped entirely
under `.press` in `src/LoginScreen.css` and changes nothing behind it.

Taking that direction app-wide was asked for and is not yet done, because
`tokens.js` is not actually the single source of truth its docstring claims:

| | count | follows `tokens.js`? |
| --- | --- | --- |
| `T.*` token references | 2,952 | yes |
| hardcoded Tailwind colour utilities (`bg-blue-600`, `text-zinc-500`, …) | 2,151 | **no** |

Changing the tokens moves **58%** of the app. The other 42% keeps the
steel-blue palette, and the result is not a new direction — it is two palettes
at once, which is worse than either. So the token swap is not the first step;
it is the second.

The first step is converting those 2,151 utilities to tokens, and it cannot be
a regex sweep. That has already gone wrong here once: a sweep rewrote eleven
traffic-light lines where amber meant *warning* rather than brand, and missed
`index.css` completely because it only covered `.jsx`/`.js`. The conversion has
to read each one and decide whether it is semantic (a status, a warning, an
error) or decorative, because only the decorative ones map onto a brand token.

Note also that `index.css` hardcodes the old accent in the app-wide focus rule
(`#2b7bd4`, plus `#9dc7ee` for the ring). That leaked into the new screen —
keyboard focus painted the old steel-blue onto a field in the new palette until
it was overridden explicitly. Any surface in a new direction will hit the same
thing until those two values come from tokens.

Suggested order: convert the utilities (mechanically listed, decided by hand,
in reviewable batches) → move `index.css`'s focus colours onto tokens → then
change `tokens.js`, at which point the swap actually lands everywhere at once.

### F5. Two gaps the form extraction exposed

**Nothing catches a dropped prop.** `no-undef` catches an identifier that was
never imported, which is what made the component extraction checkable. It does
not catch a prop that a call site stops passing: the component still parses,
the value is simply `undefined`, and the failure is silent and visual.
`SupplierForm` is the clearest case — it locks the supplier code once the record
exists, and that lock rides entirely on `editingItem` arriving. Drop it at the
call site and the code becomes editable on an existing supplier with no error
anywhere. The component test pins the rule; nothing pins the wiring. This is
the concrete argument for the TypeScript phase, more than type safety in the
abstract.

**35 labels, none associated — done.** All four extracted forms carried bare
`<label>` elements with no `htmlFor`, inherited from the monolith: clicking a
label focused nothing and a screen reader announced the inputs unlabelled. All
35 now carry an id and a matching `htmlFor`.

The ids were generated mechanically, which is safe for *presence* and not for
*correctness* — a label wired to the wrong field is still associated. So
`__tests__/labelAssociation.test.jsx` asserts the association by value: each
field is looked up by its visible label and checked to be holding that field's
data, 33 assertions across the four forms. Crossing two `htmlFor` values fails
exactly those two tests, which is how it was checked.

### F6. Open Freight is built, fetched, and unreachable

`renderOpenFreightModal` is 453 lines in `TotalImageERP.jsx` and nothing can
open it. `setOfModalOpen(true)` appears nowhere in `src`: the flag is declared
`useState(false)`, and its only other uses are the early return and the two
close handlers inside the modal itself.

This is not a small orphan. Behind it sits a complete feature:

- `api.openFreight` exposes six endpoints — `getAccount`, `saveAccount`,
  `listParcels`, `createParcel`, `updateParcel`, `deleteParcel` — against
  `/open-freight/*` on the backend.
- The app **fetches on every load**: a `useQuery(['ofParcels'])` at
  `TotalImageERP.jsx:833`, and a `useEffect` calling `openFreight.getAccount()`
  at 1158. Every consumer of that data is inside the modal that cannot open.
- The parcels query carries an `onError` that sets `apiError` and raises a
  toast. So if `/open-freight/parcels` fails, every user sees an error on load
  for a feature none of them can reach.

The shape of it says the entry point was lost rather than never written — a
toolbar button or menu item that stopped being rendered at some point. Given a
working API and a finished UI, wiring it back is probably a smaller change than
removing it, but that is a product call: either put the button back, or delete
the modal, the two fetches and the `of*` state with it.

It was deliberately **not** extracted during the monolith work. Carving 453
lines of unreachable code into its own module would promote dead code to a
first-class surface, which is the mistake already recorded for `DispatchModal`
in F3 at a twelfth of the size.

**The bleeding is stopped, the decision is not made.** Both fetches are now
gated on `ofModalOpen` — the query takes `enabled`, the effect returns early —
so a fresh authenticated load makes 22 API requests and none of them go to
`/open-freight`. Nothing is deleted, so wiring the entry point back up still
works unchanged.

**Update — the product question is answered: wire it back.** A photograph of a
live Jim2 job (1186437, reviewed 2026-09-02) carries this comment against the
job:

> Status set by bulk OpenFreight Script

So OpenFreight is not a half-finished idea somebody abandoned. It is load
bearing in the business today, to the point of setting job statuses in bulk on
the system this one replaces. The 453 lines here are an unfinished port of a
daily workflow, not dead weight.

That reverses the recommendation this entry would otherwise have earned. On the
evidence available when it was written — an unreachable modal, no entry point,
fetches firing on every load for a feature nobody could open — deletion was the
defensible call. It would have been the wrong one, and it is worth recording
why: the codebase cannot tell you which of its unreachable features someone
depends on somewhere else.

What is still unknown, and matters before the port: the Jim2 script sets status
in *bulk* across many jobs, and `api.openFreight` here exposes only per-parcel
CRUD. Whatever the bulk path is on their side needs finding before the entry
point goes back.

### Running the frontend against real data locally

The redesign was verified by measuring the running application rather than
reading the code, which is only possible with a backend and a login. The pieces
are already in the repository; this is how they fit together.

```bash
# backend, on the SQLite dev database rather than PostgreSQL. The env var wins
# over backend/.env, so nothing points at the real database.
cd backend
DATABASE_URL="sqlite:///./dev_local.db" ENVIRONMENT=development   python -m uvicorn app.main:app --port 8000 --host 127.0.0.1

# a login, once. 2FA off, so it can be driven headlessly.
DATABASE_URL="sqlite:///./dev_local.db" ENVIRONMENT=development   ADMIN_USERNAME=designqa ADMIN_PASSWORD='<choose one>'   ADMIN_EMAIL='designqa@local.invalid' python seed_admin.py

cd ../frontend && npm run dev      # proxies /api to localhost:8000
```

`dev_local.db` predates Alembic — it was built with `create_all` and has no
`alembic_version` table, so `upgrade head` will try to run every migration from
scratch and fail. When a model gains a column, add it to that file directly;
two were missing when this was set up, `goods_receipts.branch` and
`jobs.version`.

What this makes possible, and what nothing else does: measuring contrast
against the background each piece of text actually lands on. Note that
`getComputedStyle(el).backgroundColor` reads `transparent` for an element
painted with a gradient, so a naive walker skips it and compares against the
body — that mis-reported the module bar as 2.02:1 when it is 7.8:1. Walk
`backgroundImage` too.

### F7. The job PDF endpoint has no callers left

`GET /jobs/{job_id}/pdf` is now unreachable from the app. Nothing in
`frontend/src` requests it — the last two call sites, the invoice download in
the print dropdown and "Download Invoice (PDF)" in the job toolbar, were
rewired to the template preview when invoices became templates.

That was the point. The endpoint built its own layout in ReportLab, so the same
menu offered two invoices that did not have to agree, which is the bug already
fixed once for the job sheet. What it leaves behind is roughly 730 lines of
`backend/app/routers/pdf.py` — `_build_pdf`, `_build_picking_slip` and
`_build_job_sheet` — reachable only by typing the URL.

Not deleted, for two reasons. It is a public route on a deployed API and may be
bookmarked or scripted against outside this repo, which is not something the
codebase can tell me. And the four documents it draws are exactly the ones the
template renderer now owns, so removing it is a statement that templates are
the only way these print — true today, and worth saying deliberately rather
than as a side effect of a UI change.

**What is still live in that file:** `GET /customers/{id}/statement.pdf`, used
by `CustomersDetail.jsx:202`. The customer statement was never converted to a
template and has no second version to disagree with, so it stays on ReportLab
either way. Deleting the job builders does not touch it.

The decision is delete-or-keep, and it is small either way. Keeping it costs
730 lines that no test exercises through the UI; deleting it removes an API
route that something outside this repo might be using.

## ORD1-ORD12. Findings from the Arcare multi-site order simulation

Run on 2026-09-02 against a local SQLite instance, not production. One customer
purchase order — Arcare, 100 staff personal packs (2 polos + 1 jacket each,
embroidered logo and the employee's first name) — delivered to all 68 Arcare
residences. Site list taken from arcare.com.au/residence-sitemap.xml; street
addresses were synthetic. The whole order was driven through quote → order →
procurement → production → invoice → despatch.

Ordered by what they would cost the business, not by how hard they are to fix.

### Checked against the reference product

A photograph of a live Jim2 job — sales job 1186437, Merrylands RSL Club, status
FINISH, invoice 3059786 — was reviewed after this simulation was written. It
confirms four of the findings from the product this ERP is modelled on, and
corrects one.

**The Order / Supply / B.Ord loop, complete.** The garment line reads
`Status Received · PO# 2045613 · PO Due 04/03/2026 · Order 10 · Supply 10 ·
B.Ord 0`. That is the whole cycle: a custom indent could not be supplied from
stock, so B.Ord carried the shortfall, a purchase order was raised against that
line, the goods arrived, and receipt filled Supply and cleared B.Ord to zero.

`goods_receipt.py:373` implements the last step of that and nothing implements
the first. ORD4 and ORD5 are therefore a missing half of a loop the reference
completes, not a difference of opinion about how ordering should work.

**Balance due is a first-class job field.** The footer reads `Invoice Paid $0.00`
/ `Balance Due $1,243.00` next to SubTotal and Tax. In Jim2 that number always
exists. In ours it exists only when a person has had the job open in a browser,
which is ORD2.

**Two mechanisms ORD1 asks for already exist there.** `Create Similar` sits in
the button row, and `Linked Jobs/Quotes` is one of the job's tabs. So the
reference has both the duplicate action and the parent/child relation whose
absence makes a 68-site order into 68 unrelated jobs here.

**And one correction.** ORD9 claimed size and colour should be structured
fields. Jim2 writes the size curve into the line description as prose — see the
revised ORD9 below.

Two things the photograph shows that are worth copying regardless of the above:
the footer warns `Order Weight: 15kg (2 items has 0 weight)`, naming the lines
with no weight because freight is billed on that number, and it carries a
`Qty Count` alongside the money totals. Our consignment note totals what it has
and says nothing about what is missing.

### ORD1. One order cannot reach more than one address (HIGH, structural)

`Job.ship_to_id` is on the job. `JobItem` has no destination field of any kind,
and `/jobs/{id}/dispatch` records a single despatch event per job — it sets
`dispatched_at` only `if not job.dispatched_at` and carries no address.

So a purchase order going to 68 sites is 68 jobs. There is no split, duplicate,
copy or bulk-create endpoint, so in the UI that is 68 hand-built jobs. It
produced 68 invoice numbers against the customer's single PO ARC-PO-88421, and
a shortage of one garment came back from Order Requirements as "35 units across
22 jobs" for the buyer to reconcile by hand.

It also duplicates production: one embroidery run of 300 garments is
represented as 68 jobs, so every picking slip is one to three garments.

`project_no` and `cust_ref` can tie the 68 together, and a DispatchSession
despatched all 68 in one batch in well under a second — so the model can
express the grouping. What is missing is a line-level destination, or a "split
by ship-to" action that fans one order out and keeps the parent.

### ORD2. Invoicing through the API leaves accounts receivable at zero (HIGH)

`_recalculate_customer_balance` sums `Job.balance_due` over INVOICE/PAID/FINISH
jobs. Nothing on the server ever derives `balance_due` from the invoice total —
the only place it is computed is the job form in the browser, at
`TotalImageERP.jsx:861`, as `total - invoicePaid`.

68 jobs were invoiced for $15,400 inc GST. `customer.balance` stayed at $0.00
and `ytd_sales` at $0.00.

Everything downstream reads that field: the credit-limit check at
`jobs.py:253`, the customer statement, the sales register, the customer detail
panel, and every accounts-receivable answer the AI assistant gives. A job
invoiced by anything other than a person clicking through the job form is
invisible to all of them — an import, an EDI feed, a customer portal, or a
script. Deriving `balance_due` server-side on the INVOICE transition closes it.

### ORD3. On-hand stock is allowed to go negative, silently (HIGH)

`AS5026-BLK-L` had 65 units. The 68 jobs needed 100. All 68 were invoiced
without a block, a warning, or a confirmation, and the SKU finished at **−35 on
hand**.

The ledger itself is honest: 100 movement rows, every one carrying
`location_branch`, split correctly into Released and Sale. Nothing was
corrupted. The system faithfully recorded shipping stock that did not exist,
which is the point — a negative on-hand figure means either the goods never
shipped or the count is wrong, and nobody is told either way.

### ORD4. The procurement worklist only shows what someone typed into it (HIGH)

`GET /jobs/order-requirements?type=garment` filters on `JobItem.b_ord > 0`.
Nothing computes `b_ord`. Across the backend it is only ever *decremented* — by
goods receipt at `goods_receipt.py:373` — or read. The only writer is an
operator typing into the B/Ord column, which `api.js` sends as `b_ord`.

With 100 units committed against 65 in stock, the shortage was real, derivable,
and visible in the stock figures. Order Requirements returned **zero rows**.
Hand-entering `b_ord: 35` made the correct row appear immediately, with the
right supplier and cost — so the screen works; it is just fed by hand.

A buyer working that screen is not seeing what the business is short of. They
are seeing what colleagues remembered to flag.

### ORD5. Orders reserve no stock until someone fills the Supply column (HIGH)

Commitment keys off `JobItem.supply_qty > 0` (`inventory.py:911`,
`reservations.py`). `supply_qty` defaults to 0 in `JobCreate` and is only
auto-filled by goods receipt.

68 orders for 100 + 100 + 100 units were created and `committed_qty` did not
move. Available stock still read 65 for a SKU that was fully spoken for. Two
salespeople could each promise the same 65 garments. Setting
`supply_qty = order_qty` made commitment correct at once, and the shortage
appeared as −35 available.

ORD4 and ORD5 are the same shape as ORD2: a number the system can derive, left to a
human to type, with everything downstream trusting it.

### ORD6. The jobs list cannot show which site a job is for (MEDIUM)

`JobsList.jsx` defines eight columns — Job#, Customer, Status, Dec, Priority,
Acc Mgr, Total, Due. None is the ship-to. All 68 Arcare jobs render as visually
identical rows: same customer, same status, same decoration, same date, and
only two distinct totals.

The odd part is that the data is already there for filtering:
`jobsFilters.js:163` filters by ship code, `:147` searches it, and `:132` builds
the dropdown of codes. So the ship code drives the filter bar and is never
shown in the grid. On a 68-site order the operator can narrow to one site at a
time but cannot see the shape of the whole order.

Adding the column is a one-line change to the column array.

### ORD7. Three-letter ship codes do not survive a customer this size (MEDIUM — LARGELY DISSOLVED, see JIM16)

**Mostly withdrawn.** Real ship codes are numeric site IDs — `RICO.2201`,
`RICO.2202`, `RICO.2202P`, `RICO.2203` — not abbreviations of place names, so
the six collisions below were an artefact of a scheme this analysis invented.
What survives is only: adopt the numbering the business already uses.


Under the `AR.` + first-three-letters convention, Arcare's 68 residences
produce **6 collisions covering 13 sites**: AR.HEL (Helensvale, Helensvale St
James), AR.KNO (Knox, Knox The Lodge), AR.NOR (North Shore, North Lakes),
AR.POI (Point Lonsdale, Point Cook), AR.WAR (Warriewood, Warners Bay), and
AR.PAR three ways (Parkwood, Parkview, Parkinson).

The ERP behaves correctly — `POST /customers/{id}/ship-tos` returns 409
"Ship-to code 'AR.PAR' already exists for this customer" — so nothing corrupt
gets in. The gap is that codes then get invented ad hoc at the point of
rejection. Auto-lengthening produced AR.BEL beside AR.PARKI, which is no longer
a scannable convention.

A process decision rather than a defect: pick a fixed-width scheme
(AR.PKW / AR.PKV / AR.PKN) and write it down, because the collisions are
between sites in different states whose garments must not be swapped.

### ORD8. PATCH accepts field names it does not recognise and reports success (MEDIUM)

`PATCH /jobs/{id}` with items carrying `supply` instead of `supply_qty`
returned 200 for 69 consecutive jobs and changed nothing. Pydantic ignores
extra keys by default, so a misspelt field is indistinguishable from a
successful write.

This cost time inside the simulation itself: the commitment figures looked like
a stock bug for several minutes before the cause turned out to be a silently
discarded field name. Any integration written against this API can make the
same mistake and be told it worked. `model_config = ConfigDict(extra="forbid")`
on the item schema turns it into a 422.

### ORD9. Size and colour live only inside the SKU string (LOW — revised, largely withdrawn)

**Revised against the reference product. The original finding was wrong on the
important half.**

The original claim was that the size and colour breakdown belongs in
`InventoryItem.style_id` / `colour_code` / `size_code` rather than being parsed
out of a code, and that leaving those null was an oversight.

Jim2 does not do that. On job 1186437 the garment line is stock code
`FB.INDENT` — a generic indent code carrying no size, no colour and no style —
with the whole breakdown written into the description as free text:

```
Fashion Biz Special Custom Made Garment - Womens Harper 3/4 Sleeve Shirt - Ink/Silver
6 x size 30
4 x size 32
```

So the size curve living in prose is the reference behaviour, deliberately, and
for a good reason: a custom indent has no SKU to hang sizes off. Any rule that
demanded structured size fields on every line would have nowhere to put that
order.

What survives of the finding is much narrower, and only applies to *stocked*
items: where a SKU does encode style/colour/size (`AS5026-BLK-L`), the three
columns that exist to hold that are null, so a stocked-item size or colour
report still has to split a string. That is worth fixing for stocked lines and
must not be extended into a requirement for indent lines.

### ORD10. Per-garment personalisation has nowhere structured to live (LOW — ANSWERED, see JIM13)

**Superseded.** The September photographs answer this: personalisation is one
job per person, with the employee name and staff number in `Cust Ref#`. The
question below assumed the unit was the garment; it is the job. Left in place
because the reasoning explains what was looked for and why it was not found.


The order was 100 *personal* packs: each garment carries the employee's first
name under the logo. `JobItem` has `description`, `sizes`, `dec_code`,
`emb_code` and `dec_position` — all per line, none per unit.

The 100 names went in as a free-text note on the job. Nothing can produce a
per-garment name list for the embroidery machine, check that 100 names were
supplied for 100 garments, or reprint one person's polo without re-reading a
comment. Named personalisation is ordinary in uniform work and is currently
outside the data model.

### ORD11. Decoration is an attribute here and a line item in Jim2 (MEDIUM)

On job 1186437 the embroidery is its own row:

```
EMB.5244   Merrylands RSL Logo in Blue/Gold/Black (Shirts Only ~ Left Chest)
           Order 10   Supply 10   B.Ord 0   Price 0.00   Hide ✓
```

A separate stock code that *is* the embroidery design number, quantity tracked
alongside the garment, priced at zero because the cost is carried in the
garment price, and hidden from the printed invoice.

We model decoration as attributes hanging off the garment line —
`decoration_type`, `emb_code`, `dec_code`, `dec_position`, `stitch_count`. That
works for printing a job sheet and is why the decoration requirements report
groups by `decoration_type:dec_code`. What it cannot do is give a logo an
identity of its own: EMB.5244 is a thing that exists across jobs, has a stitch
count, has a setup cost, can be re-run, and can be reported on. As a field on a
line it exists once per line and nowhere else.

Consequences worth weighing before changing anything, because this is a real
schema decision and not a defect:

- The freight line on the same job (`FREIGHT`, "Freight Charges Con #
  CPCXF0C1006242") shows the same pattern — a non-garment cost as a line with a
  code, not a field. Our despatch stores the consignment reference on the
  DispatchSession line instead.
- ORD10 probably resolves into this. Per-garment names may want to be a
  decoration line with a quantity and an attached name list, rather than a new
  per-unit field on JobItem.
- The `Hide` flag already exists on JobItem and the template renderer already
  honours it, so a zero-priced hidden line would print correctly today.

### ORD12. Jim2 carries three card references on a job; we carry two (LOW)

The header of 1186437 has `Cust#`, `From#` and `Ship#` as three separate
fields, all reading MERRY.RSL here only because a single-site club is all three
at once.

We have `customer_id` and `ship_to_id`. There is no equivalent of From#. For a
customer like Arcare — head office raising the order, 68 sites receiving it,
one entity invoiced — the three genuinely differ, and the missing one is the
"who asked for this" card that a query about the order should go back to.

Low priority because `cust_ref` and `name_contact` cover most of what From# is
used for day to day. Recorded so that the shape is known before anyone designs
the multi-destination work in ORD1.

### What worked

Recorded so the list above is not read as a verdict on the whole system.

- Ship-to codes are enforced unique per customer, with a clear 409.
- `INVOICE` is refused until an invoice number is set.
- The stock ledger stayed correct under 100 movements — every row carried
  `location_branch`, and Released/Sale were separated properly.
- `_apply_status_transition` handled all 68 jobs with no drift; committed and
  depleted move on boundaries, so reverse transitions stay right.
- One DispatchSession absorbed 68 consignments instantly.
- All 68 jobs carried both ship-to code and shipping address, so the
  consignment notes and labels built earlier render correctly per site.
- Creating 68 jobs took 1.0s and 68 ship-tos 0.8s over HTTP. Nothing here is a
  performance problem.

## JIM1-JIM12. What 31 photographs of the live Jim2 system show

Surveyed 2026-09-02 from `OneDrive/ERP` — 31 screen photographs taken between
April and June 2026 covering jobs, the job-list builder, stock, a purchase
order, both report menus, and every ribbon tab. Findings are ordered by how much
they change what we build, not by size.

Several confirm earlier guesses; three overturn them. Where a photograph
contradicts something written here previously, the photograph wins.

### JIM1. The business is multi-site by default, not by exception (HIGH)

The recently-opened list alone holds Dan Murphy's (three jobs, "Vendor No.
96026…"), Respect Group (four), Pickles Auctions **Adelaide** and Pickles
Auctions **Bibra Lake** as separate cards, Corinthian Industries **WA**, and a
saved list "Zone Bowling" holding **13 jobs**. Add Arcare's 68 residences and
Anytime Fitness's franchises.

ORD1 was written as though a 68-site order were an unusual event to be designed
for. It is the ordinary shape of the work. That raises its priority and changes
its framing: this is not "support an edge case", it is "support the main case".

**How Jim2 survives it, exactly:** one job per destination — the same thing our
simulation was forced into — made workable by two tools we lack, `Create
Similar` on every job, and a saved List that is a live query. Job 1200193 is
TEEG with `Cust# ZON.BOWL.C` but `Ship# TZ.CRONL.N`, sitting inside the "Zone
Bowling" list beside its twelve siblings.

**So the fix is not a new data model.** It is Create Similar, plus a list.

### JIM2. A job line is an assembly of three lines, not one line (HIGH)

The clearest example, from job 1200193:

```
1  ZON.1062.CHB.3XL                       TIMEZONE Mens Superdry Polo - Charcoal/Black - 3XL  2 2 0  33.00  36.30 G     72.60
2  EMB.TIMEZONE.LHC                       TIMEZONE logo - yellow - left chest (2.0K)          2 2 0   4.71   5.18 G ✓   10.36
3  Received 2049993 PI.1062.CHB.TZON.3XL  Mens Superdry Polo - Charcoal/Black - 3XL           2 2 0  28.29  31.12 G ✓   62.24
```

- `ZON.` — the **sell** line, the customer's own code, at full price, visible
- `EMB.` — the **decoration**, priced per use, hidden, "(2.0K)" = stitch count
- `PI.` — the **bought garment**, at cost, hidden, carrying the PO# and its
  Received status

Margin is therefore visible on the job itself as sell minus components, which is
what the open "COG on job lines" question was really asking about.

`EMB.TIMEZONE.LHC` repeats across every garment on the job: **a logo is a stock
item with an identity, reused and priced per application.** This is ORD11
confirmed with prices attached — the earlier Merrylands photograph showed the
decoration line at $0.00, which made it look like a note. It is not; it is a
priced component that was zero on that job.

There is a second form as well. Recently-opened stock includes
`AF.PS60.16 TRS.AF.LHC, TRS.ANYTIMEH.B…` — garment plus both transfers as a
single **kit** SKU, and Jim2 carries `Stock List Kits` and `Action Kits Stock
list` reports. So repeat customers get a kitted code; ad-hoc work gets component
lines.

### JIM3. Purchase order lines carry the job they are for (HIGH)

PO 2048001 (Workwear Group) has eight lines spanning **six different jobs** —
1194959, 1194956, 1194961, 1194951, 1192494, 1194960 — each line naming its
`Job#`, and comment 6 reads:

> `07/04/2026 KS Booked — "Auto created from Job 1192799 for Workwear Group"`

**Purchase orders are auto-created from jobs, and consolidate across them.**
That is precisely the "35 units across 22 jobs" problem the Arcare simulation
surfaced (ORD4), and the mechanism is a `job_id` on the purchase-order line.

Ours has no such column. `PurchaseOrderItem` is `order_id · sku · description ·
qty_ordered · qty_received · unit_cost · total` — no job link, and no
`vendor_stock_code` or `list_price_ex` either, both of which Jim2 carries
(`K43012` beside our `RS.K43012CU.NAV.12`; RRP 89.09 beside our buy 49.99).

### JIM4. A stock code is garment + colour + size, and there is a parent above it (HIGH)

The stock list filtered on `MR.RB967LS.SIL` returns **twelve rows, one per
size** — `.4 .6 .8 .10 .12 .14 .16 .18 .20 .22 .24 .26`, all "Ladies Kayla
Blouse - Silver - <size>".

That answers the long-open SKU question outright: **one SKU per size.** And the
grid carries a **`Parent Stock`** column — the style above the per-size codes,
which is what our null `style_id` was always for.

Stock-level columns we do not have: **`On PO`**, **`BackOrder`**, **`Packaged`**
as distinct quantity buckets alongside On Hand / Committed / Available.

### JIM5. Ten stock locations, with bins and a reorder calculation (MEDIUM)

`3PLP · AF · BULK · GS · HQ · MELB · QING · QUA · RET · SAMP` — third-party
logistics, Melbourne, **Qingdao**, quarantine, returns, samples — each with
Branch, Zone, **Primary Bin 1 + Max Qty**, **Primary Bin 2 + Max Qty**.

Per stock item, a Procurement block: *Min Qty per Location method · Daily Avg
Sold per day based on last N days · Add extra N% to calculated Qty · Re-order
Qty*. **Reorder quantity is computed from sales velocity.** We have `min_stock`
and `reorder_qty` as static numbers.

### JIM6. Stock transactions are linked in pairs (MEDIUM)

The Transactions tab carries `Tran# · Date · Type · Ref# · Loc. · Qty · Qty Bal ·
PO# · POLine# · Job# · **Link Tran** · Link GL · Pack# · Bin`. Purchase 79180661
links to Sale 79305720. Every movement names the PO line it came from, the job
it went to, its bin, and the transaction it is paired with.

Our ledger is honest and carries `location_branch` (the Arcare run proved it),
but it cannot answer "which purchase did this sale consume", which is what makes
true landed-cost and margin-by-unit possible.

### JIM7. Priority is an order category here, not an urgency (MEDIUM)

Values across the photographs: **`Normal`**, **`Branch`**, **`Employee`**. Not
Low/Normal/High/Urgent. "Employee" is a staff uniform order; "Branch" is a
venue order.

Ours is a three-level urgency and drives colour in the grid. Adopting Jim2's
meaning would change what the field is *for*, so this is a decision rather than
a defect — but the current filter offers a vocabulary the business does not use.

### JIM8. Jobs are created from email, and the system writes its own comments (MEDIUM)

Every job title bar reads `Viewing Sales Job 1199536 ( **Source: Email #970981** )`.
Orders arrive as email, become jobs, and the email thread stays attached — the
Jobs ribbon carries Reply / Reply All / Forward next to Print.

The comment trail is written by `SYS` as well as by people:
`Ordered On Account - Proceed with order` (Inc ✓) · `Confirmed` · `Booked` ·
`Status set by bulk OpenFreight Script`. Comments carry Date · Initials ·
**Status at the time** · **Inc** (include on the printed document) · text.

We have a JobComment with status and is_internal, so the shape is right. What is
missing is the email as the origin of a job.

### JIM9. Statuses are configurable, and theirs are different from ours (MEDIUM)

Seen: `Backorder · Confirmed · Booked · Desp/Ready · Pick/Pack · FINISH`, with
POs running `Booked → Ordered → Received → FINISH`, and a separate `Mode:
ACTIVE` field on both jobs and POs. Tools → **`Status`** is a configuration
screen, so this vocabulary is theirs, not the product's.

The Job List builder groups statuses into buckets — **Active / Finish / Ready /
Inv'd** — and classifies jobs as **Sale / Service / Manufacturing**.

Ours: QUOTE · ORDER · PROOF · PRINT · Pick/Pack · FINISH · INVOICE · PAID ·
CANCEL, one job kind, no buckets, no Mode.

### JIM10. Ours is a production system; theirs is also an accounting system (MEDIUM)

The Accounts ribbon: Debtors · Creditors · Advanced Creditors · **General
Ledger** · Account Inquiry · Transaction Journal · General Journals · **GST
Sessions** · Multicurrency Revaluations · Cheque Book · Bank Deposits · **Bank
Rec.** · Till Rec. · **Bank Feeds** · Bulk Payments · **Electronic Payments**.
Management adds **Business Analysis · Budgets · Cash Flow · Commission
Sessions**.

This is worth stating plainly because it bounds the project: replacing Jim2
outright means replacing a general ledger, or integrating one. Nothing in the
current codebase approaches that, and the Arcare simulation's ORD2 (receivables
reading zero) is the first symptom of the gap.

### JIM11. Three capabilities we have not begun (LOW-MEDIUM)

- **Scheduling** is a resource calendar — Day/Work Week/Week/Month/Year/Time
  Line/Current+7, **grouped by Resources**, with saved views. That is production
  capacity planning against machines and people. We have a `SchedulingModule`
  that is not this.
- **Documents** is a DMS with **Checkout / Cancel Checkout**. For a decoration
  business that is artwork version control — the thing that stops two people
  embroidering from different logo files.
- **Tools** carries `Report Designer` (the direct analogue of the document
  template designer built here — that instinct was right), `Scripting Engine` and
  `Menu Scripts` (where "bulk OpenFreight Script" lives), `Watchouts`,
  `Integration Configuration`, `Import Data`, `Close Fin. Year`, and a
  configurable `Status` and `Groups`.

### JIM12. The document set, checked against our designer (LOW)

Jim2's job report menu: `TIG Job Sheet · TIG Picking Slip · TIG Delivery Note ·
Job Label · Ship Label - Total Image · TIG Delivery Note - NZ · TIG Sample Sales
Contract · TIG TAX Proforma Invoice · TIG TAX Proforma Invoice Balance ONLY`.

We have eight of the nine. Two gaps and one correction:
- **`Job Label` is a separate document from `Ship Label`.** Our toolbar points
  both at `shipLabel`.
- **`TIG Sample Sales Contract`** does not exist in our designer at all.
- **Jim2 has no consignment note.** The connote comes from the carrier and lands
  on the job as freight-line text (`Freight Charges Con # CPCXF0C1006242`). Ours
  is invented — not wrong, but it is ours, not a Jim2 parity item.

Also on every job footer: `Order Weight: 15kg **(2 items has 0 weight)**` and a
`Qty Count`. The warning names the lines missing a weight, which matters because
freight is billed on it. Ours totals silently.

### And the thing that is not in the ERP at all

Behind the Jim2 window in one photograph sits an open Excel file: **"New Polo
EBA Employee Sizes Listing"**, with tabs **QLD · NSW · WA**.

That is ORD10 in its real form. Employee-level size and name lists arrive as
spreadsheets, per state, under an enterprise agreement, and are keyed to
individual people. Nothing in Jim2 holds them either — which is why the answer
to per-garment personalisation is a genuine product decision rather than a
parity item, and possibly the clearest place this system could beat the one it
replaces.

## JIM13-JIM20. The September photographs — how personalised orders actually run

Eight more photographs from `OneDrive/ERP/New`, taken 2026-09-03, following one
customer (Ricoh Australia) from online order through picking to the purchase
order that pays for the embroidery. They answer ORD10 outright and correct ORD7.

### JIM13. Personalisation is one job per person, not a field on a line (HIGH — answers ORD10)

Job List filtered on `Order# 2056727` returns **ten Ricoh jobs, one per
employee**:

```
Job#     Cust Ref#              Item#        Item Desc                    Serial#   Name
1218774  GILBERT BOCAUT…        NOP.ONLINE   gbocauto@ricoh.com.au        4514649   SYS
1219015  GREG WHITED            NOP.ONLINE   gregwhited@ricoh.com.au      4514839   SYS
1219117  KENT WITTKE-22…        NOP.ONLINE   kwittke@ricoh.com.au         4514921   SYS
1219209  STEVE PARASKEV…        NOP.ONLINE   sparas@ricoh.com.au          4515000   SYS
1219224  MORGAN GATSIS          SALE         Ad-Hoc Sale                            DANIELL.GO
1219225  NATASHA WYNN           SALE         Ad-Hoc Sale                            DANIELL.GO
1219319  NINO BLANCO            NOP.ONLINE   nblanco@ricoh.com.au         4515086   SYS
1219410  VIRDIPSINH CHU…        NOP.ONLINE   vchudasama@ricoh.com.a       4515160   SYS
1219433  DAVID RICE - 22(       NOP.ONLINE   drice@ricoh.com.au           4515183   SYS
1219454  MARTIN CLUNE -         NOP.ONLINE   mclune@ricoh.com.au          4515196   SYS
```

The employee's **name and staff number go in `Cust Ref#`**, their **email in the
job description**, and the job is theirs alone.

ORD10 asked where a per-garment name should live and concluded the data model
had no room for it. The question was wrong. **The unit of personalisation is the
job, not the line.** Job 1218774 is Gilbert Bocauto's pullover, pants, shirt and
two polos — his whole pack, on his own job, embroidered `RICOH (Only) - in RED
for LH Chest on Shirt, Back right of pants`.

That also re-frames the Arcare simulation: 100 personal packs is not one job
with 100 names, it is **100 jobs** — which makes `Create Similar` and bulk status
handling (JIM1) not a convenience but the load-bearing mechanism.

### JIM14. A self-service ordering portal feeds a large share of the work (HIGH)

`Item#` splits every job into two intake channels:

- **`NOP.ONLINE`** — the employee ordered it themselves. Their email is the job
  description, `Serial#` is the portal's order number (4514649, 4514839, …), and
  `Name` is **`SYS`**: nobody keyed it.
- **`SALE`** — "Ad-Hoc Sale", keyed by a person (`Name: DANIELL.GO`).

Eight of those ten jobs arrived without a human touching them. Corinthian and
Zone Bowling jobs are `NOP.ONLINE` too. This is what Jim2's **eBusiness** ribbon
is for, and nothing in our system corresponds to it.

**This is the single largest omission the photographs have exposed.** We have
modelled the back office of a business whose front door is a portal.

### JIM15. The job list is grouped by Ship#, and that is the despatch screen (HIGH — reframes ORD6)

Job List filtered on `Cust Grp: Ricoh`, **grouped by `Ship#`**:

```
▾ Ship# : RICO.2201  (Count=3)   [100%] 1218996  MATTHEW DOWL…   [100%] 1219454  MARTIN CLUNE   [100%] 1219456  NINO MAGARARL
▾ Ship# : RICO.2202  (Count=3)   [100%] 1218790  QUAN PHAN       [100%] 1218800  SCOTT WILTON   [100%] 1218989  DAVID HOLLINS
▾ Ship# : RICO.2202P (Count=1)   [100%] 1219015  GREG WHITED
▾ Ship# : RICO.2203  (Count=2)   [100%] 1218980  STAN FOLCIK     [100%] 1218992  ARTHUR SIMOS
```

Three things here we do not have:

1. **Grouping by any column.** "Drag a column header here to group by that
   column" — ORD6 asked for a ship-to *column*; what the work actually needs is
   **grouping by ship-to**, which turns 15 jobs into 4 despatches.
2. **`Availability %`** with a progress bar per job — how much of that job can be
   filled from stock right now. That is the number a despatcher sorts on.
3. **A `Pick` checkbox per row plus `Auto Pick Stock`** — select many jobs and
   pick them in one action.

And the report dropdown reads **`Job List - TIG Delivery Note`**: documents print
**across a filtered list**, not one job at a time. Our designer prints per job.

### JIM16. Ship codes are numeric site IDs, which dissolves ORD7 (MEDIUM — corrects ORD7)

`RICO.2201 · RICO.2202 · RICO.2202P · RICO.2203`.

Not three-letter abbreviations of place names. **Numeric site codes**, with a
suffix where a site needs more than one destination (`2202P`).

ORD7 spent its length on the six collisions Arcare's 68 residences produce under
an `AR.` + first-three-letters scheme, and recommended inventing a fixed-width
abbreviation. That was solving a self-inflicted problem: **the business already
numbers its sites.** ORD7 should be reduced to "adopt the existing numeric
convention".

### JIM17. Embroidery is bought on a purchase order, per job (HIGH)

PO 2056727 to `MY.APPAR` (Fly Apparel Aust Pty Ltd TA Procent Apparel), FINISH:

```
Location  Job#     Stock Code   Description                                              Ordered Received Cost(COG) Price Ex Total
HQ        1219433  EMB.RIC.R    RICOH (Only) - in RED for LH Chest on Shirt, Back…       2       2        5.0000    5.00     11.00
HQ        1219454  EMB.RIC.R    …                                                        1       1        2.5000    2.50      2.75
HQ        1219209  EMB.RIC.R    …                                                        3       3        2.5000    2.50      8.25
HQ        1219410  EMB.RIC.R    …                                                        3       3        2.5000    2.50      8.25
…13 lines across ~8 Ricoh jobs…                          Qty Count: 116   Total $196.90
```

**The decoration is subcontracted and purchased**, at $2.50 a unit, consolidated
across every job that needs it — 116 applications on one PO. The same job#-on-
PO-line mechanism as JIM3, applied to a service rather than a garment.

They do both: comment 5 on job 1218774 reads **"Line 1 given to Lina for EMB"**,
so some decoration is in-house and some is bought. Either way `EMB.RIC.R` is a
stock item with a cost and a sell price, which is JIM2 confirmed from the buy
side.

The PO comment is also the standing instruction to suppliers, worth keeping:
> Can you please leave any out of stocks on back order and despatch what ever is
> available. Please also advise ETA's on any backorders/discontinued stock.

### JIM18. Line status is per line and includes Pulled and Applies (MEDIUM)

Job 1218774's lines each carry their own status: **`Pulled`**, **`FINISH`**,
**`Applies`**. Not just the `Received`/`Ordered` seen earlier.

- `Pulled` — taken from stock
- `Applies` — the line modifies another line rather than being goods

Which brings the next finding.

### JIM19. Alterations are line items (MEDIUM)

```
7  FINISH  2056333 07/09/2026 PI.1062.NSI.RIC.XL  Mens Super Dry Polo Shirt With Pocket - Navy/Silver - XL
8  Applies                    ALT.POCKET          ***ALTERATION TO ADD LEFT CHEST POCKET (Include Fee & Instructions if required)***
```

`ALT.POCKET` is a stock code for an alteration, sitting beneath the garment it
alters with status `Applies`. Alterations are a priced service line in the same
way decoration is. We have no concept of a line that modifies another line.

Note also that job 1218774's eleven lines draw on **five different purchase
orders** (2056566, 2056346, 2056338, 2056333, 2056727) — one job, five suppliers,
because each garment and the embroidery are sourced separately.

### JIM20. Status is moved in bulk, and production is tracked in comments (MEDIUM)

Job 1218774's comment trail:

```
03/09/2026  EM   FINISH      Status set by bulk OpenFreight Script
02/09/2026  NA   Pick/Pack   Bulk status update
01/09/2026  NA   Confirmed   Bulk status update
01/09/2026  NA   Pick/Pack   Bulk status update
24/08/2026  EM               Line 1 given to Lina for EMB          (Inc ✓)
21/08/2026  SYS  Confirmed
21/08/2026  SYS  Booked
```

Two working practices to support rather than replace:
- **Bulk status update** is routine, not exceptional. Ours moves one job at a
  time through `/jobs/{id}/status`.
- **Production hand-offs are recorded as comments naming the operator** — "Line 1
  given to Lina for EMB", flagged `Inc` so it prints. There is no work-in-
  progress table; the comment trail *is* the shop-floor record.

### And the bins

A photograph of the racking shows the real bin labels: **`B.3.H.1` · `B.3.G.2` ·
`B.3.F.1` · `B.3.E.1` · `B.3.D.3`** — aisle · bay · level · position, dotted.
Our seeded data uses `A-01-04`. The picking slip's bin column should carry the
dotted four-part form, because that is what is printed on the carton a picker is
looking for.

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

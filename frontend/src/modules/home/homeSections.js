/**
 * What Home shows.
 *
 * Two questions, kept apart. Which tiles a role gets, and in what order, is a
 * content choice: ROLE_TILES. Whether a tile is shown is not — it is shown
 * only when the person may call every route it reads (`needs`, looked up in
 * GET /users/me/access `allowed`). A role's name never decides what is
 * visible, so a gate moved on the server moves the tile with it.
 *
 * Adding a tile is one entry in TILES (plus its deep link, if it opens
 * something new) and its id in the roles that should see it.
 */
import { jobsInView, viewLabel } from '../jobs/jobMetrics';
import { countNeedingReorder } from '../stock/lowStock';
import { isLatePO } from '../purchase-orders/poFilters';
import { needsAttention } from '../users/userRules';
import { basQuarter } from '../accounting/accountingFormat';

export const SECTIONS = [
  // Exception queues: work that is late, due, or about to lapse.
  { id: 'todo', title: 'To-dos', empty: 'Nothing needs you right now.' },
  { id: 'insights', title: 'Insights' },
];

const COMPACT = new Intl.NumberFormat('en-AU', { notation: 'compact' });
const MONEY = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', notation: 'compact' });

/** A count in at most four characters: 7, 999, 1.2K, 12K, 123K, 1.2M. */
export const formatCount = (n) => COMPACT.format(n);

/** An amount in a few characters: $0, $999, $1.2K, $12K, $1.2M. */
export const formatMoney = (n) => MONEY.format(n);

const cents = (n) => Math.round(n * 100) / 100;
const counted = (n, one, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

/** The invoices on the aged receivables report that are past their terms. */
export const overdueInvoices = (report) =>
  (report?.rows ?? []).flatMap((r) => r.lines ?? []).filter((line) => line.days_overdue > 0).length;

/**
 * What the Ledger Health tab shows as wrong: each side of the agreement check
 * that is out (owed by customers, owed to suppliers), and each document listed
 * under its findings. Zero is the ledger in agreement with nothing to look at.
 */
export function ledgerIssues(health) {
  if (!health) return 0;
  const sides = [health.receivables, health.payables].filter((side) => side && side.difference !== 0).length;
  const documents = [
    'unposted_invoices', 'mismatched_jobs', 'paid_with_balance_owing', 'invoiced_without_date',
    'totals_disagree_with_lines', 'balances_disagree_with_invoices',
  ]
    .reduce((n, key) => n + (health[key]?.length ?? 0), 0);
  return sides + documents;
}

/**
 * A job tile counts one shared job view (jobMetrics.js) and opens the jobs
 * list on the quick filter for that view, so the count is the length of the
 * list it opens.
 */
const jobTile = (view, quick, section, footer, extra = {}) => ({
  id: view,
  title: viewLabel(view),
  section,
  needs: ['GET /jobs'],
  source: 'jobs',
  value: (jobs, ctx) => jobsInView(jobs, view, ctx).length,
  unit: (n) => (n === 1 ? 'job' : 'jobs'),
  footer,
  open: { quick },
  ...extra,
});

/*
 * The other tiles each read one source — a list the app has loaded, or a
 * report Home fetches only for a tile the person may see (HomeModule FETCHED)
 * — and open the screen that shows exactly what they count: `open` is where
 * (`module` plus that screen's own opening tab or filter, or `admin`), or a
 * function of the day when the place depends on it. `needs` includes what that
 * screen reads, so a tile never opens onto a refusal. `format` shows the value
 * (a count by default), and `detail` says what it is from the data when the
 * unit alone cannot.
 */
export const TILES = Object.fromEntries([
  jobTile('overdue', 'overdue', 'todo', 'past due date', { tone: 'danger' }),
  jobTile('dueToday', 'dueToday', 'todo', 'to deliver today'),
  jobTile('quoteExpiring', 'quoteExpiring', 'todo', 'lapse within 7 days', {
    unit: (n) => (n === 1 ? 'quote' : 'quotes'),
  }),
  jobTile('notDespatched', 'notDespatched', 'todo', 'not yet despatched'),
  jobTile('mine', 'myJobs', 'insights', 'yours to deliver'),
  jobTile('thisWeek', 'thisWeek', 'insights', 'due within 7 days'),
  jobTile('pickPack', 'pickPack', 'insights', 'ready to pick'),
  jobTile('proof', 'proof', 'insights', 'awaiting proof approval'),
  jobTile('toInvoice', 'needsInvoice', 'insights', 'finished, not invoiced'),
  jobTile('orderNotStarted', 'orderNotStarted', 'insights', 'ordered, not started'),
  jobTile('inProgress', 'inProgress', 'insights', 'being made'),

  // Money and accounts.
  {
    id: 'owedToUs', title: 'Owed to us', section: 'insights',
    needs: ['GET /reports/aged-receivables'], source: 'agedReceivables',
    value: (report) => report?.totals?.total ?? 0, format: formatMoney,
    detail: (report) => counted(report?.rows?.length ?? 0, 'customer'),
    footer: 'invoiced, not yet paid',
    open: { module: 'reports', tab: 'aged' },
  },
  {
    // Everything on the report but its Current bucket — the 1–30 to Over 90 columns.
    id: 'overdueReceivables', title: 'Overdue receivables', section: 'todo', tone: 'danger',
    needs: ['GET /reports/aged-receivables'], source: 'agedReceivables',
    value: (report) => cents((report?.totals?.total ?? 0) - (report?.totals?.current ?? 0)), format: formatMoney,
    detail: (report) => counted(overdueInvoices(report), 'invoice'),
    footer: 'past the customer’s terms',
    open: { module: 'reports', tab: 'aged' },
  },
  {
    id: 'billsOverdue', title: 'Supplier bills overdue', section: 'todo', tone: 'danger',
    needs: ['GET /ap/summary', 'GET /ap/bills'], source: 'apSummary',
    value: (summary) => summary?.overdue_amount ?? 0, format: formatMoney,
    detail: (summary) => counted(summary?.overdue_count ?? 0, 'bill'),
    footer: 'past their due date',
    open: { module: 'accounts', tab: 'payables' },
  },
  {
    id: 'ledgerHealth', title: 'Ledger health', section: 'todo', tone: 'danger',
    needs: ['GET /accounting/health'], source: 'ledgerHealth',
    value: ledgerIssues,
    unit: (n) => (n === 0 ? 'in agreement' : n === 1 ? 'issue' : 'issues'),
    footer: 'ledger against jobs and bills',
    open: { module: 'accounts', tab: 'setup' },
  },
  {
    id: 'gstQuarter', title: 'GST this quarter', section: 'insights',
    needs: ['GET /accounting/reports/bas'], source: 'basQuarter',
    value: (bas) => bas?.net_gst ?? 0, format: (n) => formatMoney(Math.abs(n)),
    detail: (bas, { today }) => `${(bas?.net_gst ?? 0) < 0 ? 'refund due' : 'payable'} for ${basQuarter(today).label}`,
    footer: 'net GST on the BAS',
    open: ({ today }) => {
      const { from, to } = basQuarter(today);
      return { module: 'accounts', tab: 'reports', report: { report: 'bas', from, to } };
    },
  },
  {
    id: 'accountsAttention', title: 'Accounts needing attention', section: 'todo',
    needs: ['GET /users'], source: 'users',
    value: (users) => (users ?? []).filter(needsAttention).length,
    unit: (n) => (n === 1 ? 'account' : 'accounts'),
    footer: 'password not chosen, or no two-factor',
    open: { admin: true, usersFilter: 'attention' },
  },

  // Stock and purchasing.
  {
    id: 'needsReorder', title: 'Needs reorder', section: 'todo',
    needs: ['GET /inventory'], source: 'inventory',
    value: (items) => countNeedingReorder(items),
    unit: (n) => (n === 1 ? 'item' : 'items'),
    footer: 'at or below minimum, after orders',
    open: { module: 'inventory', chip: 'reorder' },
  },
  {
    id: 'posLate', title: 'Supplier POs late', section: 'todo', tone: 'danger',
    needs: ['GET /purchase-orders'], source: 'purchaseOrders',
    value: (pos, { today }) => (pos ?? []).filter((po) => isLatePO(po, today)).length,
    unit: (n) => (n === 1 ? 'PO' : 'POs'),
    footer: 'past their expected date',
    open: { module: 'purchase-orders', poStatus: 'late' },
  },
  {
    // One row per stock code on the Order Requirements garment tab.
    id: 'garmentToOrder', title: 'Garment lines to order', section: 'todo',
    needs: ['GET /jobs/order-requirements'], source: 'garmentReqs',
    value: (rows) => (rows ?? []).length,
    unit: (n) => (n === 1 ? 'stock code' : 'stock codes'),
    footer: 'back-ordered, no PO yet',
    open: { module: 'order-requirements' },
  },
].map((tile) => [tile.id, tile]));

/** Each role's tiles, in the order they appear. */
export const ROLE_TILES = {
  admin: ['overdueReceivables', 'billsOverdue', 'ledgerHealth', 'accountsAttention', 'owedToUs', 'gstQuarter', 'toInvoice'],
  manager: ['overdue', 'dueToday', 'needsReorder', 'posLate', 'garmentToOrder', 'thisWeek', 'proof'],
  staff: ['mine', 'dueToday', 'overdue', 'pickPack', 'notDespatched', 'quoteExpiring'],
  overseas_staff: ['mine', 'orderNotStarted', 'inProgress', 'proof', 'dueToday', 'overdue'],
};

/** The tiles a role gets; a role not listed gets the staff list. */
export const tilesForRole = (role) => (ROLE_TILES[role] ?? ROLE_TILES.staff).map((id) => TILES[id]).filter(Boolean);

/**
 * Whether the person may call every route the tile reads. `needs` are written
 * as the server declares its routes, so each is looked up as written in
 * `allowed`: matched as a path instead (canCall), GET /jobs/order-requirements
 * would pass for anyone allowed GET /jobs/{job_id}.
 */
export const canSee = (tile, access) =>
  Array.isArray(access?.allowed) && tile.needs.every((need) => access.allowed.includes(need));

/**
 * Home's sections for this person, each with the tiles they may see, in the
 * role's order. A section with nothing in it is left out.
 */
export function homeSections(role, access) {
  const visible = tilesForRole(role).filter((tile) => canSee(tile, access));
  return SECTIONS
    .map((section) => ({ ...section, tiles: visible.filter((tile) => tile.section === section.id) }))
    .filter((section) => section.tiles.length > 0);
}

/**
 * What a tile reads from the data it is given: `sources[tile.source]`, shaped
 * like a query result (`{ data, isPending, isError }`). A failed or missing
 * source is 'error' — shown as "Couldn't load", never as a zero.
 */
export function tileReading(tile, sources, ctx) {
  const source = sources?.[tile.source];
  if (!source || source.isError) return { state: 'error' };
  if (source.isPending) return { state: 'loading' };
  const reading = { state: 'ready', value: tile.value(source.data, ctx) };
  return tile.detail ? { ...reading, detail: tile.detail(source.data, ctx) } : reading;
}

/** Where a tile opens: its `open`, worked out for the day when it depends on it. */
export const tileLink = (tile, ctx) => (typeof tile.open === 'function' ? tile.open(ctx) : tile.open);

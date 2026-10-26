import {
  ROLE_TILES, TILES, canSee, formatCount, formatMoney, homeSections, ledgerIssues, overdueInvoices,
  tileLink, tileReading, tilesForRole,
} from '../homeSections';
import { EMPTY_JOBS_FILTERS, filterJobs } from '../../jobs/jobsFilters';
import { EMPTY_PO_FILTERS, filterPOs } from '../../purchase-orders/poFilters';
import { filterUsers } from '../../users/userRules';
import { needsReorder } from '../../stock/lowStock';
import { addDays, todayKey } from '../../../lib/dates';

const access = (role, allowed = ['GET /jobs', 'POST /jobs']) => ({ role, areas: [], allowed });
const layout = (role, a = access(role)) =>
  homeSections(role, a).map((s) => [s.id, s.tiles.map((t) => t.id)]);

// What each role may call, as far as Home reads it (backend gates, 2026-10-19).
const STOCK_READS = ['GET /inventory', 'GET /purchase-orders', 'GET /jobs/order-requirements'];
const MONEY_READS = ['GET /reports/aged-receivables', 'GET /ap/summary', 'GET /ap/bills'];
const LEDGER_READS = ['GET /accounting/health', 'GET /accounting/reports/bas'];
const ADMIN = access('admin', ['GET /jobs', 'POST /jobs', ...STOCK_READS, ...MONEY_READS, ...LEDGER_READS, 'GET /users']);
const MANAGER = access('manager', ['GET /jobs', 'POST /jobs', ...STOCK_READS, ...MONEY_READS, ...LEDGER_READS]);
const OVERSEAS = access('overseas_staff', ['GET /jobs', 'GET /jobs/{job_id}', ...STOCK_READS, 'GET /reports/on-time-delivery']);
const MONEY_TILES = ['owedToUs', 'overdueReceivables', 'billsOverdue', 'ledgerHealth', 'gstQuarter', 'accountsAttention'];

describe('each role’s Home', () => {
  test('admin: money owed both ways, the ledger, the accounts, and the invoicing queue', () => {
    expect(layout('admin', ADMIN)).toEqual([
      ['todo', ['overdueReceivables', 'billsOverdue', 'ledgerHealth', 'accountsAttention']],
      ['insights', ['owedToUs', 'gstQuarter', 'toInvoice']],
    ]);
  });

  test('manager: what is late or due, what to buy, and what is with the customer', () => {
    expect(layout('manager', MANAGER)).toEqual([
      ['todo', ['overdue', 'dueToday', 'needsReorder', 'posLate', 'garmentToOrder']],
      ['insights', ['thisWeek', 'proof']],
    ]);
  });

  test('a role that may read only jobs keeps only the job tiles', () => {
    expect(layout('admin')).toEqual([['insights', ['toInvoice']]]);
    expect(layout('manager')).toEqual([
      ['todo', ['overdue', 'dueToday']],
      ['insights', ['thisWeek', 'proof']],
    ]);
  });

  test('staff: their own jobs and the floor’s exception queues', () => {
    expect(layout('staff')).toEqual([
      ['todo', ['dueToday', 'overdue', 'notDespatched', 'quoteExpiring']],
      ['insights', ['mine', 'pickPack']],
    ]);
  });

  test('overseas staff: production stages', () => {
    expect(layout('overseas_staff')).toEqual([
      ['todo', ['dueToday', 'overdue']],
      ['insights', ['mine', 'orderNotStarted', 'inProgress', 'proof']],
    ]);
  });

  test('a role not listed gets the staff tiles', () => {
    expect(tilesForRole('contractor').map((t) => t.id)).toEqual(ROLE_TILES.staff);
    expect(layout('contractor')).toEqual(layout('staff'));
  });

  test('every tile a role lists exists', () => {
    for (const ids of Object.values(ROLE_TILES)) {
      for (const id of ids) expect(TILES[id]).toBeDefined();
    }
  });
});

describe('visibility comes from the routes, never the role name', () => {
  test('a tile disappears when the route it reads is not allowed', () => {
    expect(layout('admin', access('admin', ['POST /jobs']))).toEqual([]);
    expect(layout('staff', access('staff', []))).toEqual([]);
    // A route under the same prefix is a different route.
    expect(layout('manager', access('manager', ['GET /jobs/{job_id}']))).toEqual([]);
  });

  test('nothing shows before access has loaded', () => {
    expect(homeSections('admin', undefined)).toEqual([]);
  });

  test('a tile needs every route it reads', () => {
    const tile = { needs: ['GET /jobs', 'GET /reports/aged-receivables'] };
    expect(canSee(tile, access('staff', ['GET /jobs']))).toBe(false);
    expect(canSee(tile, access('staff', ['GET /jobs', 'GET /reports/aged-receivables']))).toBe(true);
  });

  test('a route is looked up as the server declares it, not read as a path', () => {
    // GET /jobs/{job_id} would take "order-requirements" as a job id.
    expect(canSee(TILES.garmentToOrder, access('staff', ['GET /jobs/{job_id}']))).toBe(false);
    expect(canSee(TILES.garmentToOrder, access('staff', ['GET /jobs/order-requirements']))).toBe(true);
  });

  test('overseas staff see no money tile, even under a list that names every one', () => {
    // Admin's list names all of them; the routes overseas staff may call decide.
    const shown = homeSections('admin', OVERSEAS).flatMap((s) => s.tiles.map((t) => t.id));
    expect(shown).toEqual(['toInvoice']);
    for (const id of MONEY_TILES) expect(canSee(TILES[id], OVERSEAS)).toBe(false);
    // Supplier bills need the bills too: the summary alone does not open Payables.
    expect(canSee(TILES.billsOverdue, access('staff', ['GET /ap/summary']))).toBe(false);
  });

  test('admin and manager may see what they read', () => {
    for (const id of MONEY_TILES) expect(canSee(TILES[id], ADMIN)).toBe(true);
    expect(canSee(TILES.accountsAttention, MANAGER)).toBe(false);
  });
});

describe('a job tile counts exactly the list it opens', () => {
  const NOW = new Date();
  const today = todayKey(NOW);
  const user = { username: 'emon', full_name: 'Emon Miah' };
  const jobs = [
    { id: 1, status: 'PRINT', due: addDays(today, -2), assignedTo: 'emon' },
    { id: 2, status: 'ORDER', due: today },
    { id: 3, status: 'In Progress', due: addDays(today, 3), accMgr: 'EMON' },
    { id: 4, status: 'PROOF', due: addDays(today, 9) },
    { id: 5, status: 'Pick/Pack', due: addDays(today, -1) },
    { id: 6, status: 'FINISH', due: addDays(today, -5), dispatchedAt: '' },
    { id: 7, status: 'INVOICE', due: addDays(today, -5), dispatchedAt: '2026-10-01' },
    { id: 8, status: 'QUOTE', due: '', validityDate: addDays(today, 6) },
    { id: 9, status: 'QUOTE', due: '', validityDate: addDays(today, 8) },
  ];

  test.each(Object.values(TILES).filter((t) => t.source === 'jobs').map((t) => [t.id, t]))('%s', (_id, tile) => {
    const opened = filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, quick: tile.open.quick }, user, NOW);
    expect(tile.value(jobs, { today, user })).toBe(opened.length);
  });
});

describe('the other tiles count exactly what they open', () => {
  const ctx = { today: '2026-10-19' };
  const value = (id, data) => TILES[id].value(data, ctx);
  const detail = (id, data) => TILES[id].detail(data, ctx);

  const REPORT = {
    rows: [
      { customer_id: 'C1', lines: [{ days_overdue: 0 }, { days_overdue: 12 }, { days_overdue: 95 }] },
      { customer_id: 'C2', lines: [{ days_overdue: 40 }] },
    ],
    totals: { current: 100.1, days_1_30: 200.2, days_31_60: 300.3, days_61_90: 0, over_90: 50, total: 650.6 },
  };

  test('owed to us: the report’s total, across its customers, on Aged Receivables', () => {
    expect(value('owedToUs', REPORT)).toBe(650.6);
    expect(detail('owedToUs', REPORT)).toBe('2 customers');
    expect(tileLink(TILES.owedToUs, ctx)).toEqual({ module: 'reports', tab: 'aged' });
  });

  test('overdue receivables: the 1–30 to over-90 columns, and the invoices in them', () => {
    const { days_1_30, days_31_60, days_61_90, over_90 } = REPORT.totals;
    expect(value('overdueReceivables', REPORT)).toBe(Math.round((days_1_30 + days_31_60 + days_61_90 + over_90) * 100) / 100);
    expect(detail('overdueReceivables', REPORT)).toBe('3 invoices');
    expect(overdueInvoices(undefined)).toBe(0);
    expect(tileLink(TILES.overdueReceivables, ctx)).toEqual({ module: 'reports', tab: 'aged' });
  });

  test('supplier bills: the payables summary’s overdue figures, on Payables', () => {
    const summary = { overdue_count: 1, overdue_amount: 330 };
    expect(value('billsOverdue', summary)).toBe(330);
    expect(detail('billsOverdue', summary)).toBe('1 bill');
    expect(tileLink(TILES.billsOverdue, ctx)).toEqual({ module: 'accounts', tab: 'payables' });
  });

  test('ledger health: in agreement, or each side out and each document listed', () => {
    const clean = {
      in_agreement: true,
      receivables: { difference: 0 }, payables: { difference: 0 },
      unposted_invoices: [], mismatched_jobs: [], paid_with_balance_owing: [], invoiced_without_date: [],
    };
    expect(ledgerIssues(clean)).toBe(0);
    expect(TILES.ledgerHealth.unit(0)).toBe('in agreement');
    expect(ledgerIssues({
      ...clean, in_agreement: false, receivables: { difference: 110 },
      mismatched_jobs: [{ job_id: 'J1' }], invoiced_without_date: [{ job_id: 'J2' }, { job_id: 'J3' }],
    })).toBe(4);
    // Out of agreement with nothing listed is still an issue, never a zero.
    expect(ledgerIssues({ ...clean, in_agreement: false, payables: { difference: -5 } })).toBe(1);
    // Documents that disagree with themselves count too, ledger or no.
    expect(ledgerIssues({
      ...clean,
      totals_disagree_with_lines: [{ job_id: 'J4' }],
      balances_disagree_with_invoices: [{ customer_id: 'C1' }],
    })).toBe(2);
    expect(tileLink(TILES.ledgerHealth, ctx)).toEqual({ module: 'accounts', tab: 'setup' });
  });

  test('GST: the BAS for this quarter, and it opens on that BAS and range', () => {
    expect(value('gstQuarter', { net_gst: 1200 })).toBe(1200);
    expect(detail('gstQuarter', { net_gst: 1200 })).toBe('payable for Oct–Dec 2026');
    expect(detail('gstQuarter', { net_gst: -80 })).toBe('refund due for Oct–Dec 2026');
    expect(TILES.gstQuarter.format(-80)).toBe('$80');
    expect(tileLink(TILES.gstQuarter, ctx)).toEqual({
      module: 'accounts', tab: 'reports', report: { report: 'bas', from: '2026-10-01', to: '2026-12-31' },
    });
  });

  test('accounts needing attention: the Users and roles filter of that name', () => {
    const users = [
      { id: 1, is_active: true, totp_enabled: true, must_change_password: false },
      { id: 2, is_active: true, totp_enabled: false },
      { id: 3, is_active: true, totp_enabled: true, must_change_password: true },
      { id: 4, is_active: false, totp_enabled: false, must_change_password: true },
    ];
    expect(value('accountsAttention', users)).toBe(filterUsers(users, { attention: true }).length);
    expect(value('accountsAttention', users)).toBe(2);
    expect(tileLink(TILES.accountsAttention, ctx)).toEqual({ admin: true, usersFilter: 'attention' });
  });

  test('needs reorder: the shared rule, on the Stock chip of that name', () => {
    const items = [{ stock: 1, min_stock: 10 }, { stock: 1, min_stock: 10, on_order_qty: 50 }, { stock: 30, reorderLevel: 20 }];
    expect(value('needsReorder', items)).toBe(items.filter(needsReorder).length);
    expect(value('needsReorder', items)).toBe(1);
    expect(tileLink(TILES.needsReorder, ctx)).toEqual({ module: 'inventory', chip: 'reorder' });
  });

  test('supplier POs late: the Purchases Late filter', () => {
    const pos = [
      { id: 'PO-1', status: 'Sent', expectedDate: '18/10/2026' },
      { id: 'PO-2', status: 'Partial', expectedDate: '2026-10-01' },
      { id: 'PO-3', status: 'Sent', expectedDate: '19/10/2026' },
      { id: 'PO-4', status: 'Draft', expectedDate: '01/10/2026' },
      { id: 'PO-5', status: 'Received', expectedDate: '01/10/2026' },
    ];
    const opened = filterPOs(pos, { ...EMPTY_PO_FILTERS, status: 'late' }, ctx.today);
    expect(value('posLate', pos)).toBe(opened.length);
    expect(opened.map((po) => po.id)).toEqual(['PO-1', 'PO-2']);
    expect(tileLink(TILES.posLate, ctx)).toEqual({ module: 'purchase-orders', poStatus: 'late' });
  });

  test('garment lines: one per row of the Order Requirements garment tab', () => {
    expect(value('garmentToOrder', [{ sku: 'A' }, { sku: 'B' }])).toBe(2);
    expect(value('garmentToOrder', [])).toBe(0);
    expect(tileLink(TILES.garmentToOrder, ctx)).toEqual({ module: 'order-requirements' });
  });
});

describe('tileReading', () => {
  const tile = TILES.overdue;
  const ctx = { today: '2026-10-19' };

  test('a failed or missing source reads as an error, never as zero', () => {
    expect(tileReading(tile, { jobs: { data: [], isPending: false, isError: true } }, ctx)).toEqual({ state: 'error' });
    expect(tileReading(tile, {}, ctx)).toEqual({ state: 'error' });
  });

  test('a pending source reads as loading', () => {
    expect(tileReading(tile, { jobs: { data: undefined, isPending: true, isError: false } }, ctx)).toEqual({ state: 'loading' });
  });

  test('loaded data is counted', () => {
    const data = [{ status: 'PRINT', due: '2026-10-01' }, { status: 'PAID', due: '2026-10-01' }];
    expect(tileReading(tile, { jobs: { data, isPending: false, isError: false } }, ctx)).toEqual({ state: 'ready', value: 1 });
  });

  test('a report that failed reads as an error, never as $0', () => {
    expect(tileReading(TILES.owedToUs, { agedReceivables: { data: undefined, isPending: false, isError: true } }, ctx))
      .toEqual({ state: 'error' });
  });

  test('a tile with a detail carries it', () => {
    const data = { rows: [{ lines: [] }], totals: { total: 50, current: 50 } };
    expect(tileReading(TILES.owedToUs, { agedReceivables: { data, isPending: false, isError: false } }, ctx))
      .toEqual({ state: 'ready', value: 50, detail: '1 customer' });
  });
});

test('a count fits in four characters', () => {
  expect([0, 7, 999, 1234, 12345, 123456, 1234567].map(formatCount)).toEqual(['0', '7', '999', '1.2K', '12K', '123K', '1.2M']);
});

test('an amount fits in a few', () => {
  expect([0, 12.5, 999, 1234, 12345, 1234567].map(formatMoney)).toEqual(['$0', '$13', '$999', '$1.2K', '$12K', '$1.2M']);
});

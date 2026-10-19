/**
 * What each page's header offers — the working actions from the old Jim2
 * ribbon, and nothing else.
 *
 * The ribbon showed 135 buttons across the modules and 97 did nothing. Three
 * of the "working" ones did nothing either ("Users" had an empty handler;
 * "Reports" and "Mgmt Dashboard" navigated to the page already open). Record
 * actions — duplicate to sites, unprint — appear on the job record
 * only: on the list they acted on whichever job had last been opened, which
 * was no longer on screen.
 *
 * `ctx` carries the monolith's state and handlers; this module only decides
 * what is offered where. Returns null when a page has nothing to offer, so no
 * empty bar is drawn.
 */
import {
  Box, ClipboardList, Copy, DollarSign, Edit, FileSpreadsheet, FileText,
  Plus, RefreshCw, Settings, CheckSquare, TrendingUp, Boxes,
} from 'lucide-react';
import { addDays, dayKey, todayKey } from '../../lib/dates';
import { needsReorder } from '../../modules/stock/lowStock';

export const MODULE_TITLES = {
  dashboard: 'Dashboard',
  jobs: 'Jobs',
  quotes: 'Quotes',
  'purchase-orders': 'Purchase orders',
  inventory: 'Stock',
  'card-files': 'Card files',
  customers: 'Customers',
  suppliers: 'Suppliers',
  'order-requirements': 'Order requirements',
  accounts: 'Accounts',
  reports: 'Reports',
};

const INVOICED = ['INVOICE', 'PAID'];

function jobRecordActions(ctx) {
  const job = ctx.activeJob;
  // Documents are not repeated here: the record's own Print menu already
  // offers every one of them.
  const actions = [
    { key: 'toSites', label: 'Duplicate to sites', icon: Copy, onClick: () => ctx.duplicateToSites(job), title: 'One copy of this job per customer site' },
  ];
  if (INVOICED.includes(job.status)) {
    actions.push({ key: 'unprint', label: 'Unprint', icon: FileText, onClick: () => ctx.unprint(job), title: 'Return this job from invoiced to FINISH' });
  }
  return { title: `Job ${job.id}`, actions };
}

function stockReports(ctx) {
  const inv = ctx.inventory ?? [];
  const csvSafe = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = (arr) => arr.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, csvSafe(v)])));
  const run = (label, fn) => () => {
    if (!inv.length) { ctx.notify('No stock data loaded yet.', { type: 'error' }); return; }
    fn();
    ctx.notify(`Exported ${label} (CSV)`, { type: 'success' });
  };
  const reports = [
    ['Stock list', () => ctx.exportToCSV(rows(inv.map((i) => ({ code: i.sku, description: i.name, category: i.category, supplier: i.supplier, on_hand: i.stock, committed: i.committed_qty, available: Math.max(0, (i.stock || 0) - (i.committed_qty || 0)), on_po: i.on_order_qty, cost: i.unitCost, sell: i.unitPrice }))), 'stock-list')],
    ['Stock list — with GL groups', () => ctx.exportToCSV(rows(inv.map((i) => ({ code: i.sku, description: i.name, gl_group: i.gl_group || '', item_type: i.item_type, location: i.location, on_hand: i.stock, cost: i.unitCost, sell: i.unitPrice }))), 'stock-list-gl-groups')],
    ['Stock valuation', () => ctx.exportToCSV(rows(inv.map((i) => ({ code: i.sku, description: i.name, on_hand: i.stock, unit_cost: i.unitCost, value: ((i.stock || 0) * (i.unitCost || 0)).toFixed(2) }))), 'stock-valuation')],
    // The shared projected-stock rule (lowStock.js) — the same one the status
    // strip counts — rather than this export's own on-hand-only copy.
    ['Low stock / reorder', () => ctx.exportToCSV(rows(inv.filter(needsReorder).map((i) => ({ code: i.sku, description: i.name, on_hand: i.stock, committed: i.committed_qty, on_po: i.on_order_qty, min_stock: i.min_stock ?? i.reorderLevel ?? 0, supplier: i.supplier }))), 'low-stock-reorder')],
    ['Stock list — 12 month sales', () => {
      const cutoff = addDays(todayKey(), -365);
      const sold = {};
      (ctx.jobs ?? []).forEach((j) => {
        if (['QUOTE', 'CANCEL'].includes(j.status)) return;
        const d = dayKey(j.dateIn);
        if (!d || d < cutoff) return;
        (j.items || []).forEach((it) => { if (it.stockCode) sold[it.stockCode] = (sold[it.stockCode] || 0) + (it.supply || it.qty || 0); });
      });
      ctx.exportToCSV(rows(inv.map((i) => ({ code: i.sku, description: i.name, sold_12m: sold[i.sku] || 0, on_hand: i.stock, on_po: i.on_order_qty }))), 'stock-12-month-sales');
    }],
  ];
  return reports.map(([label, fn]) => ({ label, onClick: run(label, fn) }));
}

export function pageActions(ctx) {
  const m = ctx.activeModule;
  const title = MODULE_TITLES[m];

  if ((m === 'jobs' || m === 'quotes') && ctx.showJobDetail && ctx.activeJob) return jobRecordActions(ctx);

  if (m === 'jobs' || m === 'quotes') {
    const quotes = m === 'quotes';
    return {
      title,
      actions: [
        { key: 'new', label: quotes ? 'New quote' : 'New job', icon: Plus, primary: true, onClick: ctx.newJob },
        { key: 'dispatch', label: 'Dispatch', icon: Box, onClick: ctx.openDispatch },
        { key: 'salesRegister', label: 'Sales register', icon: DollarSign, onClick: ctx.openSalesRegister },
        { key: 'createList', label: 'Create list', icon: ClipboardList, onClick: () => ctx.createJobList(quotes ? 'quotes' : 'jobs') },
        { key: 'export', label: 'Export', icon: FileSpreadsheet, onClick: ctx.exportJobs },
      ],
    };
  }

  if (m === 'purchase-orders') {
    const actions = [{ key: 'new', label: 'New purchase order', icon: Plus, primary: true, onClick: ctx.newPO }];
    if (ctx.selectedPO) actions.push({ key: 'edit', label: `Edit ${ctx.selectedPO.id}`, icon: Edit, onClick: () => ctx.editPO(ctx.selectedPO) });
    actions.push({ key: 'createList', label: 'Create list', icon: ClipboardList, onClick: ctx.createPOList });
    return { title, actions };
  }

  if (m === 'card-files') {
    const actions = [{ key: 'new', label: 'New card file', icon: Plus, primary: true, onClick: ctx.newCardFile }];
    if (ctx.selectedCardFile) actions.push({ key: 'edit', label: 'Edit card file', icon: Edit, onClick: () => ctx.editCardFile(ctx.selectedCardFile) });
    return { title, actions };
  }

  if (m === 'inventory') {
    return {
      title,
      actions: [
        { key: 'new', label: 'New stock item', icon: Plus, primary: true, onClick: ctx.newStockItem },
        { key: 'transfer', label: 'Transfer', icon: RefreshCw, onClick: ctx.openTransfer },
        { key: 'adjust', label: 'Adjust', icon: Settings, onClick: ctx.openAdjust },
        { key: 'stocktake', label: 'Stocktake', icon: CheckSquare, onClick: ctx.openStocktake },
        { key: 'warehouse', label: 'Warehouse 3D', icon: Boxes, onClick: ctx.openWarehouse },
        { key: 'flow', label: 'Stock flow', icon: TrendingUp, onClick: ctx.openStockFlow },
        { key: 'reports', label: 'Export', icon: FileSpreadsheet, items: stockReports(ctx) },
        { key: 'createList', label: 'Create list', icon: ClipboardList, onClick: ctx.createStockList },
      ],
    };
  }

  if (m === 'order-requirements') return { title, actions: [{ key: 'new', label: 'New stock item', icon: Plus, primary: true, onClick: ctx.newStockItem }] };
  if (m === 'customers') return { title, actions: [{ key: 'new', label: 'New customer', icon: Plus, primary: true, onClick: ctx.newCustomer }] };
  if (m === 'suppliers') return { title, actions: [{ key: 'new', label: 'New supplier', icon: Plus, primary: true, onClick: ctx.newSupplier }] };

  return null;
}

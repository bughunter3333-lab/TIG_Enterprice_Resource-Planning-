/**
 * Formatting shared by the accounting screens.
 *
 * Money is shown the way an accountant reads it: two decimals, thousands
 * separated, and negatives in brackets rather than with a minus sign that is
 * easy to miss in a column of figures.
 */

import { addDays, todayKey } from '../../lib/dates';

const AUD = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(value) {
  const n = Number(value) || 0;
  const text = AUD.format(Math.abs(n));
  return n < 0 ? `(${text})` : text;
}

/** Blank rather than 0.00, so a debit-or-credit column reads at a glance. */
export function moneyOrBlank(value) {
  return Number(value) ? money(value) : '';
}

export const CATEGORY_LABELS = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Income',
  cost_of_sales: 'Cost of Sales',
  expense: 'Expenses',
};

export const CATEGORY_ORDER = ['asset', 'liability', 'equity', 'income', 'cost_of_sales', 'expense'];

export const SOURCE_LABELS = {
  invoice: 'Invoice',
  payment: 'Payment',
  bill: 'Bill',
  bill_payment: 'Bill payment',
  manual: 'Journal',
  opening: 'Opening',
};

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** The Australian financial year containing `iso` — 1 July to 30 June. */
export function financialYear(iso = todayIso()) {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 7 ? y : y - 1;
  return { from: `${start}-07-01`, to: `${start + 1}-06-30` };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/**
 * The BAS quarter containing the day `key` — Jul–Sep, Oct–Dec, Jan–Mar or
 * Apr–Jun — as day keys (lib/dates.js), so it is the viewer's own day and never
 * the UTC one, which in Sydney is yesterday until mid-morning.
 */
export function basQuarter(key = todayKey()) {
  const [y, m] = key.split('-').map(Number);
  const start = m - ((m - 1) % 3);
  const next = start === 10 ? `${y + 1}-01-01` : `${y}-${pad(start + 3)}-01`;
  return {
    from: `${y}-${pad(start)}-01`,
    to: addDays(next, -1),
    label: `${MONTHS[start - 1]}–${MONTHS[start + 1]} ${y}`,
  };
}

export const CAN_READ_LEDGER = ['admin', 'manager'];
export const CAN_WRITE_LEDGER = ['admin'];

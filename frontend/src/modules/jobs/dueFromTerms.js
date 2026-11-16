/**
 * A job's due date from the customer's payment terms, as a day key.
 *
 * Worked on calendar days, never milliseconds: a day counted across the start
 * of daylight saving is an hour short, and an end-of-month due date taken in
 * the first days of October came out a day early.
 */
import { addDays, dayKey, isoDay, todayKey } from '../../lib/dates';

const CASH = new Set(['COD', 'On Receipt']);
const DEFAULT_DAYS = 30;

/**
 * @param {string | undefined} terms  'Net 30', 'EOM', 'COD', 'On Receipt'
 * @param {string} [fromDate]  the day the terms run from; today if none
 * @returns {string} YYYY-MM-DD
 */
export function dueFromTerms(terms, fromDate) {
  const from = dayKey(fromDate) ?? todayKey();
  if (terms === 'EOM') {
    const [y, m] = from.split('-').map(Number);
    return isoDay(new Date(y, m, 0)); // day 0 of next month: this month's last
  }
  if (CASH.has(terms)) return from;
  const days = terms?.startsWith('Net ') ? parseInt(terms.slice(4), 10) : DEFAULT_DAYS;
  return addDays(from, Number.isNaN(days) ? DEFAULT_DAYS : days);
}

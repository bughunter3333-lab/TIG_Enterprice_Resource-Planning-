/** A job's due date from the customer's payment terms. */
import { afterEach, beforeEach, expect, test } from 'vitest';
import { dueFromTerms } from '../dueFromTerms';

// Sydney, where daylight saving starts on the first Sunday of October: a day
// counted in milliseconds across it is an hour short, and rounded down.
let zone;
beforeEach(() => { zone = process.env.TZ; process.env.TZ = 'Australia/Sydney'; });
afterEach(() => { process.env.TZ = zone; });

test('net days are counted on the calendar', () => {
  expect(dueFromTerms('Net 30', '2026-10-01')).toBe('2026-10-31');
  expect(dueFromTerms('Net 7', '2026-12-28')).toBe('2027-01-04');
});

test('end of month is the last day of the month, across daylight saving', () => {
  expect(dueFromTerms('EOM', '2026-10-02')).toBe('2026-10-31');
  expect(dueFromTerms('EOM', '2026-02-10')).toBe('2026-02-28');
});

test('cash terms are due the same day; anything unknown is 30 days', () => {
  expect(dueFromTerms('COD', '2026-11-15')).toBe('2026-11-15');
  expect(dueFromTerms('On Receipt', '2026-11-15')).toBe('2026-11-15');
  expect(dueFromTerms(undefined, '2026-11-15')).toBe('2026-12-15');
  expect(dueFromTerms('Net x', '2026-11-15')).toBe('2026-12-15');
});

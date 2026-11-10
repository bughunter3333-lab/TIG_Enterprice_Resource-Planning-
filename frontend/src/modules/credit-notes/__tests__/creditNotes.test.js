/**
 * The credit worked out as it is typed: the server's rule (core/job_totals.py),
 * so the dialog's figure is the one the credit note comes to.
 */
import { expect, test } from 'vitest';
import { amountEstimate, creditedSoFar, decorated, estimate, isCreditable, leftToCredit, leftToReturn, mayComeBack, noteEstimate } from '../creditNotes';

const tee = { id: 1, order: 4, supply: 3, priceEx: 10, priceInc: 11, pricedInc: false };
const shelf = { id: 2, order: 2, supply: 2, priceEx: 31.77, priceInc: 34.95, pricedInc: true };

test('lines priced ex GST add up ex with GST on top', () => {
  expect(estimate([tee], { 1: 2 })).toEqual({ ex: 20, tax: 2, inc: 22 });
});

test('a line priced inc GST is its inc price, an eleventh of it GST', () => {
  expect(estimate([shelf], { 2: 1 })).toEqual({ ex: 31.77, tax: 3.18, inc: 34.95 });
  expect(estimate([tee, shelf], { 1: 1, 2: 1 })).toEqual({ ex: 41.77, tax: 4.18, inc: 45.95 });
});

test('what is left counts earlier credit notes; what may come back, what went out', () => {
  const so = creditedSoFar([
    { lines: [{ job_item_id: 1, qty: 1, goods_back: true }, { job_item_id: 1, qty: 1, goods_back: false }] },
  ]);
  expect(leftToCredit(tee, so)).toBe(2);
  expect(leftToReturn(tee, so)).toBe(2);
});

test('only an invoice is credited; a decoration or charge never comes back', () => {
  expect(isCreditable({ status: 'INVOICE' })).toBe(true);
  expect(isCreditable({ status: 'FINISH' })).toBe(false);
  expect(mayComeBack({ isService: true })).toBe(false);
  expect(mayComeBack({ isCharge: true })).toBe(false);
  expect(mayComeBack({})).toBe(true);
});

test('GST on lines priced inc GST is rounded line by line, as the server does', () => {
  const a = { id: 3, order: 1, priceInc: 10.05, pricedInc: true };
  const b = { id: 4, order: 1, priceInc: 10.05, pricedInc: true };
  // Each line's GST is 0.91; GST on the sum (20.10) would be 1.83.
  expect(estimate([a, b], { 3: 1, 4: 1 })).toEqual({ ex: 18.28, tax: 1.82, inc: 20.1 });
});

test('the note crediting everything left takes exactly what is left', () => {
  const line = { id: 1, displayType: 'product', order: 3, priceEx: 3.33 };
  const job = { subtotal: 9.99, tax: 1, total: 10.99, items: [line] };
  const earlier = [{ total_ex: 6.66, tax: 0.67, total_inc: 7.33, lines: [{ job_item_id: 1, qty: 2 }] }];
  expect(noteEstimate(job, earlier, { 1: 1 })).toEqual({ ex: 3.33, tax: 0.33, inc: 3.66 });
});

test("an amount takes GST in the invoice's own proportion", () => {
  const job = { subtotal: 100, tax: 10, total: 110, items: [] };
  expect(amountEstimate(job, [], 33)).toEqual({ ex: 30, tax: 3, inc: 33 });
  expect(amountEstimate(job, [], 110)).toEqual({ ex: 100, tax: 10, inc: 110 });
  const gstFree = { subtotal: 50, tax: 0, total: 50, items: [] };
  expect(amountEstimate(gstFree, [], 20)).toEqual({ ex: 20, tax: 0, inc: 20 });
});

test('decorated: its own type, a line on it, or a logo naming no garment', () => {
  const tee = { id: 1, decorationType: 'None' };
  const cap = { id: 2, decorationType: 'None' };
  expect(decorated(tee, [tee, { id: 3, logoId: 9, appliesToItemId: null }])).toBe(true);
  expect(decorated(tee, [tee, cap, { id: 4, logoId: 9, appliesToItemId: 2 }])).toBe(false);
  expect(decorated(cap, [tee, cap, { id: 4, logoId: null, appliesToItemId: 2 }])).toBe(true);
  expect(decorated({ id: 5, decorationType: 'EMB' }, [])).toBe(true);
});

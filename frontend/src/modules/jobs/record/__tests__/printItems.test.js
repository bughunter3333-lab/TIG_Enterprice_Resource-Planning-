/**
 * The job record's Print menu (F23): a tax invoice or proforma shows the job's
 * prices, so it is offered only where the sales register may be read. The
 * browser builds it from job data every role can read, so the menu is where
 * the rule has to hold.
 */
import { expect, test } from 'vitest';
import { offeredPrintItems } from '../printItems';

const ITEMS = ['invoice', 'proforma', 'proformaBal', 'pickingSlip', 'deliveryNote', 'jobSheet', 'shipLabel']
  .map((key) => ({ key, label: key, onClick: () => {} }));
const keys = (items) => items.map((i) => i.key);

test('without the sales register, the invoice and proformas are not offered', () => {
  const offer = (method, path) => !(method === 'GET' && path === '/jobs/sales-register');
  expect(keys(offeredPrintItems(ITEMS, offer))).toEqual(['pickingSlip', 'deliveryNote', 'jobSheet', 'shipLabel']);
});

test('with it, every document is offered', () => {
  expect(keys(offeredPrintItems(ITEMS, () => true))).toEqual(keys(ITEMS));
});

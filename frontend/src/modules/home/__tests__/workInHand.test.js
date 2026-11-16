import { workInHand } from '../workInHand';

const ctx = { today: '2026-10-26', user: { username: 'jo' } };
const jobs = [
  { id: 1, status: 'QUOTE' },
  { id: 2, status: 'New' },
  { id: 3, status: 'ORDER' },
  { id: 4, status: 'In Progress' },
  { id: 5, status: 'PROOF' },
  { id: 6, status: 'Pick/Pack' },
  { id: 7, status: 'Desp/Ready' },
  { id: 8, status: 'FINISH' },
  { id: 9, status: 'INVOICE' },
  { id: 10, status: 'PAID' },
  { id: 11, status: 'CANCEL' },
];

test('every open job is on the bar once, by stage; paid and cancelled work is not in hand', () => {
  const w = workInHand(jobs, ctx);
  expect(w.open).toBe(9);
  expect(Object.fromEntries(w.stages.map((s) => [s.id, s.count]))).toEqual({
    quoted: 2, production: 2, proof: 1, packing: 2, toInvoice: 1, awaitingPayment: 1,
  });
});

test('each link counts the list it opens', () => {
  const links = workInHand(jobs, ctx).links;
  // In production is the shared view: New through PRINT, proof included.
  expect(links).toEqual([
    { view: 'inProduction', quick: 'inProduction', label: 'In production', count: 4 },
    { view: 'proof', quick: 'proof', label: 'With the customer', count: 1 },
    { view: 'toInvoice', quick: 'needsInvoice', label: 'To invoice', count: 1 },
  ]);
});

test('no jobs, nothing in hand', () => {
  expect(workInHand(undefined, ctx).open).toBe(0);
});

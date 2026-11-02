/**
 * What the purchasing, despatch and proof screens send and read (F18, F22,
 * F31, F36): a receipt row names its PO line, a further consignment says so,
 * a logo line carries its logo's proof, and a bill's PO match has the ordered
 * figure beside received and billed.
 */
import { afterEach, expect, test, vi } from 'vitest';
import { dispatchSessions, goodsReceipts, jobs, supplierBills } from '../api';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const sentBody = (fetchMock, call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body);

afterEach(() => { vi.unstubAllGlobals(); });

test('a goods-receipt row names the PO line it is received against, and reads it back', async () => {
  const fetchMock = vi.fn(async () => ok({ id: 3, lines: [{ id: 1, sku: 'TEE-L', qty_received: 5, po_item_id: 42 }] }));
  vi.stubGlobal('fetch', fetchMock);
  const saved = await goodsReceipts.create({
    poId: 'PO-1',
    receivedDate: '2026-10-27',
    lines: [{ sku: 'TEE-L', qtyReceived: 5, poItemId: 42 }, { sku: 'TEE-M', qtyReceived: 1 }],
  });
  expect(sentBody(fetchMock).lines.map((l) => l.po_item_id)).toEqual([42, null]);
  expect(saved.lines[0].poItemId).toBe(42);
});

test('a despatch says when it is a further consignment, on a batch and on one job', async () => {
  const fetchMock = vi.fn(async () => ok({ id: 1, lines: [] }));
  vi.stubGlobal('fetch', fetchMock);
  await dispatchSessions.create([
    { id: '1', shipVia: 'StarTrack', shipRef: 'C2', cartons: 1, advanceStatus: false, again: true },
    { id: '2', shipVia: 'StarTrack', shipRef: 'C3', cartons: 1, advanceStatus: false },
  ]);
  expect(sentBody(fetchMock).lines.map((l) => l.again)).toEqual([true, false]);

  fetchMock.mockImplementation(async () => ok({ id: '1', items: [] }));
  await jobs.dispatch('1', { shipVia: 'StarTrack', shipRef: 'C2', again: true });
  expect(sentBody(fetchMock, 1).again).toBe(true);
});

test("a despatch sends its day; undated, the browser's today, not UTC's (B1-07)", async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 8:30 in the morning, local time: UTC's day is still yesterday in Sydney.
  vi.setSystemTime(new Date(2026, 10, 2, 8, 30));
  try {
    const fetchMock = vi.fn(async () => ok({ id: 1, lines: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const line = { id: '1', shipVia: 'Toll', shipRef: 'C1', cartons: 1, advanceStatus: false };
    await dispatchSessions.create([line], { despatchDate: '2026-11-05' });
    expect(sentBody(fetchMock).despatch_date).toBe('2026-11-05');
    await dispatchSessions.create([line]);
    expect(sentBody(fetchMock, 1).despatch_date).toBe('2026-11-02');
    fetchMock.mockImplementation(async () => ok({ id: '1', items: [] }));
    await jobs.dispatch('1', { shipVia: 'Toll', shipRef: 'C2' });
    expect(sentBody(fetchMock, 2).despatch_date).toBe('2026-11-02');
  } finally {
    vi.useRealTimers();
  }
});

test("a supplier's credit note is applied to a bill, and says which (S2-09)", async () => {
  const fetchMock = vi.fn(async () => ok({ id: 1, amount_inc: 554.4, outstanding: 444.4 }));
  vi.stubGlobal('fetch', fetchMock);
  const bill = await supplierBills.applyCredit(2, 1);
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/ap\/bills\/2\/apply$/);
  expect(sentBody(fetchMock)).toEqual({ bill_id: 1 });
  expect(bill.outstanding).toBe(444.4);

  fetchMock.mockImplementation(async () => ok({ id: 2, amount_inc: -110, applied_to_bill_id: 1 }));
  expect((await supplierBills.get(2)).appliedToBillId).toBe(1);
});

test("a logo line carries its logo's code and proof", async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ok({
    id: '1',
    items: [
      { id: 1, logo_id: 9, logo_code: 'EMB.PB31', logo_proof_status: 'approved' },
      { id: 2, stock_code: 'TEE-L' },
    ],
  })));
  const job = await jobs.get('1');
  expect(job.items[0]).toMatchObject({ logoId: 9, logoCode: 'EMB.PB31', logoProofStatus: 'approved' });
  expect(job.items[1]).toMatchObject({ logoId: null, logoCode: '', logoProofStatus: null });
});

test("a bill's PO match has what was ordered beside received and billed", async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ok([{
    id: 7, po_id: 'PO-1',
    po_match: { po_id: 'PO-1', ordered_inc: '220.00', received_inc: '184.25', billed_inc: '200.00', difference: '15.75', matches: false },
  }])));
  const [bill] = await supplierBills.list();
  expect(bill.poMatch).toMatchObject({ orderedInc: 220, receivedInc: 184.25, billedInc: 200 });
});

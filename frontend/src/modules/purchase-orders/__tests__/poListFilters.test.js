import { matchPOList, poOutstanding, EMPTY_PO_LIST } from '../poListFilters';

const pos = [
  { id: 'PO-2049911', supplier: 'Corinthian', status: 'Sent', date: '2026-05-14', expectedDate: '2026-05-28',
    items: [{ sku: 'VEN.P85', description: 'Hi Vis Polo', qtyOrdered: 10, qtyReceived: 4 }] },
  { id: 'PO-2050066', supplier: 'AS Colour', status: 'Received', date: '2026-06-01', expectedDate: '2026-06-18',
    items: [{ sku: 'AS5026', description: 'Staple Tee', qtyOrdered: 20, qtyReceived: 20 }] },
  { id: 'PO-2050100', supplier: 'Legend', status: 'Draft', date: '15/06/2026', expectedDate: '',
    items: [] },
];

test('empty/null filter matches everything', () => {
  expect(pos.every(p => matchPOList(p, null))).toBe(true);
  expect(pos.filter(p => matchPOList(p, EMPTY_PO_LIST))).toHaveLength(3);
});

test('poNo is case-insensitive contains; supplier/status exact', () => {
  expect(pos.filter(p => matchPOList(p, { poNo: '2049' })).map(p => p.id)).toEqual(['PO-2049911']);
  expect(pos.filter(p => matchPOList(p, { supplier: 'AS Colour' })).map(p => p.id)).toEqual(['PO-2050066']);
  expect(pos.filter(p => matchPOList(p, { status: 'Draft' })).map(p => p.id)).toEqual(['PO-2050100']);
});

test('stockCode matches any line sku or description', () => {
  expect(pos.filter(p => matchPOList(p, { stockCode: 'ven.p85' })).map(p => p.id)).toEqual(['PO-2049911']);
  expect(pos.filter(p => matchPOList(p, { stockCode: 'staple' })).map(p => p.id)).toEqual(['PO-2050066']);
});

test('order-date range handles ISO and DD/MM/YYYY', () => {
  const june = pos.filter(p => matchPOList(p, { dateFrom: '2026-06-01', dateTo: '2026-06-30' }));
  expect(june.map(p => p.id).sort()).toEqual(['PO-2050066', 'PO-2050100']);
});

test('outstanding = goods still owed and not cancelled/received', () => {
  expect(poOutstanding(pos[0])).toBe(true);   // 4 of 10 received
  expect(poOutstanding(pos[1])).toBe(false);  // Received
  expect(poOutstanding(pos[2])).toBe(true);   // Draft, no lines yet
  expect(pos.filter(p => matchPOList(p, { outstanding: true })).map(p => p.id)).toEqual(['PO-2049911', 'PO-2050100']);
});

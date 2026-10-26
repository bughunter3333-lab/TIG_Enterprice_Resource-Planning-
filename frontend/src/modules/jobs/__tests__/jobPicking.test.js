import { pickableLines } from '../jobPicking';

const job = {
  items: [
    { id: 1, displayType: 'section', description: 'Polos' },
    { id: 2, displayType: 'product', stockCode: 'POLO-NAV-M', isService: false },
    { id: 3, displayType: 'product', stockCode: 'EMB.ZONE.LHC', isService: true },
    { id: 4, displayType: 'product', stockCode: 'ALT.HEM', isService: true },
    { id: 5, displayType: 'note', description: 'Ship together' },
    { id: 6, stockCode: 'CAP-BLK' },
  ],
};

test('only goods lines are picked — not sections, notes, logos or alterations', () => {
  expect(pickableLines(job).map((i) => i.id)).toEqual([2, 6]);
});

test('a job with no lines has nothing to pick', () => {
  expect(pickableLines({})).toEqual([]);
  expect(pickableLines(null)).toEqual([]);
});

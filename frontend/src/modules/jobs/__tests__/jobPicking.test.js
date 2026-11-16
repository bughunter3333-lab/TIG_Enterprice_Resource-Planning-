import { linePickedInFull, pickableLines, pickMoveFor } from '../jobPicking';

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

describe('the move the pick panel offers', () => {
  const polo = { id: 1, supply: 4 };
  const cap = { id: 2, supply: 2 };
  const picked = (counts) => (line) => counts[line.id] ?? 0;

  test('every line picked in full: Picked', () => {
    expect(pickMoveFor('ORDER', [polo, cap], picked({ 1: 4, 2: 2 }))).toBe('Picked');
    expect(pickMoveFor('Inco/Pick', [polo, cap], picked({ 1: 4, 2: 2 }))).toBe('Picked');
  });

  test('some picked, the rest waiting: Inco/Pick', () => {
    expect(pickMoveFor('PROOF', [polo, cap], picked({ 1: 4 }))).toBe('Inco/Pick');
    expect(pickMoveFor('Picked', [polo, cap], picked({ 1: 4 }))).toBe('Inco/Pick');
  });

  test('a line all picked with the rest on back-order is a part pick, as the server counts it', () => {
    const shortPolo = { id: 1, supply: 4, bOrd: 6 };
    expect(linePickedInFull(shortPolo, 4)).toBe(false);
    expect(pickMoveFor('ORDER', [shortPolo, cap], picked({ 1: 4, 2: 2 }))).toBe('Inco/Pick');
  });

  test('nothing offered where it would not be a step forward or once past PRINT', () => {
    expect(pickMoveFor('ORDER', [polo], picked({}))).toBeNull();
    expect(pickMoveFor('Picked', [polo], picked({ 1: 4 }))).toBeNull();
    expect(pickMoveFor('Pick/Pack', [polo], picked({ 1: 4 }))).toBeNull();
    expect(pickMoveFor('ORDER', [], picked({}))).toBeNull();
  });
});

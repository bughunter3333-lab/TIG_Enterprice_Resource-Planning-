import { cardKey, cardOrder, isPressing, lanesWithCards, lineText, sinceText } from '../productionBoard';

const card = (job_id, lane, extra = {}) => ({ job_id, lane, priority: 'Normal', due: '', lines: [], ...extra });

describe('the cards in a lane', () => {
  test('sooner due first, then the more urgent, then the job number', () => {
    const cards = [
      card('1003', 'print', { due: '20/11/2026' }),
      card('1001', 'print', { due: '18/11/2026' }),
      card('1004', 'print', { due: '18/11/2026', priority: 'Urgent' }),
      card('1002', 'print'),
    ];
    expect([...cards].sort(cardOrder).map((c) => c.job_id)).toEqual(['1004', '1001', '1003', '1002']);
  });

  test('every lane is kept, in the server order, holding its own cards', () => {
    const board = {
      lanes: [{ key: 'picking', label: 'Picking' }, { key: 'packing', label: 'Packing' }],
      cards: [card('1', 'packing'), card('2', 'picking')],
    };
    expect(lanesWithCards(board).map((l) => [l.key, l.cards.map((c) => c.job_id)])).toEqual([
      ['picking', ['2']],
      ['packing', ['1']],
    ]);
    expect(lanesWithCards(undefined)).toEqual([]);
  });

  test('a card is a job at a lane', () => {
    expect(cardKey(card('1001', 'embroidery'))).toBe('1001@embroidery');
  });

  test('only High and Urgent are marked', () => {
    expect(isPressing(card('1', 'print', { priority: 'Urgent' }))).toBe(true);
    expect(isPressing(card('1', 'print', { priority: 'Normal' }))).toBe(false);
  });
});

describe('the words on a card', () => {
  test('a garment line reads as the job sheet numbers it', () => {
    expect(lineText({ line: 1, stock_code: 'POLO-NAV', qty: 4, decoration: ['EMB.RIC'] })).toBe('L1 · POLO-NAV · 4 · EMB.RIC');
    expect(lineText({ line: 2, stock_code: null, description: 'Cap', qty: 0, decoration: [] })).toBe('L2 · Cap · 0');
  });

  test('since when: a time today, a day before', () => {
    const now = new Date('2026-11-07T15:00:00');
    expect(sinceText('2026-11-07T09:42:00', now)).toMatch(/^since 9:42/);
    expect(sinceText('2026-11-05T09:42:00', now)).toBe('since 5 Nov');
    expect(sinceText(null, now)).toBe('');
  });
});

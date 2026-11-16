import { binStates, matchBins } from '../occupancy';

const row = (bin, sku, over = {}) => ({
  bin, sku, slot: 'primary', name: `${sku} name`, max_qty: null,
  qty_on_hand: 10, committed_qty: 0, available_qty: 10, ...over,
});

describe('binStates', () => {
  test('a bin with stock on hand is stocked; one whose SKUs have none is empty', () => {
    const states = binStates([
      row('A.1.A.1', 'TEE-NAV-L'),
      row('A.1.A.2', 'TEE-NAV-M', { qty_on_hand: 0, available_qty: 0 }),
    ]);
    expect(states.get('A.1.A.1').state).toBe('stocked');
    expect(states.get('A.1.A.2').state).toBe('empty');
  });

  test('two SKUs in one bin are both listed', () => {
    const states = binStates([row('B.2.B.3', 'CAP-BLK'), row('B.2.B.3', 'CAP-NAV')]);
    expect(states.get('B.2.B.3').skus.map((s) => s.sku)).toEqual(['CAP-BLK', 'CAP-NAV']);
  });

  test('more on hand than its bins hold is over capacity, in every bin it uses', () => {
    const states = binStates([
      row('A.1.A.1', 'TEE', { qty_on_hand: 60, max_qty: 30 }),
      row('A.1.B.1', 'TEE', { qty_on_hand: 60, max_qty: 20, slot: 'overflow' }),
    ]);
    expect(states.get('A.1.A.1').state).toBe('over');
    expect(states.get('A.1.B.1').state).toBe('over');
  });

  test('capacity is only judged when every bin of the SKU has one', () => {
    const states = binStates([
      row('A.1.A.1', 'TEE', { qty_on_hand: 60, max_qty: 30 }),
      row('A.1.B.1', 'TEE', { qty_on_hand: 60, max_qty: null, slot: 'overflow' }),
    ]);
    expect(states.get('A.1.A.1').state).toBe('stocked');
  });
});

describe('matchBins', () => {
  const rows = [row('A.1.A.1', 'AS-5001-NAV-L', { name: 'Staple Tee Navy L' }), row('C.4.D.2', 'CAP-5PNL-BLK', { name: '5-Panel Cap Black' })];

  test('finds bins by SKU, by name, or by the start of a bin code', () => {
    expect([...matchBins(rows, 'nav')]).toEqual(['A.1.A.1']);
    expect([...matchBins(rows, 'cap black')]).toEqual(['C.4.D.2']);
    expect([...matchBins(rows, 'c.4')]).toEqual(['C.4.D.2']);
  });

  test('an empty query matches nothing', () => {
    expect(matchBins(rows, '  ').size).toBe(0);
  });
});

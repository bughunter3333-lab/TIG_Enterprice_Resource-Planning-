/**
 * The racking, as the owner drew it (2026-10-10):
 *   aisles E D C B A left to right, standing at receiving
 *   bays 1–10 per aisle; odd bays on the right walking up the aisle,
 *   even bays facing them on the left, bays 1 and 2 at the receiving end
 *   levels A (floor) up to L, on orange beams carrying A–C, D–F, G–I, J–L,
 *   closed by an orange beam on top, with an open shelf above it for excess boxes
 *   six boxes across each level
 */
import { DEFAULT_LAYOUT, allCells, binPlacement, validateLayout } from '../layout';

const L = DEFAULT_LAYOUT;

describe('binPlacement', () => {
  test('reads aisle, bay, level and position from the code', () => {
    const p = binPlacement(L, 'A.1.C.4');
    expect(p).toMatchObject({ ok: true, aisle: 'A', bay: 1, level: 'C', levelIndex: 2, position: 4 });
  });

  test('odd bays are on the right of the aisle, even bays face them on the left', () => {
    const odd = binPlacement(L, 'B.3.A.1');
    const even = binPlacement(L, 'B.4.A.1');
    expect(odd.side).toBe('right');
    expect(even.side).toBe('left');
    expect(odd.x).toBeGreaterThan(even.x);
    // Bays 3 and 4 face each other across the aisle: same distance from receiving.
    expect(odd.z).toBeCloseTo(even.z);
  });

  test('bays run away from receiving: bay 9 is further in than bay 1', () => {
    expect(binPlacement(L, 'A.9.A.1').z).toBeLessThan(binPlacement(L, 'A.1.A.1').z);
  });

  test('aisles run E to A left to right', () => {
    const xs = ['E', 'D', 'C', 'B', 'A'].map((a) => binPlacement(L, `${a}.1.A.1`).x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  test('levels go up from A at the floor; a new beam is a bigger step than a row on the same beam', () => {
    const y = (lvl) => binPlacement(L, `A.1.${lvl}.1`).y;
    const row = y('B') - y('A');
    expect(y('C')).toBeGreaterThan(y('A'));
    // C→D, F→G and I→J each cross onto the next beam.
    for (const [lo, hi] of [['C', 'D'], ['F', 'G'], ['I', 'J']]) expect(y(hi) - y(lo)).toBeGreaterThan(row + 0.01);
    // J, K and L share the top beam: no beam between them.
    expect(y('L') - y('K')).toBeCloseTo(row);
  });

  test('anything outside the layout says why', () => {
    expect(binPlacement(L, 'A-01-04')).toEqual({ ok: false, reason: 'format' });
    expect(binPlacement(L, 'F.1.A.1')).toEqual({ ok: false, reason: 'aisle' });
    expect(binPlacement(L, 'A.11.A.1')).toEqual({ ok: false, reason: 'bay' });
    expect(binPlacement(L, 'A.1.M.1')).toEqual({ ok: false, reason: 'level' });
    expect(binPlacement(L, 'A.1.A.7')).toEqual({ ok: false, reason: 'position' });
  });
});

describe('allCells', () => {
  test('one cell per box in the racking, each with its own code', () => {
    const cells = allCells(L);
    expect(cells).toHaveLength(5 * 10 * 12 * 6); // 12 levels = four beams of three
    expect(new Set(cells.map((c) => c.code)).size).toBe(cells.length);
    expect(cells.find((c) => c.code === 'E.10.L.6')).toBeTruthy();
  });
});

describe('validateLayout', () => {
  test('a stored layout round-trips', () => {
    expect(validateLayout(JSON.stringify(L))).toEqual({ layout: L, errors: [] });
  });

  test('rows per beam must add up to at most 26 levels (A–Z)', () => {
    expect(validateLayout({ ...L, beams: [10, 10, 10] }).errors.length).toBeGreaterThan(0);
  });

  test('a broken one falls back to the default and says what was wrong', () => {
    const { layout, errors } = validateLayout('{"aisles": [], "beams": [99]}');
    expect(layout).toEqual(L);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('the open excess shelf on top is part of the layout', () => {
    expect(L.excessShelf).toBe(true);
    expect(validateLayout({ ...L, excessShelf: 'yes' }).errors.length).toBeGreaterThan(0);
  });

  test('nothing stored is not an error', () => {
    expect(validateLayout(null)).toEqual({ layout: L, errors: [] });
  });
});

import { DEFAULT_LAYOUT as L, SIZE, allCells, binPlacement, levelY } from '../layout';
import { SECTION_COLORS } from '../binColors';
import {
  boxCount, companiesAtBay, holds, overlaps, sectionBays, sectionBetween, sectionColors, sectionFor, sectionShape,
  sectionSpot, sectionWords,
} from '../sections';

const between = (a, b, options) => {
  const s = sectionBetween(L, a, b, options);
  expect(s.ok).toBe(true);
  return s;
};
const cellsIn = (section) => allCells(L).filter((c) => holds(section, c)).map((c) => c.code);

describe('sectionBetween', () => {
  test('two boxes are opposite corners, in whichever order they are given', () => {
    const s = between('B.7.F.2', 'B.3.A.4');
    expect(s).toMatchObject({
      aisle: 'B', bay_from: 3, position_from: 4, bay_to: 7, position_to: 2, level_from: 'A', level_to: 'F',
      from_bin: 'B.3.A.4', to_bin: 'B.7.F.2',
    });
    expect(between('B.3.A.4', 'B.7.F.2')).toEqual(s);
    // The corners can be the other diagonal: far and low, near and high.
    expect(between('B.7.A.2', 'B.3.F.4')).toEqual(s);
  });

  test('one box by itself is a section of one box', () => {
    expect(cellsIn(between('B.3.C.4', 'B.3.C.4'))).toEqual(['B.3.C.4']);
  });

  test('codes are read as the map reads them, however they were typed', () => {
    expect(between('b.03.a.01', 'B.3.A.1').from_bin).toBe('B.3.A.1');
  });

  test('whole bays takes in every box of the bays touched; all levels every level', () => {
    const s = between('B.3.D.4', 'B.5.E.2', { wholeBays: true, allLevels: true });
    expect(s).toMatchObject({ from_bin: 'B.3.A.1', to_bin: `B.5.L.${L.positions}` });
    expect(cellsIn(s)).toHaveLength(2 * L.positions * 12);
    const bays = between('B.3.D.4', 'B.5.E.2', { wholeBays: true });
    expect(bays).toMatchObject({ from_bin: 'B.3.D.1', to_bin: `B.5.E.${L.positions}` });
  });

  test('says which corner is not a box in this racking, and why', () => {
    expect(sectionBetween(L, 'A-01-04', 'B.3.A.1')).toEqual({ ok: false, corner: 'from', reason: 'format' });
    expect(sectionBetween(L, 'B.3.A.1', 'B.99.A.1')).toEqual({ ok: false, corner: 'to', reason: 'bay' });
    expect(sectionBetween(L, 'B.3.A.1', '')).toEqual({ ok: false, corner: 'to', reason: 'format' });
  });

  test('a section is on one rack face: not across two aisles, and not across the walkway', () => {
    expect(sectionBetween(L, 'B.3.A.1', 'C.3.A.1')).toEqual({ ok: false, reason: 'aisles' });
    expect(sectionBetween(L, 'B.3.A.1', 'B.4.A.1')).toEqual({ ok: false, reason: 'sides' });
  });
});

describe('what a section holds', () => {
  const s = between('B.3.B.4', 'B.7.C.2');

  test('runs along the face bay by bay — the end of one bay, all of the next, the start of the last', () => {
    const codes = cellsIn(s);
    const levelB = codes.filter((c) => c.includes('.B.'));
    expect(levelB).toEqual([
      'B.3.B.4', 'B.3.B.5', 'B.3.B.6',
      'B.5.B.1', 'B.5.B.2', 'B.5.B.3', 'B.5.B.4', 'B.5.B.5', 'B.5.B.6',
      'B.7.B.1', 'B.7.B.2',
    ]);
    expect(codes).toHaveLength(22);
    expect(boxCount(L, s)).toBe(22);
  });

  test('not the bays facing it across the walkway, nor the same bays in another aisle', () => {
    expect(holds(s, binPlacement(L, 'B.4.B.4'))).toBe(false);
    expect(holds(s, binPlacement(L, 'B.6.B.1'))).toBe(false);
    expect(holds(s, binPlacement(L, 'C.5.B.1'))).toBe(false);
    expect(holds(s, binPlacement(L, 'B.5.D.1'))).toBe(false);
    expect(holds(s, binPlacement(L, 'B.5.A.1'))).toBe(false);
  });

  test('boxCount agrees with counting the boxes, for whole bays and for part of one', () => {
    for (const [a, b, options] of [
      ['B.1.A.1', 'B.9.L.6', {}], ['E.2.C.3', 'E.2.C.5', {}], ['A.4.B.6', 'A.10.K.1', {}], ['C.3.D.4', 'C.5.E.2', { wholeBays: true, allLevels: true }],
    ]) {
      const section = between(a, b, options);
      expect(boxCount(L, section)).toBe(cellsIn(section).length);
    }
  });

  test('sectionFor finds the section a box is in', () => {
    const other = { ...between('C.1.A.1', 'C.1.L.6'), id: 2 };
    const mine = { ...s, id: 1 };
    expect(sectionFor([other, mine], binPlacement(L, 'B.5.C.3'))).toBe(mine);
    expect(sectionFor([other, mine], binPlacement(L, 'B.9.C.3'))).toBeNull();
    expect(sectionFor(undefined, binPlacement(L, 'B.5.C.3'))).toBeNull();
  });

  test('sectionBays lists every second bay from the first to the last', () => {
    expect(sectionBays(s)).toEqual([3, 5, 7]);
    expect(sectionBays(between('B.4.A.1', 'B.4.A.2'))).toEqual([4]);
  });
});

describe('overlaps', () => {
  const s = between('B.3.B.4', 'B.7.C.2');

  test('two sections that share a box overlap, whichever is asked of which', () => {
    for (const [a, b] of [['B.7.C.2', 'B.9.F.1'], ['B.5.A.1', 'B.5.B.1'], ['B.3.B.4', 'B.7.C.2'], ['B.1.A.1', 'B.9.L.6'], ['B.5.C.3', 'B.5.C.3']]) {
      const other = between(a, b);
      expect(overlaps(s, other)).toBe(true);
      expect(overlaps(other, s)).toBe(true);
    }
  });

  test('neighbours that share no box do not — it agrees with holds for every pair tried', () => {
    const others = [
      ['B.7.C.3', 'B.9.F.1'],   // starts at the very next box along
      ['B.3.B.1', 'B.3.C.3'],   // ends at the box before
      ['B.3.D.1', 'B.7.L.6'],   // the levels above
      ['B.3.A.1', 'B.7.A.6'],   // the level below
      ['B.4.A.1', 'B.8.L.6'],   // the facing side
      ['C.3.B.4', 'C.7.C.2'],   // the same bays in the next aisle
    ].map(([a, b]) => between(a, b));
    for (const other of others) {
      expect(overlaps(s, other)).toBe(false);
      expect(overlaps(other, s)).toBe(false);
      expect(cellsIn(other).some((code) => cellsIn(s).includes(code))).toBe(false);
    }
  });
});

describe('sectionShape', () => {
  test('spans its boxes edge to edge on the face, and bottom to top', () => {
    const s = between('B.3.B.1', 'B.5.C.6');
    const shape = sectionShape(L, s);
    const from = binPlacement(L, 'B.3.B.1');
    const to = binPlacement(L, 'B.5.C.6');
    expect(shape).toMatchObject({ aisleIndex: 3, side: 'right', x: from.x });
    expect(shape.z[0]).toBeCloseTo(from.z + SIZE.box / 2);
    expect(shape.z[1]).toBeCloseTo(to.z - SIZE.box / 2);
    expect(shape.y[0]).toBeCloseTo(levelY(L, 1) - SIZE.level / 2);
    expect(shape.y[1]).toBeCloseTo(levelY(L, 2) + SIZE.level / 2);
    // Every box it holds is inside the rectangle; the next one along is not.
    for (const code of cellsIn(s)) {
      const p = binPlacement(L, code);
      expect(p.z).toBeLessThan(shape.z[0]);
      expect(p.z).toBeGreaterThan(shape.z[1]);
    }
    expect(binPlacement(L, 'B.7.B.1').z).toBeLessThan(shape.z[1]);
  });

  test('a section that no longer fits the racking has no shape', () => {
    const s = between('B.3.B.1', 'B.9.C.6');
    expect(sectionShape({ ...L, baysPerAisle: 6 }, s)).toBeNull();
    expect(sectionShape({ ...L, aisles: ['A'] }, s)).toBeNull();
    expect(sectionShape(L, { ...s, from_bin: 'nonsense' })).toBeNull();
  });

  test('the spot to see it from is on its aisle’s line, level with its middle, facing its side', () => {
    const shape = sectionShape(L, between('B.4.A.1', 'B.4.L.6'));
    const spot = sectionSpot(L, shape);
    expect(spot).toMatchObject({ aisleIndex: 3, side: 'left' });
    expect(spot.z).toBeCloseTo((shape.z[0] + shape.z[1]) / 2);
  });
});

describe('sectionWords', () => {
  test('whole bays on every level', () => {
    expect(sectionWords(L, between('B.3.A.1', 'B.7.L.6'))).toBe('Aisle B, right-hand side · bays 3, 5, 7 · all levels');
    expect(sectionWords(L, between('B.4.A.1', 'B.4.L.6'))).toBe('Aisle B, left-hand side · bay 4 · all levels');
  });

  test('a long run of bays says which side’s numbers it means', () => {
    const wide = { ...L, baysPerAisle: 20 };
    expect(sectionWords(wide, sectionBetween(wide, 'B.2.A.1', 'B.18.L.6'))).toBe('Aisle B, left-hand side · bays 2 to 18 (even) · all levels');
  });

  test('part of a bay, and some of the levels', () => {
    expect(sectionWords(L, between('B.3.B.4', 'B.7.C.2'))).toBe('Aisle B, right-hand side · bay 3 box 4 to bay 7 box 2 · levels B–C');
    expect(sectionWords(L, between('B.3.C.1', 'B.3.C.6'))).toBe('Aisle B, right-hand side · bay 3 · level C');
  });
});

describe('sectionColors', () => {
  const rows = [
    { id: 5, customer_id: 'CUST002' }, { id: 2, customer_id: 'CUST001' }, { id: 9, customer_id: 'CUST001' }, { id: 7, customer_id: 'CUST003' },
  ];

  test('one colour per company, shared by all its sections, in the order they were first marked', () => {
    const colors = sectionColors(rows);
    expect([...colors.keys()]).toEqual(['CUST001', 'CUST002', 'CUST003']);
    expect(colors.get('CUST001')).toBe(SECTION_COLORS[0]);
    expect(colors.get('CUST002')).toBe(SECTION_COLORS[1]);
    expect(new Set(colors.values()).size).toBe(3);
  });

  test('a new company does not change the colours the others have', () => {
    const before = sectionColors(rows);
    const after = sectionColors([...rows, { id: 12, customer_id: 'CUST000' }]);
    for (const [id, color] of before) expect(after.get(id)).toBe(color);
  });

  test('more companies than colours go round again', () => {
    const many = Array.from({ length: SECTION_COLORS.length + 1 }, (_, i) => ({ id: i + 1, customer_id: `C${i}` }));
    expect(sectionColors(many).get(`C${SECTION_COLORS.length}`)).toBe(SECTION_COLORS[0]);
    expect(sectionColors(undefined).size).toBe(0);
  });
});

describe('companiesAtBay', () => {
  test('names the companies with any of a bay, once each, and not the bay facing it', () => {
    const rows = [
      { ...between('B.3.A.1', 'B.7.C.6'), customer_name: 'Zone Bowling' },
      { ...between('B.5.D.1', 'B.5.L.6'), customer_name: 'Acme Hire' },
      { ...between('B.3.D.1', 'B.3.D.2'), customer_name: 'Zone Bowling' },
    ];
    expect(companiesAtBay(rows, 'B', 5)).toEqual(['Zone Bowling', 'Acme Hire']);
    expect(companiesAtBay(rows, 'B', 3)).toEqual(['Zone Bowling']);
    expect(companiesAtBay(rows, 'B', 4)).toEqual([]);
    expect(companiesAtBay(rows, 'C', 5)).toEqual([]);
    expect(companiesAtBay(undefined, 'B', 5)).toEqual([]);
  });
});

describe('rules that hold beyond the default racking', () => {
  test('along a face is bay then box, even with ten or more boxes on a level', () => {
    const wide = { ...L, positions: 12 };
    const s = sectionBetween(wide, 'B.3.A.11', 'B.5.A.2');
    expect(s.ok).toBe(true);
    const inside = ['B.3.A.11', 'B.3.A.12', 'B.5.A.1', 'B.5.A.2'];
    const outside = ['B.3.A.10', 'B.5.A.3', 'B.5.A.11', 'B.7.A.1'];
    for (const code of inside) expect(holds(s, binPlacement(wide, code))).toBe(true);
    for (const code of outside) expect(holds(s, binPlacement(wide, code))).toBe(false);
    expect(boxCount(wide, s)).toBe(4);
    expect(overlaps(s, sectionBetween(wide, 'B.5.A.3', 'B.5.A.12'))).toBe(false);
    expect(overlaps(s, sectionBetween(wide, 'B.5.A.2', 'B.5.A.12'))).toBe(true);
  });

  test('a section the server stored with a two-letter level compares here as it does there', () => {
    // Only the API can make one; the map draws none. It still has to be respected.
    const tall = { id: 9, customer_id: 'C1', customer_name: 'Tall', aisle: 'B', bay_from: 1, position_from: 1, bay_to: 9, position_to: 6, level_from: 'A', level_to: 'AA', from_bin: 'B.1.A.1', to_bin: 'B.9.AA.6' };
    const under = between('B.3.C.1', 'B.3.C.6');
    expect(overlaps(under, tall)).toBe(true);
    expect(overlaps(tall, under)).toBe(true);
    expect(holds(tall, binPlacement(L, 'B.3.L.1'))).toBe(true);
    expect(sectionFor([tall], binPlacement(L, 'B.3.C.1'))).toBe(tall);
    // Level AB is above Z, not level A.
    const high = { ...tall, level_from: 'AB', level_to: 'AB', from_bin: 'B.1.AB.1', to_bin: 'B.9.AB.6' };
    expect(overlaps(between('B.3.A.1', 'B.3.A.6'), high)).toBe(false);
    expect(holds(high, binPlacement(L, 'B.3.A.1'))).toBe(false);
  });
});

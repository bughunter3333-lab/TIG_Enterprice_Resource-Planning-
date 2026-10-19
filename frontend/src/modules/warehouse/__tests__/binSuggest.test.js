import { DEFAULT_LAYOUT as L, allCells, binPlacement } from '../layout';
import { asTyped, suggestBins } from '../binSuggest';

const levels = 'ABCDEFGHIJKL'.split('');

describe('suggestBins', () => {
  test('an aisle letter offers the first box of that aisle', () => {
    expect(suggestBins(L, 'B')).toEqual(['B.1.A.1']);
    expect(suggestBins(L, 'b')).toEqual(['B.1.A.1']);
  });

  test('after the aisle, one for each bay', () => {
    expect(suggestBins(L, 'B.')).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map((bay) => `B.${bay}.A.1`));
  });

  test('a bay being typed offers the bays it could become', () => {
    expect(suggestBins(L, 'B.2')).toEqual(['B.2.A.1']);
    expect(suggestBins(L, 'B.1')).toEqual(['B.1.A.1', 'B.10.A.1']);
  });

  test('after the bay, one for each level; after the level, one for each box', () => {
    expect(suggestBins(L, 'B.2.')).toEqual(levels.map((level) => `B.2.${level}.1`));
    expect(suggestBins(L, 'b.2.c')).toEqual(['B.2.C.1']);
    expect(suggestBins(L, 'B.2.C.')).toEqual([1, 2, 3, 4, 5, 6].map((box) => `B.2.C.${box}`));
  });

  test('a whole code offers itself, so it can be seen to be real', () => {
    expect(suggestBins(L, 'b.2.c.4')).toEqual(['B.2.C.4']);
    expect(suggestBins(L, ' E.10.L.6 ')).toEqual(['E.10.L.6']);
  });

  test('numbers typed with noughts in front are the same numbers', () => {
    expect(suggestBins(L, 'b.03.h.01')).toEqual(['B.3.H.1']);
    expect(suggestBins(L, 'B.03')).toEqual(['B.3.A.1']);
    // A nought alone could be the start of any padded bay.
    expect(suggestBins(L, 'B.0')).toHaveLength(10);
  });

  test('text that leads to no box in the racking offers nothing', () => {
    for (const text of ['dasdas', 'Q', 'Q.1', 'B.11', 'B.44.A.1', 'B.2.M', 'B.2.C.7', 'B.2.C.4.', 'B.2.C.4.1', 'B..1', 'B.x', 'B.2.3', '.', 'A-01-04', 'B 2']) {
      expect(suggestBins(L, text)).toEqual([]);
    }
  });

  test('nothing typed, or no racking to go by, offers nothing', () => {
    expect(suggestBins(L, '')).toEqual([]);
    expect(suggestBins(L, '   ')).toEqual([]);
    expect(suggestBins(L, null)).toEqual([]);
    expect(suggestBins(null, 'B')).toEqual([]);
  });

  test('it is the racking of the branch that counts', () => {
    const small = { ...L, aisles: ['A', 'AA'], baysPerAisle: 2, beams: [2], positions: 3 };
    expect(suggestBins(small, 'a')).toEqual(['A.1.A.1', 'AA.1.A.1']);
    expect(suggestBins(small, 'A.')).toEqual(['A.1.A.1', 'A.2.A.1']);
    expect(suggestBins(small, 'A.2.')).toEqual(['A.2.A.1', 'A.2.B.1']);
    expect(suggestBins(small, 'B')).toEqual([]);
    expect(suggestBins(small, 'A.3')).toEqual([]);
  });

  test('everything it offers is a real box, and every real box is offered for itself and for each of its beginnings', () => {
    const real = new Set(allCells(L).map((cell) => cell.code));
    for (const code of ['E.1.A.1', 'B.5.H.3', 'A.10.L.6', 'C.2.F.4']) {
      for (let cut = 1; cut <= code.length; cut += 1) {
        const offered = suggestBins(L, code.slice(0, cut));
        expect(offered.length).toBeGreaterThan(0);
        for (const one of offered) {
          expect(real.has(one)).toBe(true);
          expect(binPlacement(L, one).ok).toBe(true);
        }
      }
      expect(suggestBins(L, code)).toEqual([code]);
    }
  });
});

describe('asTyped', () => {
  test('capitals while what is typed leads to a real box', () => {
    expect(asTyped(L, 'b')).toBe('B');
    expect(asTyped(L, 'b.2.')).toBe('B.2.');
    expect(asTyped(L, 'b.2.c.4')).toBe('B.2.C.4');
    expect(asTyped(L, 'B.2.c.4')).toBe('B.2.C.4');
  });

  test('small letters when it does not, even if it was typed in capitals', () => {
    expect(asTyped(L, 'dasdas')).toBe('dasdas');
    expect(asTyped(L, 'Q.1')).toBe('q.1');
    expect(asTyped(L, 'B.44.A.1')).toBe('b.44.a.1');
    expect(asTyped(L, 'B.2.C.4x')).toBe('b.2.c.4x');
  });

  test('the text keeps its length, so the caret keeps its place', () => {
    for (const text of ['b.2.c', 'Straße 4', 'İstanbul', 'B.2.C.4.']) expect(asTyped(L, text)).toHaveLength(text.length);
  });

  test('with no racking to judge by, what was typed is left alone', () => {
    expect(asTyped(null, 'b.2.C')).toBe('b.2.C');
    expect(asTyped(L, '')).toBe('');
    expect(asTyped(L, null)).toBe('');
  });
});

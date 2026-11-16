import { DEFAULT_LAYOUT as L } from '../../warehouse/layout';
import { binProblem, rowProblems, sameBin, storedBinProblems } from '../locationRules';

const draft = (over = {}) => ({ zone: '', primary_bin_1: '', max_qty_bin_1: '', primary_bin_2: '', max_qty_bin_2: '', ...over });
const texts = (list) => list.map((p) => p.text);

describe('binProblem', () => {
  test('a box in the racking is fine, however its code is typed', () => {
    expect(binProblem(L, 'B.3.H.1')).toBeNull();
    expect(binProblem(L, ' e.10.l.06 ')).toBeNull();
  });

  test('nothing typed is not a problem: a position need not have a bin', () => {
    expect(binProblem(L, '')).toBeNull();
    expect(binProblem(L, '   ')).toBeNull();
    expect(binProblem(L, null)).toBeNull();
  });

  test('text that is not a code says what a code looks like', () => {
    for (const text of ['dasdas', 'A-01-04', 'B.3.Hx', 'B.3.H.1.2', 'Shelf 4']) {
      expect(binProblem(L, text)).toBe('is not an aisle.bay.level.box code, like B.3.H.1');
    }
  });

  test('a code for a box the racking has not got names the part, and what there is', () => {
    expect(binProblem(L, 'Q.1.A.1')).toBe('is not in this racking: there is no aisle Q (aisles E, D, C, B, A)');
    expect(binProblem(L, 'B.11.A.1')).toBe('is not in this racking: there is no bay 11 (bays 1 to 10)');
    expect(binProblem(L, 'B.1.M.1')).toBe('is not in this racking: there is no level M (levels A to L)');
    expect(binProblem(L, 'B.1.A.7')).toBe('is not in this racking: there is no box 7 on a level (boxes 1 to 6)');
    expect(binProblem(L, 'B.0.A.1')).not.toBeNull();
  });

  test('it is the branch racking that counts, not the default one', () => {
    const small = { ...L, aisles: ['A'], baysPerAisle: 2, beams: [2], positions: 3 };
    expect(binProblem(small, 'A.2.B.3')).toBeNull();
    expect(binProblem(small, 'B.3.H.1')).toBe('is not in this racking: there is no aisle B (aisles A)');
    expect(binProblem(small, 'A.2.C.1')).toBe('is not in this racking: there is no level C (levels A to B)');
  });

  test('the start of a real location is unfinished, not wrong', () => {
    for (const text of ['b', 'B.', 'B.2', 'b.2.', 'B.2.C', 'B.2.C.']) {
      expect(binProblem(L, text)).toBe('is not a whole location yet — finish it, or choose one from the list');
    }
    // The start of nothing real is simply not a code.
    expect(binProblem(L, 'Q.')).toBe('is not an aisle.bay.level.box code, like B.3.H.1');
    expect(binProblem(L, 'B.44.')).toBe('is not an aisle.bay.level.box code, like B.3.H.1');
  });

  test('until the racking is known only the shape of the code is judged', () => {
    expect(binProblem(null, 'Q.99.Z.99')).toBeNull();
    expect(binProblem(null, 'dasdas')).toBe('is not an aisle.bay.level.box code, like B.3.H.1');
  });
});

describe('sameBin', () => {
  test('one box however it is typed; old text only when it is the same text', () => {
    expect(sameBin('B.3.H.1', 'b.03.h.01')).toBe(true);
    expect(sameBin('B.3.H.1', 'B.3.H.2')).toBe(false);
    expect(sameBin('A-01-04', ' a-01-04 ')).toBe(true);
    expect(sameBin('A-01-04', 'A-01-05')).toBe(false);
    expect(sameBin('A-01-04', 'A.1.A.4')).toBe(false);
    expect(sameBin('', '')).toBe(false);
    expect(sameBin(null, 'B.3.H.1')).toBe(false);
  });
});

describe('rowProblems', () => {
  test('a row with real boxes and sensible capacities has none', () => {
    expect(rowProblems(L, draft({ zone: 'Front', primary_bin_1: 'B.3.H.1', max_qty_bin_1: '60', primary_bin_2: 'B.3.H.2', max_qty_bin_2: '' }), null)).toEqual([]);
    expect(rowProblems(L, draft(), null)).toEqual([]);
  });

  test('each bin is judged and named', () => {
    const found = rowProblems(L, draft({ primary_bin_1: 'dasdas', primary_bin_2: 'B.44.A.1' }), null);
    expect(found.map((p) => p.field)).toEqual(['primary_bin_1', 'primary_bin_2']);
    expect(texts(found)).toEqual([
      'Primary bin 1 “dasdas” is not an aisle.bay.level.box code, like B.3.H.1.',
      'Primary bin 2 “B.44.A.1” is not in this racking: there is no bay 44 (bays 1 to 10).',
    ]);
  });

  test('a bin left exactly as it is on file is not judged, so the rest of its row can be saved', () => {
    const stored = { primary_bin_1: 'A-01-04', primary_bin_2: 'B.44.A.1' };
    expect(rowProblems(L, draft({ zone: 'Front', primary_bin_1: 'A-01-04', primary_bin_2: 'b.44.a.1' }), stored)).toEqual([]);
    // Changed to something else that is not a box, it is.
    expect(texts(rowProblems(L, draft({ primary_bin_1: 'A-01-05', primary_bin_2: 'B.44.A.1' }), stored))).toEqual([
      'Primary bin 1 “A-01-05” is not an aisle.bay.level.box code, like B.3.H.1.',
    ]);
  });

  test('one box cannot be both bins', () => {
    const found = rowProblems(L, draft({ primary_bin_1: 'B.3.H.1', primary_bin_2: 'b.03.h.01' }), null);
    expect(found).toHaveLength(1);
    expect(found[0].field).toBe('primary_bin_2');
    expect(found[0].text).toMatch(/^Primary bin 2 is the same box as primary bin 1\./);
  });

  test('a capacity is a whole number a bin could hold, or empty', () => {
    for (const bad of ['-1', '2.5', '100001', 'lots']) {
      expect(texts(rowProblems(L, draft({ max_qty_bin_1: bad }), null))).toEqual(['Max qty 1 must be a whole number from 0 to 100,000, or empty.']);
    }
    expect(texts(rowProblems(L, draft({ max_qty_bin_2: '-3' }), null))).toEqual(['Max qty 2 must be a whole number from 0 to 100,000, or empty.']);
    expect(rowProblems(L, draft({ max_qty_bin_1: '0', max_qty_bin_2: '100000' }), null)).toEqual([]);
  });

  test('a zone longer than the record holds', () => {
    expect(texts(rowProblems(L, draft({ zone: 'Z'.repeat(21) }), null))).toEqual(['Zone is at most 20 characters.']);
    expect(rowProblems(L, draft({ zone: 'Z'.repeat(20) }), null)).toEqual([]);
  });
});

describe('storedBinProblems', () => {
  test('lists the bins on file that are not boxes in the racking', () => {
    const found = storedBinProblems(L, { primary_bin_1: 'dasdas', primary_bin_2: 'B.3.H.1' });
    expect(found).toEqual([{ field: 'primary_bin_1', label: 'Primary bin 1', value: 'dasdas', text: 'is not an aisle.bay.level.box code, like B.3.H.1' }]);
    expect(storedBinProblems(L, { primary_bin_1: 'B.3.H.1', primary_bin_2: null })).toEqual([]);
    expect(storedBinProblems(L, undefined)).toEqual([]);
  });
});

describe('rules the server holds the same way', () => {
  test('a row whose two bins are already one box can be saved while they are left as they stand', () => {
    for (const [first, second] of [['B.3.H.1', 'b.03.h.01'], ['dasdas', 'dasdas']]) {
      const stored = { primary_bin_1: first, primary_bin_2: second };
      expect(rowProblems(L, draft({ zone: 'Front', primary_bin_1: first, primary_bin_2: second, max_qty_bin_1: '5' }), stored)).toEqual([]);
    }
  });

  test('but changing a bin on to the other is still refused', () => {
    const stored = { primary_bin_1: 'B.3.H.1', primary_bin_2: 'B.3.H.2' };
    expect(rowProblems(L, draft({ primary_bin_1: 'B.3.H.1', primary_bin_2: 'B.3.H.1' }), stored).map((p) => p.field)).toEqual(['primary_bin_2']);
    expect(rowProblems(L, draft({ primary_bin_1: 'B.3.H.2', primary_bin_2: 'B.3.H.2' }), stored).map((p) => p.field)).toEqual(['primary_bin_2']);
    // And on a row with nothing on file.
    expect(rowProblems(L, draft({ primary_bin_1: 'B.3.H.1', primary_bin_2: 'B.3.H.1' }), null)).toHaveLength(1);
  });

  test('an old code with bay nought is text, so retyped differently it is another text', () => {
    expect(sameBin('A.0.B.1', 'a.0.b.1')).toBe(true);
    expect(sameBin('A.0.B.1', 'a.00.b.01')).toBe(false);
    expect(sameBin('A.1.B.0', 'A.1.B.00')).toBe(false);
    const stored = { primary_bin_1: 'A.0.B.1' };
    expect(rowProblems(L, draft({ primary_bin_1: 'a.0.b.1', zone: 'Z' }), stored)).toEqual([]);
    expect(rowProblems(L, draft({ primary_bin_1: 'a.00.b.01' }), stored)).toHaveLength(1);
  });
});

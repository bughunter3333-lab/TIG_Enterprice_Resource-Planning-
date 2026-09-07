/**
 * The bin sort is the difference between one pass down an aisle and a random
 * walk, so the ordering is asserted directly rather than through a document.
 *
 * The bay is the case worth guarding: an aisle is ten bays deep, and the whole
 * scheme sorts correctly by string right up until bay 10 exists.
 */
import { describe, expect, test } from 'vitest';
import { parseBin, compareBins } from '../binLocation';

const sorted = (bins) => [...bins].sort(compareBins);

describe('parseBin', () => {
  test('splits a code into aisle, bay, level and position', () => {
    expect(parseBin('B.3.H.1')).toEqual({ aisle: 'B', bay: 3, level: 'H', position: 1 });
  });

  test('reads a two-digit bay as a number, not as text', () => {
    expect(parseBin('B.10.A.1').bay).toBe(10);
  });

  test('refuses anything that is not a location', () => {
    expect(parseBin('A-01-04')).toBeNull();   // the format the seed used to invent
    expect(parseBin('Bin A3')).toBeNull();
    expect(parseBin('')).toBeNull();
    expect(parseBin(null)).toBeNull();
  });
});

describe('walk order', () => {
  test('bay 10 comes after bay 2, not before it', () => {
    expect(sorted(['B.10.A.1', 'B.2.A.1', 'B.1.A.1']))
      .toEqual(['B.1.A.1', 'B.2.A.1', 'B.10.A.1']);
  });

  test('aisles are walked one at a time', () => {
    expect(sorted(['C.1.A.1', 'A.9.A.1', 'B.5.A.1']))
      .toEqual(['A.9.A.1', 'B.5.A.1', 'C.1.A.1']);
  });

  test('within a bay, position leads and level follows', () => {
    // Height is a reach, not a walk, so two bins at the same position are
    // taken together however far apart they are vertically.
    expect(sorted(['B.3.A.2', 'B.3.J.1', 'B.3.A.1']))
      .toEqual(['B.3.A.1', 'B.3.J.1', 'B.3.A.2']);
  });

  test('unrecognised and empty bins collect at the end', () => {
    expect(sorted(['', 'B.2.A.1', 'Bin A3', 'A.1.A.1']))
      .toEqual(['A.1.A.1', 'B.2.A.1', '', 'Bin A3']);
  });

  test('the order does not depend on the letters being uppercase', () => {
    expect(compareBins('b.3.h.1', 'B.3.H.1')).toBe(0);
  });
});

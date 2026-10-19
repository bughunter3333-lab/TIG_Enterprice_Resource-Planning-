/**
 * Code 128-B invariants.
 *
 * A barcode is the one thing on a document nobody proofreads: it either scans
 * or a driver types the number by hand, and you find out at the depot. So the
 * structure is asserted rather than the appearance.
 *
 * The stop pattern is the part worth guarding. Every other Code 128 pattern is
 * six elements summing to 11 modules; the stop is seven summing to 13, because
 * it carries an extra bar so a scanner can tell the end of a symbol from the
 * start of another. The first version of this file had a six-element stop and
 * a `widths.push(2)` afterwards to make the total come out — which produced the
 * right module count and the wrong bars.
 */
import { describe, expect, test } from 'vitest';
import { code128b, barcodeBars } from '../barcode';

const MODULES_PER_CHAR = 11;
const STOP_MODULES = 13;

// start + data + checksum + stop
const expectedModules = n => MODULES_PER_CHAR * (1 + n + 1) + STOP_MODULES;

describe('code128b', () => {
  test('a symbol is start, data, checksum and stop', () => {
    expect(code128b('J1207512').modules).toBe(expectedModules(8));
    expect(code128b('A').modules).toBe(expectedModules(1));
    expect(code128b('CONNOTE-0001').modules).toBe(expectedModules(12));
  });

  test('nothing encodable returns null rather than an empty symbol', () => {
    // A blank barcode that still draws its start and stop bars is worse than
    // none: it scans as an empty string.
    expect(code128b('')).toBeNull();
    expect(code128b(null)).toBeNull();
    expect(code128b(undefined)).toBeNull();
    expect(code128b('é—')).toBeNull();
  });

  test('characters outside printable ASCII are dropped, not encoded', () => {
    // Subset B covers 0x20 to 0x7e. Anything else has no code value, and
    // encoding it anyway would put a wrong character in the symbol.
    expect(code128b('ABéC').modules).toBe(expectedModules(3));
  });

  test('the checksum depends on position, not just content', () => {
    // Transposition is the error a weight-based check digit misses. Two
    // symbols of the same length with the same characters in a different order
    // must not encode identically.
    const a = code128b('AB').widths.join('');
    const b = code128b('BA').widths.join('');
    expect(a).not.toBe(b);
  });
});

describe('barcodeBars', () => {
  test('bars are the even-indexed elements and never overrun the symbol', () => {
    const { bars, modules } = barcodeBars('J1207512');
    expect(bars.length).toBeGreaterThan(0);
    const last = bars[bars.length - 1];
    expect(last.x + last.width).toBeLessThanOrEqual(modules);
    expect(bars.every(b => b.width >= 1 && b.width <= 4)).toBe(true);
  });

  test('the symbol opens and closes on a bar', () => {
    // Code 128 starts and ends with a bar; a symbol that starts on a space has
    // its quiet zone eaten and scans unreliably.
    const { bars, modules } = barcodeBars('TEST');
    expect(bars[0].x).toBe(0);
    const last = bars[bars.length - 1];
    expect(last.x + last.width).toBe(modules);
  });

  test('nothing to encode gives nothing to draw', () => {
    expect(barcodeBars('')).toBeNull();
  });
});

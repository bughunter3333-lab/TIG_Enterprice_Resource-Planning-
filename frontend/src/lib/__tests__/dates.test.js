import { addDays, dayKey, daysBetween, formatDay, isoDay, todayKey } from '../dates';

// A moment that is 26 Sep in Sydney but still 25 Sep in UTC.
const SYDNEY_MORNING = new Date('2026-09-25T21:30:00Z'); // 7:30am AEST, 26 Sep

describe('todayKey', () => {
  test('is the local day, not the UTC day', () => {
    const original = process.env.TZ;
    process.env.TZ = 'Australia/Sydney';
    try {
      expect(SYDNEY_MORNING.toISOString().slice(0, 10)).toBe('2026-09-25');
      expect(todayKey(SYDNEY_MORNING)).toBe('2026-09-26');
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('dayKey', () => {
  test.each([
    ['2026-09-21', '2026-09-21'],
    ['21/09/2026', '2026-09-21'],
    ['21/09/2026 05:00 PM', '2026-09-21'],
    ['1/7/2026 09:15:00', '2026-07-01'],
    ['', null],
    [null, null],
    ['not a date', null],
    ['31/02/2026', null],
    ['2026-13-01', null],
  ])('%s → %s', (input, expected) => {
    expect(dayKey(input)).toBe(expected);
  });

  test('a timestamp is read as the local day it happened on', () => {
    const original = process.env.TZ;
    process.env.TZ = 'Australia/Sydney';
    try {
      expect(dayKey('2026-09-25T21:30:00Z')).toBe('2026-09-26');
    } finally {
      process.env.TZ = original;
    }
  });

  test('a Date gives its local day', () => {
    expect(dayKey(new Date(2026, 8, 26, 23, 59))).toBe(isoDay(new Date(2026, 8, 26)));
  });
});

describe('day arithmetic', () => {
  test('crosses months, years and the daylight-saving change', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    // Sydney clocks go forward on 4 Oct 2026; a day is still a day.
    expect(addDays('2026-10-03', 2)).toBe('2026-10-05');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('daysBetween is signed', () => {
    expect(daysBetween('2026-09-26', '2026-10-03')).toBe(7);
    expect(daysBetween('2026-09-26', '2026-09-20')).toBe(-6);
    expect(daysBetween('2026-10-03', '2026-10-05')).toBe(2);
  });

  test('keys compare as strings in day order', () => {
    expect('2026-09-09' < '2026-09-10').toBe(true);
  });
});

describe('formatDay', () => {
  test('one display format for both stored shapes', () => {
    // en-AU abbreviations: 'July', 'Sept' — the same as the status bar.
    expect(formatDay('2026-07-02')).toBe('2 July 2026');
    expect(formatDay('02/07/2026 05:00 PM')).toBe('2 July 2026');
    expect(formatDay('2026-09-26')).toBe('26 Sept 2026');
    expect(formatDay('')).toBe('');
  });
});

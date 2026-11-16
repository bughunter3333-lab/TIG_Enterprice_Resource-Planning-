import { basQuarter, financialYear } from '../accountingFormat';
import { todayKey } from '../../../lib/dates';

describe('the BAS quarter', () => {
  test.each([
    ['2026-07-01', '2026-07-01', '2026-09-30', 'Jul–Sep 2026'],
    ['2026-09-30', '2026-07-01', '2026-09-30', 'Jul–Sep 2026'],
    ['2026-10-19', '2026-10-01', '2026-12-31', 'Oct–Dec 2026'],
    ['2026-12-31', '2026-10-01', '2026-12-31', 'Oct–Dec 2026'],
    ['2027-01-01', '2027-01-01', '2027-03-31', 'Jan–Mar 2027'],
    ['2027-06-30', '2027-04-01', '2027-06-30', 'Apr–Jun 2027'],
  ])('%s falls in %s to %s', (day, from, to, label) => {
    expect(basQuarter(day)).toEqual({ from, to, label });
  });

  test('a leap day is in Jan–Mar like any other', () => {
    expect(basQuarter('2028-02-29')).toEqual({ from: '2028-01-01', to: '2028-03-31', label: 'Jan–Mar 2028' });
  });

  test('a quarter sits inside its financial year', () => {
    const fy = financialYear('2027-02-10');
    const q = basQuarter('2027-02-10');
    expect(q.from >= fy.from && q.to <= fy.to).toBe(true);
  });

  test('today is the viewer’s own day', () => {
    expect(basQuarter()).toEqual(basQuarter(todayKey()));
  });
});

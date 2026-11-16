import { money, dueOf } from '../recordFormat';

test('amounts read as Australian dollars with cents', () => {
  expect(money(2706)).toBe('$2,706.00');
  expect(money('12.5')).toBe('$12.50');
  expect(money(undefined)).toBe('$0.00');
});

describe('a job’s due day', () => {
  const today = '2026-10-25';
  test('an open job past its day is overdue', () => {
    // en-AU writes June and July in full even in its short form.
    expect(dueOf({ status: 'In Progress', due: '27/06/2026' }, today)).toEqual({ text: '27 June 2026', overdue: true });
  });
  test('finished or closed work is never overdue', () => {
    expect(dueOf({ status: 'FINISH', due: '27/06/2026' }, today).overdue).toBe(false);
    expect(dueOf({ status: 'PAID', due: '2026-06-27' }, today).overdue).toBe(false);
  });
  test('a day still ahead is not overdue, and no day says nothing', () => {
    expect(dueOf({ status: 'ORDER', due: '2026-12-01' }, today)).toEqual({ text: '1 Dec 2026', overdue: false });
    expect(dueOf({ status: 'ORDER', due: '' }, today)).toEqual({ text: '', overdue: false });
  });
});

import {
  JOB_VIEWS, isDueToday, isDueWithin, isMine, isNotDespatched, isOverdue, isQuoteExpiring, jobsInView, phaseOf,
} from '../jobMetrics';

const TODAY = '2026-09-26';
const job = (status, due, extra = {}) => ({ id: `${status}-${due}`, status, due, ...extra });

describe('isOverdue', () => {
  test('committed work past its due day, in either stored date shape', () => {
    expect(isOverdue(job('PRINT', '2026-09-25'), TODAY)).toBe(true);
    expect(isOverdue(job('ORDER', '25/09/2026 05:00 PM'), TODAY)).toBe(true);
  });

  test('due today is not overdue, even late in the day', () => {
    expect(isOverdue(job('PRINT', '26/09/2026 09:00 AM'), TODAY)).toBe(false);
  });

  test('quotes, delivered, billed and cancelled jobs are never overdue', () => {
    for (const s of ['QUOTE', 'FINISH', 'INVOICE', 'PAID', 'CANCEL']) {
      expect(isOverdue(job(s, '2026-01-01'), TODAY)).toBe(false);
    }
  });

  test('a job with no due date is not overdue', () => {
    expect(isOverdue(job('ORDER', ''), TODAY)).toBe(false);
  });
});

describe('due windows', () => {
  test('due today matches the calendar day whatever the stored time', () => {
    expect(isDueToday(job('In Progress', '26/09/2026 11:59 PM'), TODAY)).toBe(true);
    expect(isDueToday(job('In Progress', '2026-09-27'), TODAY)).toBe(false);
  });

  test('due within a week includes today and the seventh day, not the eighth', () => {
    expect(isDueWithin(job('ORDER', '2026-09-26'), 7, TODAY)).toBe(true);
    expect(isDueWithin(job('ORDER', '2026-10-03'), 7, TODAY)).toBe(true);
    expect(isDueWithin(job('ORDER', '2026-10-04'), 7, TODAY)).toBe(false);
    expect(isDueWithin(job('ORDER', '2026-09-25'), 7, TODAY)).toBe(false);
  });
});

describe('phases', () => {
  test('follow the server lifecycle', () => {
    expect(phaseOf('QUOTE')).toBe('sales');
    expect(phaseOf('PROOF')).toBe('production');
    expect(phaseOf('Pick/Pack')).toBe('fulfil');
    expect(phaseOf('FINISH')).toBe('fulfil');
    expect(phaseOf('INVOICE')).toBe('billing');
    expect(phaseOf('CANCEL')).toBe('closed');
  });
});

describe('isMine', () => {
  const user = { username: 'emon', full_name: 'Md Emon Miah' };

  test('matches the account manager or the assignee, ignoring case', () => {
    expect(isMine(job('ORDER', '', { accMgr: 'EMON' }), user)).toBe(true);
    expect(isMine(job('ORDER', '', { assignedTo: 'Md Emon Miah' }), user)).toBe(true);
    expect(isMine(job('ORDER', '', { accMgr: 'GP' }), user)).toBe(false);
  });

  test('blank fields never match', () => {
    expect(isMine(job('ORDER', '', { accMgr: '' }), { username: '' })).toBe(false);
  });
});

describe('isNotDespatched', () => {
  test('finished or invoiced with no despatch recorded', () => {
    expect(isNotDespatched(job('FINISH', ''))).toBe(true);
    expect(isNotDespatched(job('INVOICE', '', { dispatchedAt: '' }))).toBe(true);
    expect(isNotDespatched(job('INVOICE', '', { dispatchedAt: '  ' }))).toBe(true);
  });

  test('a recorded despatch, or any other status, is not counted', () => {
    expect(isNotDespatched(job('FINISH', '', { dispatchedAt: '2026-09-25T04:00:00Z' }))).toBe(false);
    for (const s of ['Pick/Pack', 'PAID', 'QUOTE', 'CANCEL']) expect(isNotDespatched(job(s, ''))).toBe(false);
  });
});

describe('isQuoteExpiring', () => {
  const quote = (validityDate, status = 'QUOTE') => job(status, '', { validityDate });

  test('valid until today through the seventh day, in either stored date shape', () => {
    expect(isQuoteExpiring(quote('2026-09-26'), TODAY)).toBe(true);
    expect(isQuoteExpiring(quote('03/10/2026'), TODAY)).toBe(true);
    expect(isQuoteExpiring(quote('2026-10-03T13:00:00'), TODAY)).toBe(true);
  });

  test('already lapsed, past the week, undated or not a quote is not counted', () => {
    expect(isQuoteExpiring(quote('2026-09-25'), TODAY)).toBe(false);
    expect(isQuoteExpiring(quote('2026-10-04'), TODAY)).toBe(false);
    expect(isQuoteExpiring(quote(''), TODAY)).toBe(false);
    expect(isQuoteExpiring(quote('2026-09-27', 'ORDER'), TODAY)).toBe(false);
  });
});

describe('jobsInView', () => {
  const jobs = [
    job('PRINT', '2026-09-20'),
    job('ORDER', '2026-09-26'),
    job('FINISH', '2026-09-01'),
    job('QUOTE', '2026-09-01', { validityDate: '2026-09-30' }),
    job('Pick/Pack', '2026-09-28'),
    job('PROOF', '2026-09-29'),
    job('In Progress', '2026-09-29'),
    job('INVOICE', '2026-09-01', { dispatchedAt: '2026-09-02' }),
  ];
  const statuses = (id) => jobsInView(jobs, id, { today: TODAY }).map((j) => j.status);

  test('a count is the length of the list it opens', () => {
    for (const v of JOB_VIEWS) {
      const list = jobsInView(jobs, v.id, { today: TODAY });
      expect(list.every((j) => v.test(j, { today: TODAY }))).toBe(true);
    }
    expect(statuses('overdue')).toEqual(['PRINT']);
    expect(statuses('toInvoice')).toEqual(['FINISH']);
  });

  test('the status views count one status each', () => {
    expect(statuses('proof')).toEqual(['PROOF']);
    expect(statuses('orderNotStarted')).toEqual(['ORDER']);
    expect(statuses('inProgress')).toEqual(['In Progress']);
    expect(statuses('notDespatched')).toEqual(['FINISH']);
    expect(statuses('quoteExpiring')).toEqual(['QUOTE']);
  });

  test('an unknown view matches nothing', () => {
    expect(jobsInView(jobs, 'nope', { today: TODAY })).toEqual([]);
  });
});

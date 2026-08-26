import { describe, expect, test } from 'vitest';
import { isJobEditable, jobLockReason } from '../jobEditability';

describe('when a job can be edited', () => {
  test('an open job can', () => {
    expect(isJobEditable({ status: 'ORDER', locked: false })).toBe(true);
  });

  test('a locked job cannot, whatever its status', () => {
    expect(isJobEditable({ status: 'QUOTE', locked: true })).toBe(false);
    expect(jobLockReason({ status: 'QUOTE', locked: true })).toMatch(/locked/i);
  });

  test('an invoiced or paid job cannot', () => {
    expect(isJobEditable({ status: 'INVOICE', locked: false })).toBe(false);
    expect(isJobEditable({ status: 'PAID', locked: false })).toBe(false);
  });

  test('the reason names the way back', () => {
    expect(jobLockReason({ status: 'INVOICE' })).toMatch(/unprint/i);
  });

  test('a job still in production can', () => {
    for (const status of ['QUOTE', 'ORDER', 'In Progress', 'PRINT', 'Pick/Pack', 'FINISH']) {
      expect(isJobEditable({ status, locked: false })).toBe(true);
    }
  });

  test('no job at all is not editable', () => {
    expect(isJobEditable(null)).toBe(false);
    expect(jobLockReason(null)).toBe('');
  });
});

import { lifecycleFor, nextStepFor, stepIndex, statusLabel } from '../lifecycle';

describe('the road a job travels', () => {
  test('a quote starts at Quote and ends at Paid, through every production step', () => {
    expect(lifecycleFor('ORDER').map((s) => s.status)).toEqual([
      'QUOTE', 'ORDER', 'In Progress', 'PROOF', 'PRINT', 'Pick/Pack', 'Desp/Ready', 'FINISH', 'INVOICE', 'PAID',
    ]);
  });

  test('a portal order starts at New instead of Quote', () => {
    expect(lifecycleFor('New')[0]).toEqual({ status: 'New', label: 'New' });
  });

  test('where a job is on it, and a cancelled job is off it', () => {
    expect(stepIndex('QUOTE')).toBe(0);
    expect(stepIndex('PROOF')).toBe(3);
    expect(stepIndex('PAID')).toBe(9);
    expect(stepIndex('CANCEL')).toBe(-1);
  });

  test('labels read as words, unknown statuses pass through', () => {
    expect(statusLabel('In Progress')).toBe('In progress');
    expect(statusLabel('SOMETHING')).toBe('SOMETHING');
  });
});

describe('the one next step', () => {
  test('intake becomes an order', () => {
    expect(nextStepFor({ status: 'QUOTE' })).toEqual({ kind: 'status', to: 'ORDER', label: 'Convert to order' });
    expect(nextStepFor({ status: 'New' })).toEqual({ kind: 'status', to: 'ORDER', label: 'Confirm order' });
  });

  test('production moves to the next rung', () => {
    expect(nextStepFor({ status: 'ORDER' })).toEqual({ kind: 'status', to: 'In Progress', label: 'Move to In progress' });
    expect(nextStepFor({ status: 'PRINT' })).toEqual({ kind: 'status', to: 'Pick/Pack', label: 'Move to Pick/Pack' });
    expect(nextStepFor({ status: 'Pick/Pack' })).toEqual({ kind: 'status', to: 'Desp/Ready', label: 'Ready to despatch' });
  });

  test('packed work is despatched on Dispatch, which records the consignment', () => {
    expect(nextStepFor({ status: 'Desp/Ready' })).toEqual({ kind: 'despatch', label: 'Despatch' });
  });

  test('finished work is invoiced; after that the money panel takes the payment', () => {
    expect(nextStepFor({ status: 'FINISH' })).toEqual({ kind: 'status', to: 'INVOICE', label: 'Invoice job' });
    expect(nextStepFor({ status: 'INVOICE' })).toBeNull();
    expect(nextStepFor({ status: 'PAID' })).toBeNull();
    expect(nextStepFor({ status: 'CANCEL' })).toBeNull();
    expect(nextStepFor(null)).toBeNull();
  });
});

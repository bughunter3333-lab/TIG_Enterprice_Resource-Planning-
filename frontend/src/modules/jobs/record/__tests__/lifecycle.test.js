import { lifecycleFor, nextStepFor, stepIndex, statusLabel } from '../lifecycle';

describe('the road a job travels', () => {
  test('an order starts at Booked and ends at Paid, along the main road', () => {
    expect(lifecycleFor('ORDER').map((s) => s.status)).toEqual([
      'New', 'ORDER', 'In Progress', 'PROOF', 'Picked', 'PRINT', 'Pick/Pack', 'Desp/Ready', 'FINISH', 'Ready',
      'INVOICE', 'PAID',
    ]);
    expect(lifecycleFor('New')[0]).toEqual({ status: 'New', label: 'Booked' });
  });

  test('a quote still reads Quote first', () => {
    expect(lifecycleFor('QUOTE')[0]).toEqual({ status: 'QUOTE', label: 'Quote' });
  });

  test("a side step is drawn only for a job standing on it, in its main step's place", () => {
    const road = (status) => lifecycleFor(status).map((s) => s.status);
    const main = road('ORDER');
    expect(road('Inco/Pick')).toEqual(main.map((s) => (s === 'Picked' ? 'Inco/Pick' : s)));
    expect(road('ProdExt')).toEqual(main.map((s) => (s === 'PRINT' ? 'ProdExt' : s)));
    // "Picked in full" then moves the ring to the same place, not back.
    expect(stepIndex('Picked')).toBe(stepIndex('Inco/Pick'));
  });

  test('where a job is on it, and a cancelled job is off it', () => {
    expect(stepIndex('QUOTE')).toBe(0);
    expect(stepIndex('PROOF')).toBe(3);
    expect(stepIndex('PAID')).toBe(11);
    expect(stepIndex('CANCEL')).toBe(-1);
  });

  test("labels are TIG's words; unknown statuses pass through", () => {
    expect(statusLabel('In Progress')).toBe('In progress');
    expect(statusLabel('New')).toBe('Booked');
    expect(statusLabel('ORDER')).toBe('Confirmed');
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
    expect(nextStepFor({ status: 'PROOF' })).toEqual({ kind: 'status', to: 'Picked', label: 'Move to Picked' });
    expect(nextStepFor({ status: 'PRINT' })).toEqual({ kind: 'status', to: 'Pick/Pack', label: 'Move to Pick/Pack' });
    expect(nextStepFor({ status: 'Pick/Pack' })).toEqual({ kind: 'status', to: 'Desp/Ready', label: 'Ready to despatch' });
  });

  test('packed work is despatched on Dispatch, which records the consignment', () => {
    expect(nextStepFor({ status: 'Desp/Ready' })).toEqual({ kind: 'despatch', label: 'Despatch' });
  });

  test('picked work goes to print when decorated, to packing when not', () => {
    const decorated = { status: 'Picked', items: [{ isService: false }, { isService: true }] };
    expect(nextStepFor(decorated)).toEqual({ kind: 'status', to: 'PRINT', label: 'Move to Print' });
    expect(nextStepFor({ status: 'Picked', items: [{ isService: false, decorationType: 'None' }] }).to).toBe('Pick/Pack');
    // A garment given a decoration type in the job form, with no logo record.
    expect(nextStepFor({ status: 'Picked', items: [{ isService: false, decorationType: 'EMB' }] }).to).toBe('PRINT');
    expect(nextStepFor({ status: 'Inco/Pick' })).toEqual({ kind: 'status', to: 'Picked', label: 'Picked in full' });
    expect(nextStepFor({ status: 'ProdExt' }).to).toBe('Pick/Pack');
  });

  test('finished work is checked, then invoiced; after that the money panel takes the payment', () => {
    expect(nextStepFor({ status: 'FINISH' })).toEqual({ kind: 'status', to: 'Ready', label: 'Mark ready to invoice' });
    expect(nextStepFor({ status: 'Ready' })).toEqual({ kind: 'status', to: 'INVOICE', label: 'Invoice job' });
    expect(nextStepFor({ status: 'INVOICE' })).toBeNull();
    expect(nextStepFor({ status: 'PAID' })).toBeNull();
    expect(nextStepFor({ status: 'CANCEL' })).toBeNull();
    expect(nextStepFor(null)).toBeNull();
  });
});

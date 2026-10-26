import { PRODUCTION_STATUSES } from '../jobStatuses';

/**
 * The road a job travels, as the record page draws it, and the one step that
 * comes next — so the page can offer a single primary action instead of every
 * action at once (Hick's law: fewer choices, faster decisions).
 *
 * The intake step is whichever of QUOTE or New the job started as. A job may
 * skip forward along production (the server allows it), so "next" is only the
 * default; the status menu in Edit still reaches any later step.
 */

const LABELS = {
  QUOTE: 'Quote',
  New: 'New',
  ORDER: 'Order',
  'In Progress': 'In progress',
  PROOF: 'Proof',
  PRINT: 'Print',
  'Pick/Pack': 'Pick/Pack',
  'Desp/Ready': 'Desp/Ready',
  FINISH: 'Finish',
  INVOICE: 'Invoice',
  PAID: 'Paid',
};

export function statusLabel(status) {
  return LABELS[status] ?? status;
}

export function lifecycleFor(status) {
  const intake = status === 'New' ? 'New' : 'QUOTE';
  return [intake, ...PRODUCTION_STATUSES, 'INVOICE', 'PAID'].map((s) => ({ status: s, label: statusLabel(s) }));
}

/** Where on the road the job is; -1 when it has left it (cancelled). */
export function stepIndex(status) {
  return lifecycleFor(status).findIndex((s) => s.status === status);
}

/**
 * The single next action for a job, or null when there is none to offer here.
 *   { kind: 'status', to, label }  — move the job on
 *   { kind: 'despatch', label }     — packed and waiting: despatch records the
 *                                     consignment, so it is done on Dispatch,
 *                                     not by flipping the status here
 * An invoiced job's next step is a payment, which the money panel offers.
 */
export function nextStepFor(job) {
  const status = job?.status;
  switch (status) {
    case 'QUOTE': return { kind: 'status', to: 'ORDER', label: 'Convert to order' };
    case 'New': return { kind: 'status', to: 'ORDER', label: 'Confirm order' };
    case 'Pick/Pack': return { kind: 'status', to: 'Desp/Ready', label: 'Ready to despatch' };
    case 'Desp/Ready': return { kind: 'despatch', label: 'Despatch' };
    case 'FINISH': return { kind: 'status', to: 'INVOICE', label: 'Invoice job' };
    default: {
      const i = PRODUCTION_STATUSES.indexOf(status);
      if (i < 0 || i >= PRODUCTION_STATUSES.length - 1) return null;
      const to = PRODUCTION_STATUSES[i + 1];
      return { kind: 'status', to, label: `Move to ${statusLabel(to)}` };
    }
  }
}

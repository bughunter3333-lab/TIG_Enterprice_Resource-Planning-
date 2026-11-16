/**
 * The job statuses, in ladder order — the server's list (backend/app/routers/
 * jobs.py VALID_STATUSES and PRODUCTION_LADDER), written once here.
 *
 * Every dropdown, board and filter used to carry its own copy, so adding a
 * status meant finding eight lists. TIG's own ladder (docs/superpowers/specs/
 * 2026-11-07-tig-status-ladder.md): Booked (stored New) until released,
 * Confirmed (ORDER) once released; Picked and Inco/Pick (part picked, the rest
 * waiting on stock) before PRINT, ProdExt (out at an external decorator) after
 * it; Desp/Ready packed and waiting for the carrier; FINISH gone; Ready is
 * FINISH a person has checked, ready to invoice.
 */

/** Production, in order. A job may move forward to any later step. */
export const PRODUCTION_STATUSES = [
  'ORDER', 'In Progress', 'PROOF', 'Picked', 'Inco/Pick', 'PRINT', 'ProdExt',
  'Pick/Pack', 'Desp/Ready', 'FINISH', 'Ready',
];

/**
 * Steps off the main road, each with the main step it stands in for: a job
 * goes there only when something holds it — stock short (Inco/Pick instead of
 * Picked), or decorated outside (ProdExt instead of PRINT) — so the record
 * page draws one only for a job standing on it, in its main step's place.
 */
export const SIDE_STEPS = { 'Inco/Pick': 'Picked', ProdExt: 'PRINT' };

/**
 * Gone, not yet invoiced: FINISH, and FINISH a person has marked Ready to
 * invoice (backend app/core/reservations.py FINISHED_STATUSES). Every "to
 * invoice", "finished" or "closed" check reads both.
 */
export const FINISHED_STATUSES = ['FINISH', 'Ready'];

/** Every status, in the order a job meets them. */
export const JOB_STATUSES = ['QUOTE', 'New', ...PRODUCTION_STATUSES, 'INVOICE', 'PAID', 'CANCEL'];

/** Packed and able to go out — what the despatch list offers. */
export const DESPATCHABLE_STATUSES = ['Pick/Pack', 'Desp/Ready', 'FINISH', 'Ready', 'INVOICE', 'PAID'];

/** Despatching one of these finishes it first, so it can then be invoiced. */
export const BECOMES_FINISH_ON_DESPATCH = ['Pick/Pack', 'Desp/Ready', 'FINISH', 'Ready'];

/**
 * What each status is called on screen. The stored value never changes — every
 * report, export and test that says ORDER keeps working — but TIG says Booked
 * and Confirmed, and FINISH in red is "ready to invoice".
 */
const LABELS = {
  QUOTE: 'Quote',
  New: 'Booked',
  ORDER: 'Confirmed',
  'In Progress': 'In progress',
  PROOF: 'Proof',
  Picked: 'Picked',
  'Inco/Pick': 'Inco/Pick',
  PRINT: 'Print',
  ProdExt: 'ProdExt',
  'Pick/Pack': 'Pick/Pack',
  'Desp/Ready': 'Desp/Ready',
  FINISH: 'Finish',
  Ready: 'Ready to invoice',
  INVOICE: 'Invoiced',
  PAID: 'Paid',
  CANCEL: 'Cancelled',
};

export function statusLabel(status) {
  return LABELS[status] ?? status;
}

/** Jim2's order category, beside the urgency (JIM7). */
export const ORDER_CATEGORIES = ['Normal', 'Branch', 'Employee'];

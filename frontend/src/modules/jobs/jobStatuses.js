/**
 * The job statuses, in ladder order — the server's list (backend/app/routers/
 * jobs.py VALID_STATUSES and PRODUCTION_LADDER), written once here.
 *
 * Every dropdown, board and filter used to carry its own copy, so adding a
 * status meant finding eight lists. Desp/Ready — packed, waiting for the
 * carrier — sits between Pick/Pack and FINISH, and FINISH is the goods having
 * gone (owner decision 2026-10-25).
 */

/** Production, in order. A job may move forward to any later step. */
export const PRODUCTION_STATUSES = ['ORDER', 'In Progress', 'PROOF', 'PRINT', 'Pick/Pack', 'Desp/Ready', 'FINISH'];

/** Every status, in the order a job meets them. */
export const JOB_STATUSES = ['QUOTE', 'New', ...PRODUCTION_STATUSES, 'INVOICE', 'PAID', 'CANCEL'];

/** Packed and able to go out — what the despatch list offers. */
export const DESPATCHABLE_STATUSES = ['Pick/Pack', 'Desp/Ready', 'FINISH', 'INVOICE', 'PAID'];

/** Despatching one of these finishes it first, so it can then be invoiced. */
export const BECOMES_FINISH_ON_DESPATCH = ['Pick/Pack', 'Desp/Ready', 'FINISH'];

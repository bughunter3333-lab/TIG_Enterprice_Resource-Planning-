/**
 * When a job stops being editable.
 *
 * The server refuses the save either way — `_require_mutable` in
 * backend/app/routers/jobs.py returns 409. This exists so the button says so
 * first, rather than letting someone retype a line and meet an error afterwards.
 *
 * Kept as a pure module so the rule can be tested without mounting the app.
 */

// Invoiced and paid jobs carry figures the customer has and the bookkeeper has
// taken. Unprinting is the way back: it restores the stock and returns the job
// to FINISH.
export const SETTLED_STATUSES = ['INVOICE', 'PAID'];

export function isJobEditable(job) {
  if (!job) return false;
  return !job.locked && !SETTLED_STATUSES.includes(job.status);
}

export function jobLockReason(job) {
  if (!job) return '';
  if (job.locked) return 'This job is locked. Unlock it to make changes.';
  if (SETTLED_STATUSES.includes(job.status)) {
    return `This job is ${job.status}. Unprint it to make changes — that puts the stock back.`;
  }
  return '';
}

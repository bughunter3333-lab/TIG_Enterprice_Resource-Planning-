/**
 * What each job measure means — defined once.
 *
 * The status strip, the nav tree, the quick filters and the dashboard each
 * used to define "overdue" for themselves, four different ways, so a count
 * and the list it opened disagreed. Every surface now asks this module, and a
 * count is always the length of the list it opens.
 *
 * The phases follow the server's lifecycle (ALLOWED_TRANSITIONS in
 * backend/app/routers/jobs.py): QUOTE → New (Booked) → ORDER (Confirmed) →
 * In Progress → (PROOF) → Picked → (Inco/Pick) → PRINT → (ProdExt) →
 * Pick/Pack → Desp/Ready → FINISH → Ready → INVOICE → PAID, with CANCEL
 * reachable from any step. Desp/Ready is packed and waiting for the carrier;
 * FINISH is the goods having gone, Ready is FINISH checked, ready to invoice.
 */
import { addDays, dayKey, todayKey } from '../../lib/dates';
import { FINISHED_STATUSES } from './jobStatuses';

export const PHASES = [
  { id: 'sales', label: 'Sales', statuses: ['QUOTE'] },
  { id: 'production', label: 'Production', statuses: ['New', 'ORDER', 'In Progress', 'PROOF', 'Picked', 'Inco/Pick', 'PRINT', 'ProdExt'] },
  { id: 'fulfil', label: 'Fulfil', statuses: ['Pick/Pack', 'Desp/Ready', ...FINISHED_STATUSES] },
  { id: 'billing', label: 'Billing', statuses: ['INVOICE', 'PAID'] },
  { id: 'closed', label: 'Cancelled', statuses: ['CANCEL'] },
];

const PHASE_OF = Object.fromEntries(PHASES.flatMap((p) => p.statuses.map((s) => [s, p.id])));

/** The phase a status belongs to; unknown statuses read as production. */
export const phaseOf = (status) => PHASE_OF[status] ?? 'production';

/**
 * Committed work not yet delivered. While a job is here its due date is a
 * promise to the customer, so this is what "overdue" and "due today" count.
 * A quote has a validity date instead; from FINISH on, the goods have gone.
 */
export const OPEN_WORK = [
  'New', 'ORDER', 'In Progress', 'PROOF', 'Picked', 'Inco/Pick', 'PRINT', 'ProdExt', 'Pick/Pack', 'Desp/Ready',
];

const isOpenWork = (job) => OPEN_WORK.includes(job.status);
const due = (job) => dayKey(job.due);

export const isOverdue = (job, today = todayKey()) => isOpenWork(job) && !!due(job) && due(job) < today;
export const isDueToday = (job, today = todayKey()) => isOpenWork(job) && due(job) === today;

/** Due from today through the next `days` days, inclusive — not yet late. */
export const isDueWithin = (job, days, today = todayKey()) => {
  const d = due(job);
  return isOpenWork(job) && !!d && d >= today && d <= addDays(today, days);
};

/** Finished and delivered, waiting for its invoice — checked (Ready) or not yet. */
export const isToInvoice = (job) => FINISHED_STATUSES.includes(job.status);

/** Finished or invoiced, with no despatch recorded against it yet. */
export const isNotDespatched = (job) =>
  [...FINISHED_STATUSES, 'INVOICE'].includes(job.status) && !String(job.dispatchedAt ?? '').trim();

/** A quote whose validity runs out from today through the next 7 days. */
export const isQuoteExpiring = (job, today = todayKey()) => {
  const valid = dayKey(job.validityDate);
  return job.status === 'QUOTE' && !!valid && valid >= today && valid <= addDays(today, 7);
};

// How long a job may sit at each status, in working days (0: no limit) —
// the server's table (GET /status-allowances), set once the app has it
// (lib/useStatusAllowances.js). Empty until then: nothing is flagged.
let allowanceTable = {};
export const setStatusAllowances = (table) => { allowanceTable = table ?? {}; };

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Working days (Monday to Friday) since a moment, in this browser's own days:
 * moved on Monday, it is 2 on Wednesday; moved on Friday, 1 on Monday.
 */
export function workingDaysSince(iso, now = new Date()) {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  const day = startOfDay(at);
  const end = startOfDay(now);
  let days = 0;
  while (day < end) {
    day.setDate(day.getDate() + 1);
    if (day.getDay() !== 0 && day.getDay() !== 6) days += 1;
  }
  return days;
}

/**
 * How long the job has sat at its status against its allowance: null when
 * its status has no limit, or it is not known when it got there.
 */
export function timeAtStatus(job, { allowances = allowanceTable, now = new Date() } = {}) {
  const allowed = allowances[job?.status];
  if (!allowed) return null;
  const days = workingDaysSince(job.statusChangedAt, now);
  if (days === null) return null;
  return { days, allowed, over: days > allowed };
}

/** Sat at its status longer than its allowance. */
export const isOverTime = (job, ctx) => !!timeAtStatus(job, ctx)?.over;

/** Being made: ordered through printed. */
export const isInProduction = (job) => phaseOf(job.status) === 'production';

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** The account manager or the person the job is assigned to is this user. */
export const isMine = (job, user) => {
  if (!user) return false;
  const me = [user.username, user.full_name].map(norm).filter(Boolean);
  return [job.accMgr, job.assignedTo].map(norm).some((v) => v && me.includes(v));
};

/**
 * The named views every surface shares. `test(job, { today, user })`.
 * Order is the order they appear in lists and the status strip.
 */
export const JOB_VIEWS = [
  { id: 'mine', label: 'My jobs', test: (j, { user }) => isOpenWork(j) && isMine(j, user) },
  { id: 'overdue', label: 'Overdue', test: (j, { today }) => isOverdue(j, today) },
  { id: 'dueToday', label: 'Due today', test: (j, { today }) => isDueToday(j, today) },
  { id: 'thisWeek', label: 'Due this week', test: (j, { today }) => isDueWithin(j, 7, today) },
  { id: 'inProduction', label: 'In production', test: (j) => isInProduction(j) },
  { id: 'pickPack', label: 'Pick/Pack', test: (j) => j.status === 'Pick/Pack' },
  { id: 'toInvoice', label: 'To invoice', test: (j) => isToInvoice(j) },
  { id: 'proof', label: 'With the customer', test: (j) => j.status === 'PROOF' },
  { id: 'orderNotStarted', label: 'Orders not started', test: (j) => j.status === 'ORDER' },
  { id: 'inProgress', label: 'In progress', test: (j) => j.status === 'In Progress' },
  { id: 'notDespatched', label: 'Finished not despatched', test: (j) => isNotDespatched(j) },
  { id: 'quoteExpiring', label: 'Quotes expiring this week', test: (j, { today }) => isQuoteExpiring(j, today) },
  { id: 'overTime', label: 'Over time at their status', test: (j) => isOverTime(j) },
];

const VIEW_BY_ID = Object.fromEntries(JOB_VIEWS.map((v) => [v.id, v]));

/** Whether one job is in a named view. Unknown ids match nothing. */
export const inView = (job, id, { today = todayKey(), user } = {}) =>
  !!VIEW_BY_ID[id]?.test(job, { today, user });

/** The jobs in a named view. Unknown ids match nothing rather than everything. */
export function jobsInView(jobs, id, { today = todayKey(), user } = {}) {
  return (jobs ?? []).filter((j) => inView(j, id, { today, user }));
}

export const viewLabel = (id) => VIEW_BY_ID[id]?.label ?? id;

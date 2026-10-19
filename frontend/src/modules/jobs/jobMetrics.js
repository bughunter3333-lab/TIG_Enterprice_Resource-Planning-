/**
 * What each job measure means — defined once.
 *
 * The status strip, the nav tree, the quick filters and the dashboard each
 * used to define "overdue" for themselves, four different ways, so a count
 * and the list it opened disagreed. Every surface now asks this module, and a
 * count is always the length of the list it opens.
 *
 * The phases follow the server's lifecycle (ALLOWED_TRANSITIONS in
 * backend/app/routers/jobs.py): QUOTE → ORDER → In Progress → (PROOF) → PRINT
 * → Pick/Pack → FINISH → INVOICE → PAID, with CANCEL reachable from any step.
 */
import { addDays, dayKey, todayKey } from '../../lib/dates';

export const PHASES = [
  { id: 'sales', label: 'Sales', statuses: ['QUOTE'] },
  { id: 'production', label: 'Production', statuses: ['New', 'ORDER', 'In Progress', 'PROOF', 'PRINT'] },
  { id: 'fulfil', label: 'Fulfil', statuses: ['Pick/Pack', 'FINISH'] },
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
export const OPEN_WORK = ['New', 'ORDER', 'In Progress', 'PROOF', 'PRINT', 'Pick/Pack'];

const isOpenWork = (job) => OPEN_WORK.includes(job.status);
const due = (job) => dayKey(job.due);

export const isOverdue = (job, today = todayKey()) => isOpenWork(job) && !!due(job) && due(job) < today;
export const isDueToday = (job, today = todayKey()) => isOpenWork(job) && due(job) === today;

/** Due from today through the next `days` days, inclusive — not yet late. */
export const isDueWithin = (job, days, today = todayKey()) => {
  const d = due(job);
  return isOpenWork(job) && !!d && d >= today && d <= addDays(today, days);
};

/** Finished and delivered, waiting for its invoice. */
export const isToInvoice = (job) => job.status === 'FINISH';

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

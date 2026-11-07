import { dayKey, todayKey, formatDay } from '../../../lib/dates';
import { FINISHED_STATUSES } from '../jobStatuses';

const AUD = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "$2,706.00" — every amount on the record page, one way. */
export const money = (value) => AUD.format(Number(value) || 0);

/** A job's due day for display, and whether it has passed while the job is still open. */
export function dueOf(job, today = todayKey()) {
  const key = dayKey(job?.due);
  if (!key) return { text: '', overdue: false };
  const closed = [...FINISHED_STATUSES, 'INVOICE', 'PAID', 'CANCEL'].includes(job.status);
  return { text: formatDay(key), overdue: !closed && key < today };
}

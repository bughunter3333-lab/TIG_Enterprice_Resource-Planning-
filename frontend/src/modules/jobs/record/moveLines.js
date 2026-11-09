/**
 * Moving lines to another job, pure (docs/superpowers/specs/2026-11-08-move-lines.md):
 * which jobs may give or take lines, and which lines may be ticked. The server
 * decides; this only keeps the screen from offering what it would refuse.
 */
import { FINISHED_STATUSES } from '../jobStatuses';

const NOT_OPEN = new Set([...FINISHED_STATUSES, 'INVOICE', 'PAID', 'CANCEL']);

/** An open job: a quote, a booked order or one in work — and not locked. */
export const isOpen = (job) => !!job && !NOT_OPEN.has(job.status) && !job.locked;

/** The jobs the lines may go to: the same customer's other open jobs, newest first. */
export function moveTargets(jobs, job) {
  if (!isOpen(job)) return [];
  return (jobs ?? [])
    .filter((j) => j.id !== job.id && j.customerId === job.customerId && isOpen(j))
    .sort((a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
}

/**
 * A line may be ticked when it is a product line that is not decoration (a
 * garment takes its decoration with it), not on order still, and not sent.
 */
export function movable(item) {
  if ((item.displayType || 'product') !== 'product') return false;
  if (item.isService) return false;
  if (item.poNo && item.bOrd > 0) return false;
  return !(item.qtyDelivered > 0);
}

/** Why a line cannot be ticked, for its tooltip; null when it can. */
export function whyNotMovable(item) {
  if (item.isService) return 'Decoration goes with its garment';
  if (item.poNo && item.bOrd > 0) return `On order (${item.poNo}) — receive it first`;
  if (item.qtyDelivered > 0) return 'Already sent';
  return null;
}

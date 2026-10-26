/**
 * Home's one dark panel: the work the business has in hand, by where it is.
 *
 * Counts only — overseas staff read jobs but not money. The bar shows every
 * open job by stage; the three links are shared job views (jobMetrics.js), so
 * each count is the length of the list it opens.
 */
import { jobsInView } from '../jobs/jobMetrics';

// The stages of the bar, in the order of the work. `status` names the phase
// colour the segment takes (tokens.js statusOnDark).
export const STAGES = [
  { id: 'quoted', label: 'Quoted', statuses: ['QUOTE', 'New'], status: 'QUOTE' },
  { id: 'production', label: 'In production', statuses: ['ORDER', 'In Progress', 'PRINT'], status: 'ORDER' },
  { id: 'proof', label: 'With the customer', statuses: ['PROOF'], status: 'PROOF' },
  { id: 'packing', label: 'Packing and despatch', statuses: ['Pick/Pack', 'Desp/Ready'], status: 'Pick/Pack' },
  { id: 'toInvoice', label: 'To invoice', statuses: ['FINISH'], status: 'FINISH' },
  { id: 'awaitingPayment', label: 'Awaiting payment', statuses: ['INVOICE'], status: 'INVOICE' },
];

// The views a person can open from the panel: [view, the quick filter it opens].
const LINKS = [
  ['inProduction', 'inProduction', 'In production'],
  ['proof', 'proof', 'With the customer'],
  ['toInvoice', 'needsInvoice', 'To invoice'],
];

export function workInHand(jobs, ctx) {
  const list = Array.isArray(jobs) ? jobs : [];
  const stages = STAGES.map((stage) => ({
    ...stage,
    count: list.filter((j) => stage.statuses.includes(j.status)).length,
  }));
  return {
    open: stages.reduce((n, s) => n + s.count, 0),
    stages,
    links: LINKS.map(([view, quick, label]) => ({ view, quick, label, count: jobsInView(list, view, ctx).length })),
  };
}

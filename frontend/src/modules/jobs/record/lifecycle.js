import { PRODUCTION_STATUSES, SIDE_STEPS, statusLabel } from '../jobStatuses';

export { statusLabel };

/**
 * The road a job travels, as the record page draws it, and the one step that
 * comes next — so the page can offer a single primary action instead of every
 * action at once (Hick's law: fewer choices, faster decisions).
 *
 * The intake step is whichever of QUOTE or New (Booked) the job started as.
 * The side steps — Inco/Pick, ProdExt — are drawn only for a job standing on
 * one: most jobs never go there. A job may skip forward along production (the
 * server allows it), so "next" is only the default; the status menu in Edit
 * still reaches any later step.
 */

/** Production without the side steps: the way most jobs go. */
const MAIN_ROAD = PRODUCTION_STATUSES.filter((s) => !(s in SIDE_STEPS));

/**
 * The road as drawn for a job at `status`. Every job is Booked first now, so
 * the intake is Booked unless the job is still a quote. A job on a side step
 * sees it in its main step's place — Inco/Pick where Picked is, ProdExt where
 * PRINT is — so the ring never stands behind a step drawn as done.
 */
export function lifecycleFor(status) {
  const intake = status === 'QUOTE' ? 'QUOTE' : 'New';
  const road = MAIN_ROAD.map((s) => (SIDE_STEPS[status] === s ? status : s));
  return [intake, ...road, 'INVOICE', 'PAID'].map((s) => ({ status: s, label: statusLabel(s) }));
}

/**
 * A job with anything to decorate goes to print; one without, to packing.
 * A decoration is a logo or alteration line (`isService`) or a garment line
 * given a decoration type (EMB, DTF, Screen…) in the job form.
 */
function decorated(job) {
  return (job?.items ?? []).some(
    (i) => i.isService || (i.decorationType && i.decorationType !== 'None'),
  );
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
    // Picking is done; what follows depends on whether the garments are decorated.
    case 'Picked': return decorated(job)
      ? { kind: 'status', to: 'PRINT', label: 'Move to Print' }
      : { kind: 'status', to: 'Pick/Pack', label: 'Move to Pick/Pack' };
    case 'Inco/Pick': return { kind: 'status', to: 'Picked', label: 'Picked in full' };
    case 'ProdExt': return { kind: 'status', to: 'Pick/Pack', label: 'Back from the decorator' };
    // Gone: a person checks it, then it is invoiced (TIG's FINISH green, then red).
    case 'FINISH': return { kind: 'status', to: 'Ready', label: 'Mark ready to invoice' };
    case 'Ready': return { kind: 'status', to: 'INVOICE', label: 'Invoice job' };
    default: {
      const i = MAIN_ROAD.indexOf(status);
      if (i < 0 || i >= MAIN_ROAD.length - 1) return null;
      const to = MAIN_ROAD[i + 1];
      return { kind: 'status', to, label: `Move to ${statusLabel(to)}` };
    }
  }
}

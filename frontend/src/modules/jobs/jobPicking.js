/**
 * Which of a job's lines are picked off a shelf: goods only. A section or note
 * is layout, a decoration or alteration line is work done to a garment, and a
 * charge (freight, a fee) is money — the server refuses to record a pick
 * against any of them (POST /jobs/{id}/pick, 422), so sending one would fail
 * the whole save.
 */
export function pickableLines(job) {
  return (job?.items || []).filter(
    (item) => (item.displayType || 'product') === 'product' && !item.isService && !item.isCharge,
  );
}

/** What a line is to be picked to: what is supplied, else what is ordered. */
export const pickTarget = (line) => line.supply || line.qty || line.order || 0;

/**
 * Whether a line is picked in full — the server's own rule (backend jobs.py
 * `_fully_picked`): all of it picked, and nothing on back-order. A line whose
 * stock here is all picked while the rest is on back-order is a part pick.
 */
export function linePickedInFull(line, picked) {
  const target = pickTarget(line);
  return target > 0 && picked >= target && !(line.bOrd > 0);
}

/**
 * The move the pick panel offers once the picks are counted, or null. TIG
 * marks the pick by hand: Picked once every line is picked in full, Inco/Pick
 * when some is and the rest waits on stock. Only before PRINT, where those
 * steps sit on the ladder, and only moves the server allows from there
 * (backend jobs.py `_ladder`, `_BACK_A_STEP`).
 * `pickedOf(line)` is what is picked of a line, saved or still a draft.
 */
export function pickMoveFor(status, lines, pickedOf) {
  if (!lines.length) return null;
  if (lines.every((l) => linePickedInFull(l, pickedOf(l)))) {
    return ['ORDER', 'In Progress', 'PROOF', 'Inco/Pick'].includes(status) ? 'Picked' : null;
  }
  const some = lines.some((l) => pickedOf(l) > 0);
  return some && ['ORDER', 'In Progress', 'PROOF', 'Picked'].includes(status) ? 'Inco/Pick' : null;
}

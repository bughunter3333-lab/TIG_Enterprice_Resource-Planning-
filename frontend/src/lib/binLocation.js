/**
 * A bin code is a route, not a name.
 *
 * `B.3.H.1` reads aisle · bay · level · position: aisle B of A–E, bay 3 of ten
 * along that aisle, level H counting up from A at the floor, position 1 within
 * the bay. Three of those four parts are the order a picker physically walks —
 * only the level is free, because height costs a reach rather than a walk.
 *
 * So the walk order is aisle, bay, position, level, and the bay has to compare
 * as a number: an aisle is ten bays deep, and by string `B.10` sorts before
 * `B.2`, sending the picker back up the aisle for the last bay.
 */

const BIN_PATTERN = /^([A-Z]+)\.(\d+)\.([A-Z]+)\.(\d+)$/i;

export function parseBin(bin) {
  const match = BIN_PATTERN.exec(String(bin ?? '').trim());
  if (!match) return null;
  return {
    aisle: match[1].toUpperCase(),
    bay: Number(match[2]),
    level: match[3].toUpperCase(),
    position: Number(match[4]),
  };
}

// Anything that does not parse — an empty bin, a legacy code, a free-text note
// — sorts after every real location, so it collects at the end of the slip
// instead of interrupting the walk.
export function binSortKey(bin) {
  const parsed = parseBin(bin);
  if (!parsed) return [1, '', 0, 0, ''];
  return [0, parsed.aisle, parsed.bay, parsed.position, parsed.level];
}

export function compareBins(a, b) {
  const left = binSortKey(a);
  const right = binSortKey(b);
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] === right[i]) continue;
    return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

/**
 * What may be saved on a stock position — the rules the server holds
 * (backend/app/core/racking.py and the location endpoints), applied as the
 * values are typed so a mistake is caught there and not on a picking slip.
 *
 * A bin is a real box: an aisle.bay.level.box code that exists in the branch's
 * racking layout. Any text used to be accepted. A code on file from before
 * that — left as it stands — does not block the row it is on; it is flagged
 * until it is re-slotted.
 */
import { parseBin } from '../../lib/binLocation';
import { LEVEL_LETTERS, binPlacement, levelCount } from '../warehouse/layout';
import { suggestBins } from '../warehouse/binSuggest';

export const MAX_BIN_QTY = 100_000;
export const MAX_ZONE_LENGTH = 20;

export const BIN_FIELDS = [
  { field: 'primary_bin_1', label: 'Primary bin 1', max: 'max_qty_bin_1', maxLabel: 'Max qty 1' },
  { field: 'primary_bin_2', label: 'Primary bin 2', max: 'max_qty_bin_2', maxLabel: 'Max qty 2' },
];

const tidy = (value) => String(value ?? '').trim();

/** Two codes for one bin: the same box however it was typed, or the same old text. */
export function sameBin(a, b) {
  const [x, y] = [tidy(a), tidy(b)];
  if (!x || !y) return false;
  const [p, q] = [box(x), box(y)];
  if (p && q) return p.aisle === q.aisle && p.bay === q.bay && p.level === q.level && p.position === q.position;
  return !p && !q && x.toUpperCase() === y.toUpperCase();
}

// A code is a box only with a bay and a box number from 1 up, as the server
// reads it; `A.0.B.1` is old text, compared as text.
function box(text) {
  const parsed = parseBin(text);
  return parsed && parsed.bay >= 1 && parsed.position >= 1 ? parsed : null;
}

/**
 * Why `value` is not a box in this racking, in words that finish the sentence
 * "<the bin> …" — or null when it is one, or when there is nothing typed.
 * `layout` null means the branch's racking is not known yet: only the shape of
 * the code is judged, and the server has the last word.
 */
export function binProblem(layout, value) {
  const text = tidy(value);
  if (!text) return null;
  const parsed = parseBin(text);
  // The start of a real location is not a mistake, only not finished: it
  // cannot be saved yet, and is said to be that rather than wrong.
  if (!parsed && suggestBins(layout, text).length > 0) return 'is not a whole location yet — finish it, or choose one from the list';
  if (!parsed) return 'is not an aisle.bay.level.box code, like B.3.H.1';
  if (!layout) return null;
  const placed = binPlacement(layout, text);
  if (placed.ok) return null;
  return {
    aisle: `is not in this racking: there is no aisle ${parsed.aisle} (aisles ${layout.aisles.join(', ')})`,
    bay: `is not in this racking: there is no bay ${parsed.bay} (bays 1 to ${layout.baysPerAisle})`,
    level: `is not in this racking: there is no level ${parsed.level} (levels A to ${LEVEL_LETTERS[levelCount(layout) - 1]})`,
    position: `is not in this racking: there is no box ${parsed.position} on a level (boxes 1 to ${layout.positions})`,
  }[placed.reason] ?? 'is not a box in this racking';
}

const capacityProblem = (value) => {
  const text = tidy(value);
  if (!text) return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 && n <= MAX_BIN_QTY ? null : `must be a whole number from 0 to ${MAX_BIN_QTY.toLocaleString('en-AU')}, or empty`;
};

/**
 * Everything that stops a row being saved, as `{ field, text }` — `text` is
 * the whole sentence. `draft` is what is in the inputs, `stored` the record on
 * file (if any). A bin left exactly as it is on file is not judged.
 */
export function rowProblems(layout, draft, stored) {
  const problems = [];
  for (const { field, label, max, maxLabel } of BIN_FIELDS) {
    const kept = sameBin(draft[field], stored?.[field]);
    const wrong = kept ? null : binProblem(layout, draft[field]);
    if (wrong) problems.push({ field, text: `${label} “${tidy(draft[field])}” ${wrong}.` });
    const capacity = capacityProblem(draft[max]);
    if (capacity) problems.push({ field: max, text: `${maxLabel} ${capacity}.` });
  }
  // Two bins are two boxes — judged when a bin is being changed. A row whose
  // bins are already one box and are left as they stand can still be saved.
  const left = ({ field }) => (tidy(draft[field]) ? sameBin(draft[field], stored?.[field]) : !tidy(stored?.[field]));
  if (!BIN_FIELDS.every(left) && sameBin(draft.primary_bin_1, draft.primary_bin_2)) {
    problems.push({ field: 'primary_bin_2', text: 'Primary bin 2 is the same box as primary bin 1. A position’s two bins are two different boxes.' });
  }
  if (tidy(draft.zone).length > MAX_ZONE_LENGTH) {
    problems.push({ field: 'zone', text: `Zone is at most ${MAX_ZONE_LENGTH} characters.` });
  }
  return problems;
}

/** The bins on a stored record that are not boxes in the racking: `[{ field, label, value, text }]`. */
export function storedBinProblems(layout, stored) {
  if (!stored) return [];
  return BIN_FIELDS
    .map(({ field, label }) => ({ field, label, value: tidy(stored[field]), text: binProblem(layout, stored[field]) }))
    .filter((p) => p.text);
}

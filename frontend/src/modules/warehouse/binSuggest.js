/**
 * Completing a bin code as it is typed.
 *
 * Every box in a branch's racking is known (layout.js), so what has been
 * typed so far either leads to real boxes or it does not. While it does, the
 * field offers them: one for each way the part being typed can go on, each a
 * whole code — `B` offers B.1.A.1; `B.` offers B.1.A.1, B.2.A.1 … one per bay;
 * `B.2.` offers B.2.A.1, B.2.B.1 … one per level. So the list is never more
 * than one aisle's bays long, and choosing from it then typing on walks down
 * to any box.
 */
import { capitals } from '../../lib/binLocation';
import { LEVEL_LETTERS, levelCount } from './layout';

const range = (n) => Array.from({ length: n }, (_, i) => String(i + 1));
// A number typed with noughts in front is the same number: B.03 is bay 3.
const plain = (digits) => digits.replace(/^0+(?=\d)/, '');
const isNumber = (text) => /^\d+$/.test(text);

/** What each of a code's four parts can be in this racking, as text. */
function choices(layout) {
  return [
    layout.aisles,
    range(layout.baysPerAisle),
    LEVEL_LETTERS.slice(0, levelCount(layout)).split(''),
    range(layout.positions),
  ];
}

/**
 * The real boxes `text` could be the start of — whole codes, in the order the
 * racking runs — or none when it leads nowhere. Nothing typed offers nothing.
 */
export function suggestBins(layout, text) {
  const typed = capitals(String(text ?? '').trim());
  if (!layout || !typed) return [];
  const parts = typed.split('.');
  const all = choices(layout);
  if (parts.length > all.length) return [];

  // Every part before the last is finished, and has to be one this racking has.
  const settled = [];
  for (let i = 0; i < parts.length - 1; i += 1) {
    const numeric = i % 2 === 1;
    if (numeric && !isNumber(parts[i])) return [];
    const part = numeric ? plain(parts[i]) : parts[i];
    if (!all[i].includes(part)) return [];
    settled.push(part);
  }

  // The last part is still being typed: every choice it could become. An
  // empty one (the text ends with a dot) could become any of them.
  const at = parts.length - 1;
  const numeric = at % 2 === 1;
  const last = parts[at];
  if (numeric && last !== '' && !isNumber(last)) return [];
  // "0" alone is the start of a padded number, so it rules nothing out yet.
  const begun = numeric ? (plain(last) === '0' ? '' : plain(last)) : last;
  const first = all.slice(at + 1).map((options) => options[0]);
  return all[at]
    .filter((option) => option.startsWith(begun))
    .map((option) => [...settled, option, ...first].join('.'));
}

/**
 * How a bin code reads while it is typed: in capitals while it leads to a
 * real box in this racking — that is how the system shows it has recognised
 * it — and in small letters when it does not. Only A–Z change, so the text
 * keeps its length and a caret its place. With no racking to judge by, it is
 * left as typed.
 */
export function asTyped(layout, text) {
  const value = String(text ?? '');
  if (!layout) return value;
  return suggestBins(layout, value).length > 0
    ? capitals(value)
    : value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

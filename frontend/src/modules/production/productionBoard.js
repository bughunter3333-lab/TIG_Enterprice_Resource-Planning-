/**
 * The production board, pure (docs/superpowers/specs/2026-11-07-production-board.md).
 *
 * The server places every garment in a lane (backend app/core/production_board.py);
 * this only orders the cards in each lane and words them.
 */
import { dayKey } from '../../lib/dates';

// Most pressing first: a job due sooner, then a more urgent one.
const URGENCY = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
const NO_DATE = '9999-99-99';

/** A card's identity: a job at a lane. */
export const cardKey = (card) => `${card.job_id}@${card.lane}`;

export function cardOrder(a, b) {
  const due = (dayKey(a.due) || NO_DATE).localeCompare(dayKey(b.due) || NO_DATE);
  if (due) return due;
  const urgency = (URGENCY[a.priority] ?? 2) - (URGENCY[b.priority] ?? 2);
  if (urgency) return urgency;
  return String(a.job_id).localeCompare(String(b.job_id), undefined, { numeric: true });
}

/** Each lane with its cards, in the server's lane order, most pressing first. */
export function lanesWithCards(board) {
  const cards = board?.cards ?? [];
  return (board?.lanes ?? []).map((lane) => ({
    ...lane,
    cards: cards.filter((c) => c.lane === lane.key).sort(cardOrder),
  }));
}

/** Urgency worth a mark on a card: High and Urgent only. */
export const isPressing = (card) => card.priority === 'High' || card.priority === 'Urgent';

/** "since 9:42" today, "since 5 Nov" before. */
export function sinceText(iso, now = new Date()) {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const sameDay = at.toDateString() === now.toDateString();
  return sameDay
    ? `since ${at.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`
    : `since ${at.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
}

/** A garment line on a card: "L1 · POLO-NAV · 4 · EMB.RIC". */
export function lineText(line) {
  return [`L${line.line}`, line.stock_code || line.description, line.qty, ...line.decoration]
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join(' · ');
}

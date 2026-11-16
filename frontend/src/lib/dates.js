/**
 * Calendar days, in the viewer's local time.
 *
 * Jobs store dates as text in two shapes: ISO ('2026-09-21') from the app's
 * date pickers, and day-first ('21/09/2026 05:00 PM') from the Jim2 import.
 * Every question the app asks of them — is it due today, is it late, what
 * week is it in — is a question about calendar days, not instants. So the
 * unit here is a *day key*: 'YYYY-MM-DD', with no time zone in it. Keys
 * compare correctly as strings and never shift by a day the way a Date at
 * UTC midnight does when read in Sydney.
 *
 * "Today" is the viewer's local day. `new Date().toISOString()` is the UTC
 * day, which in Sydney is yesterday until 10–11am — the hours production
 * plans the day in.
 */

const pad = (n) => String(n).padStart(2, '0');

const YMD = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const YMD_TIME = /^\d{4}-\d{2}-\d{2}T/;
const DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/;

function key(y, m, d) {
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** The local calendar day a Date falls on, or null for an invalid Date. */
export function isoDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today's key in the viewer's time zone. */
export const todayKey = (now = new Date()) => isoDay(now);

/**
 * The day key of anything the app stores as a date, or null.
 * Accepts 'YYYY-MM-DD', a timestamp ('2026-09-21T03:00:00Z' — read in local
 * time), 'DD/MM/YYYY' with or without a time after it, or a Date.
 */
export function dayKey(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isoDay(value);
  const s = String(value).trim();
  let m = YMD.exec(s);
  if (m) return key(+m[1], +m[2], +m[3]);
  if (YMD_TIME.test(s)) return isoDay(new Date(s));
  m = DMY.exec(s);
  if (m) return key(+m[3], +m[2], +m[1]);
  return null;
}

const utc = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** The key `n` days after (or, negative, before) `k`. */
export function addDays(k, n) {
  const t = new Date(utc(k) + n * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / 86400000);

const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** '26 Sep 2026' — one display format for a day, whatever shape it was stored in. */
export function formatDay(value) {
  const k = dayKey(value);
  return k ? DAY_MONTH_YEAR.format(new Date(utc(k))) : '';
}

// Parses the app's dd/mm/yyyy display format back to a Date. Returns null
// rather than an Invalid Date, so callers can test it without isNaN.
// Kept for the monolith's existing callers; new code compares day keys.
export const parseD = (str) => { if (!str) return null; const s = str.split(' ')[0]; const p = s.split('/'); return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`) : new Date(s); };

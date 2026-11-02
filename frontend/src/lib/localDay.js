/**
 * The browser's own day, YYYY-MM-DD, `days` from today.
 *
 * Not `toISOString().slice(0, 10)`: that is UTC's day, which is yesterday in
 * Sydney until 10 or 11 in the morning. The API keeps UTC too, so the screens
 * send this day where the day matters — a despatch (B1-07).
 *
 * @param {number} [days]
 * @returns {string}
 */
export function localDay(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

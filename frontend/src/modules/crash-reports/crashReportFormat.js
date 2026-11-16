/** Words for crash reports on screen — pure, so the screens stay plain. */

export const KIND_LABELS = {
  crash: 'Screen crash',
  error: 'Error',
  server_error: 'Server error',
  report: 'Reported',
};

export const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'looking', label: 'Looking' },
  { value: 'fixed', label: 'Fixed' },
];

/** One line for the list: the person's words first, else the error. */
export function reportSummary(report) {
  const text = (report.description || report.message || '').split('\n')[0].trim();
  return text ? (text.length > 120 ? `${text.slice(0, 119)}…` : text) : '—';
}

/** "8 Nov, 9:42 am" in the person's own time. */
export function whenText(iso) {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return at.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

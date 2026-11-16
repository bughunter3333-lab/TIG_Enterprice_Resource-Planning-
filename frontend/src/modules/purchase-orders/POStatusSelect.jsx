import Select from '../../ui/Select';
import { SETTABLE_PO_STATUSES } from './poFilters';

// A short-shipped PO is closed by setting it Received: the rest is not coming,
// so its unreceived lines stop counting as spend still to come (F25).
const CLOSE_SHORT = { value: 'Received', label: 'Close short (Received)' };

/**
 * The status a person sets on a PO: Draft, Sent or Cancelled (F17, F29), and a
 * Partial one may be closed short. Partial and Received otherwise follow from
 * the lines, so a Received PO is shown as it stands and not changed here —
 * once anything has arrived it cannot be cancelled either.
 */
export default function POStatusSelect({ status, onChange }) {
  const partial = status === 'Partial';
  const derived = !partial && !SETTABLE_PO_STATUSES.includes(status);
  const options = partial
    ? [{ value: status, label: status }, CLOSE_SHORT]
    : (derived ? [status] : SETTABLE_PO_STATUSES).map((s) => ({ value: s, label: s }));
  return (
    <Select
      aria-label="PO status"
      value={status}
      options={options}
      disabled={derived}
      title={derived ? 'Set by what has been received' : undefined}
      onChange={(e) => onChange(e.target.value)}
      style={{ minWidth: 112 }}
    />
  );
}

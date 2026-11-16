import { useState } from 'react';
import Button from '../../ui/Button';
import { fieldChrome } from '../../ui/fieldStyle';
import { T } from '../../ui/tokens';
import { JOB_STATUSES, statusLabel } from './jobStatuses';

/**
 * What can be done to the jobs selected in the list, as on Jim2's job list
 * (JIM24): one status, or one due date, for all of them. Jobs the server would
 * not change are named here with the reason, and stay selected.
 */
export default function BulkActionBar({ count, busy, problems, onStatus, onDue, onRaisePOs, onClear }) {
  const [status, setStatus] = useState('');
  const [due, setDue] = useState('');
  const field = { ...fieldChrome({}), height: 28, fontSize: T.fsSmall, padding: '0 6px' };

  return (
    <section
      aria-label="Selected jobs"
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        padding: '8px 12px', marginBottom: 10,
        background: T.accentTint, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg,
        fontSize: T.fsSmall, color: T.text,
      }}
    >
      <strong>{count} selected</strong>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select aria-label="New status" value={status} onChange={e => setStatus(e.target.value)} style={field}>
          <option value="">Status…</option>
          {JOB_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <Button size="sm" disabled={!status || busy} onClick={() => onStatus(status)}>Change status</Button>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="date" aria-label="New due date" value={due} onChange={e => setDue(e.target.value)} style={field} />
        <Button size="sm" disabled={!due || busy} onClick={() => onDue(due)}>Move due date</Button>
      </span>
      {/* Offered only to a role that may raise POs. */}
      {onRaisePOs && (
        <Button size="sm" disabled={busy} onClick={onRaisePOs}>Raise POs</Button>
      )}
      <Button size="sm" variant="ghost" onClick={onClear}>Clear selection</Button>
      {problems.length > 0 && (
        <ul role="status" style={{ flexBasis: '100%', margin: 0, paddingLeft: 18, color: T.danger }}>
          {problems.map(p => <li key={p.job_id}>{p.job_id}: {p.reason}</li>)}
        </ul>
      )}
    </section>
  );
}

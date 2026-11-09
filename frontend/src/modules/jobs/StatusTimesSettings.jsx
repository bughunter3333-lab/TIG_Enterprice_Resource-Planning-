import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { statusTimes } from '../../api';
import { notify } from '../../lib/notify';
import Button from '../../ui/Button';
import StatusBadge from '../../ui/StatusBadge';
import { T } from '../../ui/tokens';
import { JOB_STATUSES } from './jobStatuses';

const MAX_DAYS = 60;

/**
 * Admin → Status times: how many working days a job may sit at each open
 * status before it is flagged (docs/superpowers/specs/2026-11-09-status-times.md).
 * 0 is no limit.
 */
export default function StatusTimesSettings() {
  const queryClient = useQueryClient();
  const { data: saved } = useQuery({ queryKey: ['status-allowances'], queryFn: statusTimes.get });
  const [draft, setDraft] = useState({});
  const save = useMutation({
    mutationFn: (allowances) => statusTimes.save(allowances),
    onSuccess: (table) => {
      queryClient.setQueryData(['status-allowances'], table);
      setDraft({});
      notify('Status times saved.', { type: 'success' });
    },
    onError: (e) => notify(e.message, { type: 'error' }),
  });

  if (!saved) return <p style={{ color: T.textMuted }}>Loading…</p>;
  // In ladder order, only the statuses the server keeps an allowance for.
  const statuses = JOB_STATUSES.filter((s) => s in saved);
  const value = (s) => (s in draft ? draft[s] : String(saved[s]));
  const valid = (text) => /^\d+$/.test(text) && Number(text) <= MAX_DAYS;
  const changed = Object.keys(draft).filter((s) => draft[s] !== String(saved[s]));
  const allValid = changed.every((s) => valid(draft[s]));

  return (
    <div style={{ maxWidth: 520 }}>
      <p style={{ margin: '0 0 14px', fontSize: T.fsBase, color: T.text }}>
        Working days a job may sit at each status before it is flagged on the job list and the job. 0 is no limit.
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {statuses.map((s) => (
            <tr key={s} style={{ borderTop: `1px solid ${T.hairlineSoft}` }}>
              <td style={{ padding: '8px 0' }}><StatusBadge status={s} /></td>
              <td style={{ padding: '8px 0', textAlign: 'right' }}>
                <input
                  type="number"
                  min={0}
                  max={MAX_DAYS}
                  step={1}
                  inputMode="numeric"
                  aria-label={`Working days at ${s}`}
                  aria-invalid={!valid(value(s)) || undefined}
                  value={value(s)}
                  onChange={(e) => setDraft((d) => ({ ...d, [s]: e.target.value }))}
                  style={{ width: 72, height: 32, textAlign: 'right', padding: '0 8px', fontFamily: T.font, fontSize: T.fsBase, border: `1px solid ${valid(value(s)) ? T.hairline : T.danger}`, borderRadius: T.radiusField }}
                />
                <span style={{ marginLeft: 8, fontSize: T.fsSmall, color: T.textMuted }}>days</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button
          variant="primary"
          disabled={!changed.length || !allValid || save.isPending}
          onClick={() => save.mutate(Object.fromEntries(changed.map((s) => [s, Number(draft[s])])))}
        >
          Save
        </Button>
        {!allValid && <span role="alert" style={{ fontSize: T.fsSmall, color: T.danger }}>Whole days, 0 to {MAX_DAYS}.</span>}
      </div>
    </div>
  );
}

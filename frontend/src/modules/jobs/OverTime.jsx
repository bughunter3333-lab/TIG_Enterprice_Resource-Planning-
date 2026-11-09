import { Clock } from 'lucide-react';
import { T } from '../../ui/tokens';
import { timeAtStatus } from './jobMetrics';
import { statusLabel } from './jobStatuses';

/**
 * A job that has sat at its status longer than its allowance says so, beside
 * its status: "4d" on a list, the whole sentence on the record
 * (docs/superpowers/specs/2026-11-09-status-times.md). Nothing when it is
 * within its allowance, or its status has none.
 */
export default function OverTime({ job, long = false }) {
  const time = timeAtStatus(job);
  if (!time?.over) return null;
  const said = `At ${statusLabel(job.status)} ${time.days} working day${time.days === 1 ? '' : 's'} — its allowance is ${time.allowed}`;
  return (
    <span
      title={said}
      aria-label={long ? undefined : said}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: T.fsSmall, fontWeight: 600, color: T.warn, whiteSpace: 'nowrap' }}
    >
      <Clock size={12} aria-hidden />{long ? said : `${time.days}d`}
    </span>
  );
}

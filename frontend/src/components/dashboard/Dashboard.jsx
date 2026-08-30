import KpiStrip from './KpiStrip';
import ActivityFeed from './ActivityFeed';
import DecMixChart from './DecMixChart';
import { T, statusColor } from '../../ui/tokens';

const KANBAN_STATUSES = ['QUOTE', 'ORDER', 'In Progress', 'PROOF', 'PRINT', 'FINISH', 'INVOICE', 'PAID'];

function normalizeDate(d) {
  if (!d) return null;
  const m = String(d).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return d;
}

export default function Dashboard({ jobs, onNewJob, onNavigateJobs }) {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  const allJobs = jobs ?? [];

  const revenue = allJobs
    .filter(j => j.status === 'PAID' && (normalizeDate(j.out) ?? normalizeDate(j.due) ?? '').startsWith(thisMonth))
    .reduce((s, j) => s + (j.total ?? 0), 0);

  const jobsOpen = allJobs.filter(j => !['PAID', 'CANCEL'].includes(j.status)).length;
  const dueToday = allJobs.filter(j => normalizeDate(j.due) === today && !['PAID', 'CANCEL'].includes(j.status)).length;
  const paid = allJobs
    .filter(j => j.status === 'PAID' && (normalizeDate(j.out) ?? normalizeDate(j.due) ?? '').startsWith(thisMonth))
    .reduce((s, j) => s + (j.invoicePaid ?? 0), 0);

  return (
    <div>
      <KpiStrip revenue={revenue} jobsOpen={jobsOpen} dueToday={dueToday} paid={paid} onNewJob={onNewJob} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        <ActivityFeed jobs={allJobs} />
        <DecMixChart jobs={allJobs} />
      </div>

      <div style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: 14, fontFamily: T.font }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: T.text, margin: 0 }}>Job Pipeline</h3>
          <button
            onClick={onNavigateJobs}
            style={{ fontSize: 10, color: T.accentStrong, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            View all →
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {KANBAN_STATUSES.map(status => {
            const count = allJobs.filter(j => j.status === status).length;
            return (
              <div
                key={status}
                onClick={onNavigateJobs}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigateJobs(); } }}
                style={{ flex: 1, background: T.panel, borderRadius: T.radius, border: `1px solid ${T.hairline}`, padding: '8px 10px', cursor: 'pointer' }}
              >
                {/* Was 7px, which is not a readable size for a label carrying the
                    status name. At 10px with tracking it reads as the small caps it
                    was trying to be, and the tile sits on panel rather than
                    hairlineSoft so the status colour clears 4.5:1 against it. */}
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: statusColor(status), marginBottom: 4 }}>{status}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{count}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

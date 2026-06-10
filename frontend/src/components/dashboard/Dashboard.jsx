import KpiStrip from './KpiStrip';
import ActivityFeed from './ActivityFeed';
import DecMixChart from './DecMixChart';

const STATUS_COLORS = {
  QUOTE: '#f59e0b', ORDER: '#3b82f6', 'In Progress': '#8b5cf6',
  PROOF: '#06b6d4', PRINT: '#ec4899', FINISH: '#10b981',
  INVOICE: '#a855f7', PAID: '#64748b',
};

const KANBAN_STATUSES = ['QUOTE', 'ORDER', 'In Progress', 'PROOF', 'PRINT', 'FINISH', 'INVOICE', 'PAID'];

export default function Dashboard({ jobs, onNewJob, onNavigateJobs }) {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  const allJobs = jobs ?? [];

  const revenue = allJobs
    .filter(j => j.status === 'PAID' && (j.out ?? j.due ?? '').startsWith(thisMonth))
    .reduce((s, j) => s + (j.total ?? 0), 0);

  const jobsOpen = allJobs.filter(j => !['PAID', 'CANCEL'].includes(j.status)).length;
  const dueToday = allJobs.filter(j => j.due === today && !['PAID', 'CANCEL'].includes(j.status)).length;
  const paid = allJobs
    .filter(j => j.status === 'PAID' && (j.out ?? j.due ?? '').startsWith(thisMonth))
    .reduce((s, j) => s + (j.invoicePaid ?? 0), 0);

  return (
    <div>
      <KpiStrip revenue={revenue} jobsOpen={jobsOpen} dueToday={dueToday} paid={paid} onNewJob={onNewJob} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        <ActivityFeed jobs={allJobs} />
        <DecMixChart jobs={allJobs} />
      </div>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 9, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', margin: 0 }}>Job Pipeline</h3>
          <button
            onClick={onNavigateJobs}
            style={{ fontSize: 10, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}
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
                style={{ flex: 1, background: '#f8fafc', borderRadius: 7, border: '1px solid #e2e8f0', padding: '8px 10px', cursor: 'pointer' }}
              >
                <div style={{ fontSize: 7, fontWeight: 700, color: STATUS_COLORS[status] ?? '#64748b', marginBottom: 4 }}>{status}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{count}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

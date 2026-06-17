import { T, statusColor } from '../../ui/tokens';

export default function ActivityFeed({ jobs }) {
  const recentJobs = [...(jobs ?? [])]
    .sort((a, b) => String(b.id).localeCompare(String(a.id)))
    .slice(0, 8);

  return (
    <div style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: 14, fontFamily: T.font }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: T.text, margin: 0 }}>Recent Activity</h3>
      </div>
      {recentJobs.map(job => (
        <div key={job.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: `1px solid ${T.hairlineSoft}`, alignItems: 'flex-start' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(job.status), flexShrink: 0, marginTop: 4 }} />
          <div>
            <div style={{ fontSize: 11, color: T.headerText }}>
              <strong style={{ color: T.text }}>#{job.id}</strong> {job.customer} — <span style={{ color: statusColor(job.status) }}>{job.status}</span>
            </div>
            <div style={{ fontSize: 10, color: T.textMuted }}>{job.due ? `Due ${job.due}` : 'No due date'}</div>
          </div>
        </div>
      ))}
      {recentJobs.length === 0 && (
        <div style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', padding: '12px 0' }}>No jobs yet</div>
      )}
    </div>
  );
}

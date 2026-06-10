const STATUS_COLORS = {
  QUOTE: '#f59e0b', ORDER: '#3b82f6', 'In Progress': '#8b5cf6',
  PROOF: '#06b6d4', PRINT: '#ec4899', FINISH: '#10b981',
  INVOICE: '#a855f7', PAID: '#64748b', CANCEL: '#ef4444',
};

export default function ActivityFeed({ jobs }) {
  const recentJobs = [...(jobs ?? [])]
    .sort((a, b) => String(b.id).localeCompare(String(a.id)))
    .slice(0, 8);

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 9, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', margin: 0 }}>Recent Activity</h3>
      </div>
      {recentJobs.map(job => (
        <div key={job.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f8fafc', alignItems: 'flex-start' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[job.status] ?? '#94a3b8', flexShrink: 0, marginTop: 4 }} />
          <div>
            <div style={{ fontSize: 11, color: '#334155' }}>
              <strong style={{ color: '#0f172a' }}>#{job.id}</strong> {job.customer} — <span style={{ color: STATUS_COLORS[job.status] ?? '#64748b' }}>{job.status}</span>
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{job.due ? `Due ${job.due}` : 'No due date'}</div>
          </div>
        </div>
      ))}
      {recentJobs.length === 0 && (
        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>No jobs yet</div>
      )}
    </div>
  );
}

import JobCard from './JobCard';

const STATUS_COLORS = {
  QUOTE: '#f59e0b', ORDER: '#3b82f6', 'In Progress': '#8b5cf6',
  'Pick/Pack': '#0ea5e9',
  PROOF: '#06b6d4', PRINT: '#ec4899', FINISH: '#10b981',
  INVOICE: '#a855f7', PAID: '#64748b', CANCEL: '#ef4444',
};

export default function KanbanColumn({ status, jobs, onJobClick }) {
  const color = STATUS_COLORS[status] ?? '#94a3b8';
  return (
    <div style={{ minWidth: 196, maxWidth: 196, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 9px', background: '#f8fafc', border: '1px solid #e2e8f0', borderBottom: 'none', borderRadius: '7px 7px 0 0' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', flex: 1 }}>{status}</span>
        <span style={{ fontSize: 10, background: `${color}20`, color, padding: '0 5px', borderRadius: 8, fontWeight: 700 }}>{jobs.length}</span>
      </div>
      <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderTop: `2px solid ${color}`, borderRadius: '0 0 7px 7px', padding: '6px 6px', overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
        {jobs.map(job => (
          <JobCard key={job.id} job={job} onClick={() => onJobClick(job)} />
        ))}
        {jobs.length === 0 && (
          <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>—</div>
        )}
      </div>
    </div>
  );
}

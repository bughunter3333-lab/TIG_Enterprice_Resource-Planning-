import { T } from '../../ui/tokens';

const STATUS_COLORS = {
  QUOTE: '#f59e0b', ORDER: '#3b82f6', 'In Progress': '#8b5cf6',
  'Pick/Pack': '#0ea5e9',
  PROOF: '#06b6d4', PRINT: '#ec4899', FINISH: '#10b981',
  INVOICE: '#a855f7', PAID: '#64748b', CANCEL: '#ef4444',
};

const DEC_PILL_COLORS = {
  EMB: '#8b5cf620', DTF: '#14b8a620', Screen: '#3b82f620',
  DTG: '#10b98120', Vinyl: '#22c55e20',
};

function parseJobDate(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export default function JobCard({ job, onClick }) {
  const color = STATUS_COLORS[job.status] ?? '#94a3b8';
  const decTypes = [...new Set((job.items ?? []).map(i => i.decorationType).filter(d => d && d !== 'None'))];
  const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
  const dueDate = parseJobDate(job.due);
  const overdue = dueDate && dueDate < todayDate && !['PAID', 'CANCEL'].includes(job.status);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{
        background: T.panel, borderRadius: 7, border: `1px solid ${T.hairline}`,
        borderLeft: `3px solid ${color}`, padding: '8px 10px', cursor: 'pointer',
        marginBottom: 6, boxShadow: '0 1px 2px rgba(0,0,0,.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: T.accentStrong, fontWeight: 700 }}>#{job.id}</span>
        <span style={{ fontSize: 11, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{job.customer}</span>
      </div>
      {job.description && (
        <div style={{ fontSize: 10, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{job.description}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {decTypes.slice(0, 2).map(d => (
          <span key={d} style={{ fontSize: 8, background: DEC_PILL_COLORS[d] ?? T.hairlineSoft, color: T.textMuted, padding: '1px 5px', borderRadius: 4 }}>{d}</span>
        ))}
        {job.due && (
          <span style={{ fontSize: 8, color: overdue ? T.danger : T.textFaint, marginLeft: 'auto' }}>{overdue ? '⚠ ' : ''}{job.due}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>${(job.total ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}</span>
      </div>
    </div>
  );
}

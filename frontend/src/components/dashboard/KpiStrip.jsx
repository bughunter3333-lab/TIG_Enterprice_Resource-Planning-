export default function KpiStrip({ revenue, jobsOpen, dueToday, paid, onNewJob }) {
  const kpis = [
    { label: 'Revenue', value: `$${(revenue ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`, color: '#3b82f6' },
    { label: 'Jobs Open', value: jobsOpen ?? 0, color: '#f59e0b' },
    { label: 'Due Today', value: dueToday ?? 0, color: '#ef4444' },
    { label: 'Paid (MTD)', value: `$${(paid ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`, color: '#10b981' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr) 120px', gap: 10, marginBottom: 16 }}>
      {kpis.map(kpi => (
        <div key={kpi.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 9, padding: '13px 15px' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginBottom: 4 }}>{kpi.label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
        </div>
      ))}
      <div
        onClick={onNewJob}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNewJob(); } }}
        style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', borderRadius: 9, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 3, cursor: 'pointer' }}
      >
        <div style={{ fontSize: 9, color: '#93c5fd' }}>Quick add</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>+ New Job</div>
      </div>
    </div>
  );
}

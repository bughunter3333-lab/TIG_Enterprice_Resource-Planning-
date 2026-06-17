import { T } from '../../ui/tokens';

export default function KpiStrip({ revenue, jobsOpen, dueToday, paid, onNewJob }) {
  const kpis = [
    { label: 'Revenue', value: `$${(revenue ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`, color: T.text },
    { label: 'Jobs Open', value: jobsOpen ?? 0, color: T.accentStrong },
    { label: 'Due Today', value: dueToday ?? 0, color: T.danger },
    { label: 'Paid (MTD)', value: `$${(paid ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`, color: T.ok },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr) 120px', gap: 10, marginBottom: 16, fontFamily: T.font }}>
      {kpis.map(kpi => (
        <div key={kpi.label} style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: '13px 15px' }}>
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 500, marginBottom: 4 }}>{kpi.label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: kpi.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{kpi.value}</div>
        </div>
      ))}
      <div
        onClick={onNewJob}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNewJob(); } }}
        style={{ background: T.accentStrong, borderRadius: T.radius, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 3, cursor: 'pointer' }}
      >
        <div style={{ fontSize: 9, color: T.accentTint }}>Quick add</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>+ New Job</div>
      </div>
    </div>
  );
}

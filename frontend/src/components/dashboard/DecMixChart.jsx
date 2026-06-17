import { T } from '../../ui/tokens';

const DEC_COLORS = {
  EMB: '#8b5cf6', DTF: '#14b8a6', Screen: '#3b82f6',
  DTG: '#10b981', Vinyl: '#22c55e', Sub: '#ec4899',
  Pad: '#f59e0b', Laser: '#ef4444', TRS: '#f97316',
};

export default function DecMixChart({ jobs }) {
  const counts = {};
  (jobs ?? []).forEach(job => {
    (job.items ?? []).forEach(item => {
      const d = item.decorationType;
      if (d && d !== 'None') counts[d] = (counts[d] ?? 0) + 1;
    });
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: 14, fontFamily: T.font }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: T.text, margin: 0 }}>Decoration Mix</h3>
      </div>
      {entries.length === 0 && (
        <div style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', padding: '12px 0' }}>No decoration data</div>
      )}
      {entries.map(([type, count]) => (
        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <div style={{ fontSize: 10, color: T.textMuted, width: 44, flexShrink: 0 }}>{type}</div>
          <div style={{ flex: 1, height: 5, background: T.hairlineSoft, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: DEC_COLORS[type] ?? T.textMuted, borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 10, color: T.textMuted, width: 20, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{count}</div>
        </div>
      ))}
    </div>
  );
}

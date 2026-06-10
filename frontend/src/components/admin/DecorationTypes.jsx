import { useState } from 'react';

const ALL_DEC_TYPES = ['EMB', 'TRS', 'Screen', 'DTF', 'DTG', 'Sub', 'Pad', 'Laser', 'Vinyl'];

export default function DecorationTypes({ config, onChange }) {
  const [enabled, setEnabled] = useState(() => new Set(config ?? ALL_DEC_TYPES));

  function toggle(type) {
    const next = new Set(enabled);
    next.has(type) ? next.delete(type) : next.add(type);
    setEnabled(next);
    onChange([...next]);
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
        Disabled types are hidden from the job form and decoration mix chart.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {ALL_DEC_TYPES.map(type => {
          const on = enabled.has(type);
          return (
            <button
              key={type}
              onClick={() => toggle(type)}
              style={{
                padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: on ? '#f59e0b20' : '#1e293b',
                color: on ? '#fbbf24' : '#475569',
                border: `1px solid ${on ? '#f59e0b40' : '#334155'}`,
              }}
            >
              {type}
            </button>
          );
        })}
      </div>
    </div>
  );
}

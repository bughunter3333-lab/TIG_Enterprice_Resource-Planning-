import { useState } from 'react';
import { T } from '../../ui/tokens';

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
      <p style={{ fontSize: 11, color: T.chromeTextMuted, marginBottom: 12 }}>
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
                background: on ? '#f59e0b20' : T.chromeRaised,
                color: on ? T.accent : T.chromeTextMuted,
                border: `1px solid ${on ? '#f59e0b40' : T.chromeHover}`,
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

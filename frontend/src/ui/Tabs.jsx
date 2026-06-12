import { T } from './tokens';

export default function Tabs({ tabs, active, onChange }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${T.hairline}`, fontFamily: T.font }}>
      {tabs.map(t => {
        const isActive = t.id === active;
        return (
          <div
            key={t.id}
            role="tab"
            tabIndex={0}
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(t.id); } }}
            style={{
              padding: '6px 12px',
              fontSize: T.fsGrid,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? T.text : T.textMuted,
              borderBottom: isActive ? `2px solid ${T.accent}` : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {t.label}
          </div>
        );
      })}
    </div>
  );
}

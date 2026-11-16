import { T } from './tokens';

/**
 * Section tabs on a record page: an underline in the one blue marks where you
 * are. (For switching a view of the same data — List / Board — use
 * SegmentedControl instead.) An optional `count` on a tab says how much is in
 * that section before you open it.
 */
export default function Tabs({ tabs, active, onChange, bare = false }) {
  // `bare` drops the rule beneath the tabs, for a tab bar that is itself the
  // edge of a card.
  return (
    <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: bare ? 'none' : `1px solid ${T.hairline}`, fontFamily: T.font, overflowX: 'auto' }}>
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
            // Inactive tabs lift toward full text colour on hover; the active
            // one is already at full strength.
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = T.text; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = T.textMuted; }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 4px', margin: '0 6px',
              fontSize: T.fsGrid,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? T.text : T.textMuted,
              boxShadow: isActive ? `inset 0 -2px 0 ${T.accent}` : 'none',
              marginBottom: -1,
              cursor: 'pointer',
              userSelect: 'none',
              transition: `color ${T.transition}, box-shadow ${T.transition}`,
            }}
          >
            {t.label}
            {t.count != null && (
              <span style={{
                minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? T.accentTint : T.hairlineSoft, color: isActive ? T.accentStrong : T.textMuted,
                fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              }}>
                {t.count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

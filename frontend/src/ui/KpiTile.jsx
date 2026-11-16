import { T } from './tokens';

const TONES = { default: T.text, danger: T.danger, ok: T.ok, accent: T.accentStrong };

/**
 * A figure in a strip of figures (a module's header): the label above, the
 * value large and tabular beneath it, an optional note after. Separated from
 * its neighbour by a hairline, not a box — a strip, not a row of cards.
 */
export default function KpiTile({ label, value, sub, tone = 'default' }) {
  return (
    <div style={{
      background: T.panel, padding: '10px 16px', fontFamily: T.font, borderRight: `1px solid ${T.hairline}`,
      display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110,
    }}>
      <span style={{ fontSize: T.fsSmall, fontWeight: 500, color: T.textMuted }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: TONES[tone] ?? T.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {sub && <span style={{ fontSize: T.fsSmall, color: T.textFaint }}>{sub}</span>}
      </span>
    </div>
  );
}

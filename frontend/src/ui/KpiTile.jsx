import { T } from './tokens';

const TONES = { default: T.text, danger: T.danger, ok: T.ok, accent: T.accentStrong };

export default function KpiTile({ label, value, sub, tone = 'default' }) {
  return (
    <div style={{ background: T.panel, padding: '6px 10px', fontFamily: T.font, borderRight: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 90 }}>
      {/* Only 400/500/600/700 of IBM Plex are loaded, so a nominal 800 just
          matched down to 700 — the same weight as this label, giving the
          value no presence at all. 600/700 is a step that actually exists. */}
      <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: TONES[tone] ?? T.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: T.textFaint }}>{sub}</span>}
    </div>
  );
}

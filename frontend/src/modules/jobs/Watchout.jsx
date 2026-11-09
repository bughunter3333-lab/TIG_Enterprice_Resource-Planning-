import { TriangleAlert } from 'lucide-react';
import { T } from '../../ui/tokens';

/**
 * A customer's watchout — "always ask if name badges are needed" — where the
 * job is taken and worked on (docs/superpowers/specs/2026-11-09-watchouts.md).
 * Nothing when the customer has none.
 */
export default function Watchout({ text, style }) {
  const said = (text ?? '').trim();
  if (!said) return null;
  return (
    <div
      role="note"
      aria-label="Watchout"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px',
        background: T.warnTint, color: T.text, border: `1px solid ${T.warn}`, borderRadius: T.radius,
        fontSize: T.fsBase, lineHeight: 1.45, ...style,
      }}
    >
      <TriangleAlert size={16} color={T.warn} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
      <span><strong style={{ fontWeight: 600 }}>Watchout:</strong> <span style={{ whiteSpace: 'pre-wrap' }}>{said}</span></span>
    </div>
  );
}

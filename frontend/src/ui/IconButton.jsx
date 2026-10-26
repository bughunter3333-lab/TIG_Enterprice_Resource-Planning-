import { T } from './tokens';

/**
 * A square icon-only control: the "…" menu on a card, expand, close. It must
 * have a `label` — an icon is not a name — which becomes its accessible name
 * and tooltip. `bordered` draws the hairline box used on card headers; without
 * it the button is bare until hovered.
 */
export default function IconButton({ icon: Icon, label, bordered = false, size = 32, active = false, style, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      style={{
        appearance: 'none', cursor: 'pointer', flexShrink: 0,
        width: size, height: size, borderRadius: T.radius,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: bordered ? `1px solid ${T.hairline}` : '1px solid transparent',
        background: active ? T.accentTint : bordered ? T.panel : 'transparent',
        color: active ? T.accentStrong : T.textMuted,
        boxShadow: bordered ? T.shadowSm : 'none',
        transition: `background ${T.transition}, color ${T.transition}`,
        ...style,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hairlineSoft; e.currentTarget.style.color = T.text; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = bordered ? T.panel : 'transparent'; e.currentTarget.style.color = T.textMuted; } }}
      {...rest}
    >
      {Icon && <Icon size={16} aria-hidden />}
    </button>
  );
}

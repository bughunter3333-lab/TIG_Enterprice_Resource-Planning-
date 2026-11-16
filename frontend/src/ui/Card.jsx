import { T } from './tokens';

/**
 * A surface: white, a hairline, a 12px corner and the faintest resting lift.
 * `title` and `actions` make a header row (title at the left, controls at the
 * right); `footer` a quiet strip along the bottom for "from last month · See
 * detail"-style context. Cards never nest: inside one, group with spacing or a
 * hairline, not another card.
 */
export default function Card({ title, info, actions, footer, children, padding = 16, style, bodyStyle, ...rest }) {
  return (
    <section
      style={{
        background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg,
        boxShadow: T.shadowSm, fontFamily: T.font, display: 'flex', flexDirection: 'column',
        minWidth: 0, ...style,
      }}
      {...rest}
    >
      {(title || actions) && (
        <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: `${padding - 2}px ${padding}px 0` }}>
          {title && (
            <h2 style={{ margin: 0, fontSize: T.fsSection, fontWeight: 600, color: T.text, letterSpacing: '-0.01em', flex: 1, minWidth: 0 }}>
              {title}
              {info && <span style={{ marginLeft: 6, fontSize: T.fsSmall, fontWeight: 400, color: T.textFaint }}>{info}</span>}
            </h2>
          )}
          {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>{actions}</div>}
        </header>
      )}
      <div style={{ padding, flex: 1, minWidth: 0, ...bodyStyle }}>{children}</div>
      {footer && (
        <footer style={{
          margin: `0 ${padding / 2}px ${padding / 2}px`, padding: '8px 10px',
          background: T.panelAlt, border: `1px solid ${T.hairlineSoft}`, borderRadius: T.radius,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: T.fsSmall, color: T.textMuted,
        }}>
          {footer}
        </footer>
      )}
    </section>
  );
}

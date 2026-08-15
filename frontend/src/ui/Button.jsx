import { useState } from 'react';
import { T } from './tokens';

const VARIANTS = {
  primary:   { background: T.accentStrong, color: '#fff', border: `1px solid ${T.accentStrong}` },
  secondary: { background: T.panel, color: T.text, border: `1px solid ${T.hairline}` },
  danger:    { background: T.danger, color: '#fff', border: `1px solid ${T.danger}` },
  ghost:     { background: 'transparent', color: T.textMuted, border: '1px solid transparent' },
};

// Hover deltas stay inside the existing token steps so no new colours enter
// the system. `ghost` needs the strongest shift — resting, it is muted text
// with a transparent border and reads as a label rather than a control.
const HOVER = {
  primary:   { background: T.accent, border: `1px solid ${T.accent}` },
  secondary: { background: T.hairlineSoft, border: `1px solid ${T.textFaint}` },
  danger:    { filter: 'brightness(.92)' },
  ghost:     { background: T.hairlineSoft, color: T.text },
};

export default function Button({
  variant = 'secondary', size = 'md', children, disabled, style,
  onMouseEnter, onMouseLeave, onMouseDown, onMouseUp,
  ...rest
}) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);

  const base = VARIANTS[variant] ?? VARIANTS.secondary;
  const hovered = !disabled && hover ? (HOVER[variant] ?? HOVER.secondary) : null;

  return (
    <button
      type="button"
      disabled={disabled}
      // Handlers are composed, not overwritten — a caller passing its own
      // onMouseEnter must not silently kill the hover state.
      onMouseEnter={e => { setHover(true); onMouseEnter?.(e); }}
      onMouseLeave={e => { setHover(false); setPressed(false); onMouseLeave?.(e); }}
      onMouseDown={e => { setPressed(true); onMouseDown?.(e); }}
      onMouseUp={e => { setPressed(false); onMouseUp?.(e); }}
      style={{
        ...base,
        ...(hovered ?? {}),
        fontFamily: T.font,
        fontSize: size === 'sm' ? T.fsSmall : T.fsGrid,
        fontWeight: 600,
        borderRadius: T.radius,
        padding: size === 'sm' ? '3px 8px' : '5px 12px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        // Pressed reads as an inset, never a lift — controls don't elevate.
        boxShadow: !disabled && pressed ? 'inset 0 1px 2px rgba(24,42,66,.18)' : 'none',
        transition: `background ${T.transition}, color ${T.transition}, box-shadow ${T.transition}`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

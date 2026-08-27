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
  // An explicit disabled palette rather than blanket translucency: opacity
  // lets the panel/grid behind show through fill and border unevenly, so a
  // disabled button reads as half-loaded instead of deliberately inactive.
  const off = disabled
    ? (variant === 'ghost'
        ? { color: T.textFaint }
        : { background: T.hairlineSoft, color: T.textFaint, border: `1px solid ${T.hairline}` })
    : null;

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
        ...(off ?? {}),
        fontFamily: T.font,
        fontSize: size === 'sm' || size === 'tile' ? T.fsSmall : T.fsGrid,
        fontWeight: 600,
        borderRadius: T.radius,
        padding: size === 'sm' ? '3px 8px' : size === 'tile' ? '9px 6px' : '5px 12px',
        cursor: disabled ? 'default' : 'pointer',
        // `tile` stacks an icon over its label for a grid of actions. It is a
        // shape, not a new palette — the same four variants apply, so a row of
        // tiles says which action is primary instead of being six decorative
        // pastels that happen to sit together.
        display: size === 'tile' ? 'flex' : 'inline-flex',
        flexDirection: size === 'tile' ? 'column' : 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: size === 'tile' ? 4 : 5,
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

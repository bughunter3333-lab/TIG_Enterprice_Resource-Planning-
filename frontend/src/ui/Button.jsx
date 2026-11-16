import { useState } from 'react';
import { T } from './tokens';

// One blue means "do this" (primary); everything else is a quiet white button
// with a hairline, so a toolbar shows at a glance which action matters.
const VARIANTS = {
  primary:   { background: T.accent, color: '#fff', border: `1px solid ${T.accent}`, boxShadow: '0 1px 2px rgba(11,99,246,.22), inset 0 1px 0 rgba(255,255,255,.12)' },
  secondary: { background: T.panel, color: T.text, border: `1px solid ${T.hairline}`, boxShadow: T.shadowSm },
  danger:    { background: T.danger, color: '#fff', border: `1px solid ${T.danger}`, boxShadow: '0 1px 2px rgba(192,38,45,.22)' },
  ghost:     { background: 'transparent', color: T.textMuted, border: '1px solid transparent', boxShadow: 'none' },
};

// Hover deltas stay inside the existing token steps so no new colours enter
// the system. `ghost` needs the strongest shift — resting, it is muted text
// with a transparent border and reads as a label rather than a control.
const HOVER = {
  primary:   { background: T.accentStrong, border: `1px solid ${T.accentStrong}` },
  secondary: { background: T.panelAlt, border: `1px solid ${T.fieldBorder}` },
  danger:    { filter: 'brightness(.92)' },
  ghost:     { background: T.hairlineSoft, color: T.text },
};

// Heights, not paddings: buttons in one row line up whatever their label.
const HEIGHTS = { sm: 28, md: 32, lg: 36 };

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
        : { background: T.hairlineSoft, color: T.textFaint, border: `1px solid ${T.hairline}`, boxShadow: 'none' })
    : null;
  const tile = size === 'tile';

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
        fontSize: size === 'sm' || tile ? T.fsSmall : T.fsGrid,
        fontWeight: 500,
        letterSpacing: '-0.005em',
        borderRadius: T.radius,
        height: tile ? undefined : HEIGHTS[size] ?? HEIGHTS.md,
        padding: tile ? '10px 6px' : size === 'sm' ? '0 10px' : '0 12px',
        cursor: disabled ? 'default' : 'pointer',
        // `tile` stacks an icon over its label for a grid of actions. It is a
        // shape, not a new palette — the same four variants apply, so a row of
        // tiles says which action is primary instead of being six decorative
        // pastels that happen to sit together.
        display: tile ? 'flex' : 'inline-flex',
        flexDirection: tile ? 'column' : 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: tile ? 4 : 6,
        whiteSpace: 'nowrap',
        // Pressed reads as an inset, never a lift — controls don't elevate.
        ...(!disabled && pressed ? { boxShadow: 'inset 0 1px 2px rgba(17,17,20,.16)' } : {}),
        transition: `background ${T.transition}, color ${T.transition}, border-color ${T.transition}, box-shadow ${T.transition}`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

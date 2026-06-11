import { T } from './tokens';

const VARIANTS = {
  primary:   { background: T.accentStrong, color: '#fff', border: `1px solid ${T.accentStrong}` },
  secondary: { background: T.panel, color: T.text, border: `1px solid ${T.hairline}` },
  danger:    { background: T.danger, color: '#fff', border: `1px solid ${T.danger}` },
  ghost:     { background: 'transparent', color: T.textMuted, border: '1px solid transparent' },
};

export default function Button({ variant = 'secondary', size = 'md', children, disabled, style, ...rest }) {
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        ...(VARIANTS[variant] ?? VARIANTS.secondary),
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
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

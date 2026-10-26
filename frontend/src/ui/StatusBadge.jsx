import { statusColor, statusTint, T } from './tokens';

/**
 * A job's status as a chip: the phase's colour on its own pale tint, with a
 * dot. The word carries the status (it passes 4.5:1 on its tint); the dot and
 * the tint only say which phase it is in, so nothing depends on colour alone.
 */
export default function StatusBadge({ status, size = 'md' }) {
  if (!status) return null;
  const small = size === 'sm';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      height: small ? 18 : 20, padding: small ? '0 6px' : '0 7px',
      borderRadius: T.radiusSm,
      background: statusTint(status),
      color: statusColor(status),
      fontWeight: 600,
      fontSize: small ? 10.5 : 11,
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      lineHeight: 1,
      whiteSpace: 'nowrap',
    }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {status}
    </span>
  );
}

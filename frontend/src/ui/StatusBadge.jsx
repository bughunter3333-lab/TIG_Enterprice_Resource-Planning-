import { statusColor, T } from './tokens';

export default function StatusBadge({ status, size = 'md' }) {
  if (!status) return null;
  return (
    <span style={{
      color: statusColor(status),
      fontWeight: 600,
      fontSize: size === 'sm' ? 10 : T.fsHeader,
      textTransform: 'uppercase',
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

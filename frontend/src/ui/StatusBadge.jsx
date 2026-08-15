import { statusColor, T } from './tokens';

export default function StatusBadge({ status, size = 'md' }) {
  if (!status) return null;
  return (
    <span style={{
      color: statusColor(status),
      // 700 to match the hand-rolled status spans in DispatchList/JobListBuilder
      // and to give 11px uppercase micro-type enough presence.
      fontWeight: 700,
      fontSize: size === 'sm' ? 10 : T.fsHeader,
      textTransform: 'uppercase',
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

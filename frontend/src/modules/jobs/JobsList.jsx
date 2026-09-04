import DataGrid from '../../ui/DataGrid';
import StatusBadge from '../../ui/StatusBadge';
import { T } from '../../ui/tokens';

const money = (v) => `$${(v ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;
const decoration = (job) => [...new Set((job.items ?? []).map(i => i.decorationType).filter(d => d && d !== 'None'))][0] ?? '—';

const COLUMNS = [
  { key: 'id', label: 'Job#', width: 80, render: (j) => <span style={{ fontWeight: 700, color: T.accentStrong }}>{j.id}</span> },
  { key: 'customer', label: 'Customer' },
  // On a multi-site order this is the only column that differs between rows —
  // same customer, status, decoration and date all the way down. It already
  // drove the filter bar and the search; it was never drawn.
  {
    key: 'shipTo',
    label: 'Ship#',
    width: 92,
    render: (j) =>
      j.shipTo
        ? <span style={{ fontFamily: T.fontMono, color: T.text }}>{j.shipTo}</span>
        : <span style={{ color: T.textFaint }}>—</span>,
  },
  { key: 'status', label: 'Status', width: 100, render: (j) => <StatusBadge status={j.status} /> },
  { key: 'dec', label: 'Dec', width: 90, render: decoration },
  { key: 'priority', label: 'Priority', width: 70 },
  { key: 'accMgr', label: 'Acc Mgr', width: 70 },
  { key: 'total', label: 'Total', width: 80, align: 'right', render: (j) => money(j.total) },
  { key: 'due', label: 'Due', width: 90 },
];

export default function JobsList({ jobs, onJobClick, lockedStatus, groupBy }) {
  const columns = lockedStatus
    ? COLUMNS.filter(col => col.key !== 'status')
    : COLUMNS;

  return (
    <DataGrid
      columns={columns}
      rows={jobs}
      rowKey="id"
      onRowClick={onJobClick}
      groupBy={groupBy || undefined}
      emptyText="No jobs match the current filters"
    />
  );
}

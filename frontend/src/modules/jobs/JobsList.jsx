import DataGrid from '../../ui/DataGrid';
import StatusBadge from '../../ui/StatusBadge';
import { T } from '../../ui/tokens';

const money = (v) => `$${(v ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;
const decoration = (job) => [...new Set((job.items ?? []).map(i => i.decorationType).filter(d => d && d !== 'None'))][0] ?? '—';

const COLUMNS = [
  { key: 'id', label: 'Job#', width: 80, render: (j) => <span style={{ fontWeight: 700, color: T.accentStrong }}>{j.id}</span> },
  { key: 'customer', label: 'Customer' },
  { key: 'status', label: 'Status', width: 100, render: (j) => <StatusBadge status={j.status} /> },
  { key: 'dec', label: 'Dec', width: 90, render: decoration },
  { key: 'priority', label: 'Priority', width: 70 },
  { key: 'accMgr', label: 'Acc Mgr', width: 70 },
  { key: 'total', label: 'Total', width: 80, align: 'right', render: (j) => money(j.total) },
  { key: 'due', label: 'Due', width: 90 },
];

export default function JobsList({ jobs, onJobClick }) {
  return (
    <DataGrid
      columns={COLUMNS}
      rows={jobs}
      rowKey="id"
      onRowClick={onJobClick}
      emptyText="No jobs match the current filters"
    />
  );
}

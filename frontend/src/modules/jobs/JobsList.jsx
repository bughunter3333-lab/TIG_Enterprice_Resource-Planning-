import { dayKey, formatDay } from '../../lib/dates';
import DataGrid from '../../ui/DataGrid';
import StatusBadge from '../../ui/StatusBadge';
import { T } from '../../ui/tokens';

const money = (v) => `$${(v ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;
const decoration = (job) => [...new Set((job.items ?? []).map(i => i.decorationType).filter(d => d && d !== 'None'))][0] ?? '—';
const dash = <span style={{ color: T.textFaint }}>—</span>;

const COLUMNS = [
  // The job number is what people say out loud and type into search: set in
  // mono so 1207503 and 1207508 read apart at a glance.
  { key: 'id', label: 'Job#', width: 92, render: (j) => <span style={{ fontFamily: T.fontMono, fontWeight: 500, color: T.accent }}>{j.id}</span> },
  { key: 'customer', label: 'Customer', render: (j) => <span style={{ fontWeight: 500 }}>{j.customer}</span> },
  // On a multi-site order this is the only column that differs between rows —
  // same customer, status, decoration and date all the way down. It already
  // drove the filter bar and the search; it was never drawn.
  {
    key: 'shipTo',
    label: 'Ship#',
    width: 104,
    render: (j) => (j.shipTo ? <span style={{ fontFamily: T.fontMono, fontSize: T.fsSmall, color: T.text }}>{j.shipTo}</span> : dash),
  },
  // Wide enough for the longest chip (IN PROGRESS, DESP/READY), so none is cut.
  { key: 'status', label: 'Status', width: 132, render: (j) => <StatusBadge status={j.status} /> },
  { key: 'dec', label: 'Dec', width: 72, render: (j) => <span style={{ color: T.textMuted }}>{decoration(j)}</span> },
  {
    key: 'priority', label: 'Priority', width: 78,
    render: (j) => <span style={{ color: ['High', 'Urgent'].includes(j.priority) ? T.danger : T.textMuted, fontWeight: ['High', 'Urgent'].includes(j.priority) ? 500 : 400 }}>{j.priority}</span>,
  },
  { key: 'accMgr', label: 'Acc Mgr', width: 84, render: (j) => <span style={{ color: T.textMuted }}>{j.accMgr || '—'}</span> },
  { key: 'total', label: 'Total', width: 92, align: 'right', render: (j) => <span style={{ fontWeight: 500 }}>{money(j.total)}</span> },
  // Stored as ISO or day-first text; shown one way and sorted by the day.
  { key: 'due', label: 'Due', width: 124, render: (j) => formatDay(j.due) || '—', sortValue: (j) => dayKey(j.due) },
];

// A tick box per row, and one in the header for every job shown, when the list
// is given a selection. A click on a box selects; it never opens the job.
function selectionColumn(jobs, selected, onSelectedChange) {
  const all = jobs.length > 0 && jobs.every(j => selected.has(j.id));
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectedChange(next);
  };
  const stop = (e) => e.stopPropagation();
  return {
    key: '_select',
    width: 36,
    label: (
      <input
        type="checkbox"
        aria-label="Select all jobs shown"
        checked={all}
        onClick={stop}
        onChange={() => onSelectedChange(all ? new Set() : new Set(jobs.map(j => j.id)))}
      />
    ),
    render: (j) => (
      <input
        type="checkbox"
        aria-label={`Select job ${j.id}`}
        checked={selected.has(j.id)}
        onClick={stop}
        onChange={() => toggle(j.id)}
      />
    ),
  };
}

export default function JobsList({ jobs, onJobClick, lockedStatus, groupBy, selected, onSelectedChange }) {
  const shown = lockedStatus
    ? COLUMNS.filter(col => col.key !== 'status')
    : COLUMNS;
  const columns = onSelectedChange
    ? [selectionColumn(jobs, selected ?? new Set(), onSelectedChange), ...shown]
    : shown;

  return (
    <DataGrid
      columns={columns}
      rows={jobs}
      rowKey="id"
      onRowClick={onJobClick}
      groupBy={groupBy || undefined}
      emptyText="No jobs match the current filters"
      emptyHint="Take a filter off, or start a new job."
    />
  );
}

import DataGrid from '../../ui/DataGrid';
import { T } from '../../ui/tokens';

const money = (v) => `$${(Number(v) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// PO statuses have their own palette (distinct from job StatusBadge).
const PO_STATUS_COLOR = {
  Draft: T.textMuted, Sent: T.accentStrong, Partial: '#b45309',
  Received: T.ok, Cancelled: T.danger,
};

const COLUMNS = [
  { key: 'id', label: 'PO#', width: 100, render: (p) => <span style={{ fontWeight: 700, color: T.accentStrong }}>{p.id}</span> },
  { key: 'supplier', label: 'Supplier' },
  { key: 'status', label: 'Status', width: 90, render: (p) => (
      <span style={{ color: PO_STATUS_COLOR[p.status] || T.textMuted, fontWeight: 600 }}>{p.status}</span>
    ) },
  { key: 'date', label: 'Date', width: 90 },
  { key: 'expectedDate', label: 'Expected', width: 90 },
  { key: 'total', label: 'Total', width: 100, align: 'right', render: (p) => money(p.total) },
];

export default function POList({ pos, selectedId, onSelect }) {
  return (
    <DataGrid
      columns={COLUMNS}
      rows={pos}
      rowKey="id"
      selectedKey={selectedId}
      onRowClick={onSelect}
      emptyText="No purchase orders match"
    />
  );
}

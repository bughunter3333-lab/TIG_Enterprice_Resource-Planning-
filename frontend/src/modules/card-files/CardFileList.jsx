import DataGrid from '../../ui/DataGrid';
import { T } from '../../ui/tokens';

const location = (c) => [c.suburb, c.state].filter(Boolean).join(', ');

const COLUMNS = [
  { key: 'shipCode', label: 'Ship Code', width: 110, render: (c) => <span style={{ fontWeight: 700, color: T.accentStrong }}>{c.shipCode}</span> },
  { key: 'companyName', label: 'Company', render: (c) => c.companyName || c.customerCode || '—' },
  { key: 'location', label: 'Location', width: 150, render: (c) => location(c) || '—' },
  { key: 'group', label: 'Group', width: 90, render: (c) => c.group || '—' },
];

export default function CardFileList({ cards, selectedId, onSelect }) {
  return (
    <DataGrid
      columns={COLUMNS}
      rows={cards}
      rowKey="shipCode"
      selectedKey={selectedId}
      onRowClick={onSelect}
      emptyText="No card files match"
    />
  );
}

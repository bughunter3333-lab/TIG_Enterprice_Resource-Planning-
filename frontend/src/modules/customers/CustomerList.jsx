import DataGrid from '../../ui/DataGrid';
import { T } from '../../ui/tokens';
import { custOutstanding } from './customerAggregates';

const money0 = (v) => `$${Math.round(Number(v) || 0).toLocaleString('en-AU')}`;

export default function CustomerList({ customers, jobs, selectedId, onSelect }) {
  const columns = [
    { key: 'name', label: 'Customer', render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
          <span style={{ fontSize: 10, color: T.textFaint, fontVariantNumeric: 'tabular-nums' }}>{c.id}</span>
        </span>
      ) },
    { key: 'balance', label: 'Balance', width: 90, align: 'right', render: (c) => {
        const out = custOutstanding(c, jobs);
        return <span style={{ color: out > 0 ? T.danger : T.textMuted, fontWeight: 600 }}>{money0(out)}</span>;
      } },
    { key: 'creditLimit', label: 'Credit', width: 90, align: 'right', render: (c) => money0(c.creditLimit) },
  ];
  return (
    <DataGrid
      columns={columns}
      rows={customers}
      rowKey="id"
      selectedKey={selectedId}
      onRowClick={onSelect}
      emptyText="No customers found"
    />
  );
}

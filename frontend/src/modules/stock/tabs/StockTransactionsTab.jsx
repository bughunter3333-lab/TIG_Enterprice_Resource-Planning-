import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import DataGrid from '../../../ui/DataGrid';
import { T } from '../../../ui/tokens';

const linkCell = (value, onClick) =>
  value ? (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onClick(value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClick(value); } }}
      style={{ color: T.accentStrong, fontWeight: 600, cursor: 'pointer' }}
    >
      {value}
    </span>
  ) : '—';

export default function StockTransactionsTab({ sku, onNavigateJob, onNavigatePO }) {
  const { data, error, refetch } = useQuery({
    queryKey: ['stock-transactions', sku],
    queryFn: () => stock.transactions(sku, { limit: 100 }),
  });
  const columns = [
    { key: 'id', label: 'Tran#', width: 80 },
    { key: 'date', label: 'Date', width: 80 },
    { key: 'type', label: 'Type', width: 80 },
    { key: 'reference', label: 'Ref#', width: 80 },
    { key: 'location_branch', label: 'Loc', width: 50 },
    { key: 'quantity', label: 'Qty', width: 50, align: 'right' },
    { key: 'qty_bal', label: 'Bal', width: 50, align: 'right' },
    { key: 'po_id', label: 'PO#', width: 70, render: (r) => linkCell(r.po_id, onNavigatePO) },
    { key: 'job_id', label: 'Job#', width: 70, render: (r) => linkCell(r.job_id, onNavigateJob) },
    { key: 'bin', label: 'Bin', width: 60 },
  ];
  return (
    <DataGrid
      columns={columns}
      rows={error ? [] : data}
      rowKey="id"
      error={error ? (error.message || 'Failed to load transactions') : undefined}
      onRetry={refetch}
      emptyText="No stock movements"
    />
  );
}

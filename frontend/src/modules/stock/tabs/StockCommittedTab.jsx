import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import DataGrid from '../../../ui/DataGrid';
import { T } from '../../../ui/tokens';
import { money } from '../stockFormat';

export default function StockCommittedTab({ sku, onNavigateJob }) {
  const { data, error, refetch } = useQuery({
    queryKey: ['stock-committed', sku],
    queryFn: () => stock.committed(sku),
  });
  const columns = [
    { key: 'card_code', label: 'Card', width: 70 },
    { key: 'customer_name', label: 'Customer' },
    { key: 'job_ref', label: 'Job#', width: 70, render: (r) => (
        <span role="button" tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onNavigateJob && onNavigateJob(r.job_id); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onNavigateJob && onNavigateJob(r.job_id); } }}
          style={{ color: T.accentStrong, fontWeight: 600, cursor: 'pointer' }}>{r.job_ref}</span>
      ) },
    { key: 'date', label: 'Date', width: 80 },
    { key: 'location_branch', label: 'Loc', width: 50 },
    { key: 'qty', label: 'Qty', width: 50, align: 'right' },
    { key: 'unit', label: 'Unit', width: 55 },
    { key: 'price_inc', label: 'Price Inc', width: 80, align: 'right', render: (r) => money(r.price_inc) },
    { key: 'total_aud', label: 'Total', width: 80, align: 'right', render: (r) => money(r.total_aud) },
  ];
  return (
    <DataGrid
      columns={columns}
      rows={error ? [] : (data || []).map((r, i) => ({ ...r, _rowId: `${r.job_id}-${i}` }))}
      rowKey="_rowId"
      error={error ? (error.message || 'Failed to load committed') : undefined}
      onRetry={refetch}
      emptyText="No committed stock"
    />
  );
}

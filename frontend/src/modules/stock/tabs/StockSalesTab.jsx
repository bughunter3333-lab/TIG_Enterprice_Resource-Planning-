import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import DataGrid from '../../../ui/DataGrid';
import { T } from '../../../ui/tokens';

// Jim2 Stock "Sales" tab: the sale movements for this SKU — which jobs and
// customers actually consumed the stock (the shipped/invoiced slice).
export default function StockSalesTab({ sku, onNavigateJob }) {
  const { data, error, refetch } = useQuery({
    queryKey: ['stock-sales', sku],
    queryFn: () => stock.sales(sku),
  });
  const rows = error ? [] : (data || []);
  const totalSold = rows.reduce((s, r) => s + (r.quantity || 0), 0);

  const columns = [
    { key: 'date', label: 'Date', width: 90 },
    { key: 'job_id', label: 'Job#', width: 78, render: (r) => (r.job_id ? (
        <span role="button" tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onNavigateJob && onNavigateJob(r.job_id); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onNavigateJob && onNavigateJob(r.job_id); } }}
          style={{ color: T.accentStrong, fontWeight: 600, cursor: 'pointer', fontFamily: T.mono ?? 'monospace' }}>{r.job_id}</span>
      ) : '—') },
    { key: 'customer_name', label: 'Customer', render: (r) => r.customer_name || '—' },
    { key: 'location_branch', label: 'Loc', width: 52, render: (r) => r.location_branch || '—' },
    { key: 'quantity', label: 'Qty', width: 56, align: 'right', render: (r) => <span style={{ fontWeight: 600 }}>{r.quantity}</span> },
  ];
  return (
    <div style={{ fontFamily: T.font }}>
      {rows.length > 0 && (
        <div style={{ fontSize: T.fsSmall, color: T.textMuted, marginBottom: 6 }}>
          <strong style={{ color: T.text }}>{totalSold}</strong> unit{totalSold === 1 ? '' : 's'} sold across {rows.length} sale{rows.length === 1 ? '' : 's'}
        </div>
      )}
      <DataGrid
        columns={columns}
        rows={rows.map((r, i) => ({ ...r, _rowId: `${r.job_id || 'x'}-${i}` }))}
        rowKey="_rowId"
        onRowClick={(r) => r.job_id && onNavigateJob && onNavigateJob(r.job_id)}
        error={error ? (error.message || 'Failed to load sales') : undefined}
        onRetry={refetch}
        emptyText="No sales recorded for this item"
      />
    </div>
  );
}

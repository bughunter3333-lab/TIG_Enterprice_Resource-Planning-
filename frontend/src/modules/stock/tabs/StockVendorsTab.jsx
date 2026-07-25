import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import DataGrid from '../../../ui/DataGrid';
import { T } from '../../../ui/tokens';
import { money } from '../stockFormat';

// Jim2 Stock "Vendors" tab: every supplier who lists this SKU + their price,
// cheapest first. The lowest unit cost is highlighted as the best buy.
export default function StockVendorsTab({ sku }) {
  const { data, error, refetch } = useQuery({
    queryKey: ['stock-vendors', sku],
    queryFn: () => stock.vendors(sku),
  });
  const rows = error ? [] : (data || []);
  const best = rows.length ? Math.min(...rows.map(r => Number(r.unit_cost) || Infinity)) : null;

  const columns = [
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'unit_cost', label: 'Unit Cost', width: 92, align: 'right', render: (r) => {
        const isBest = best != null && Number(r.unit_cost) === best;
        return <span style={{ fontWeight: isBest ? 800 : 600, color: isBest ? T.ok : T.text }}>{money(r.unit_cost)}{isBest ? ' ★' : ''}</span>;
      } },
    { key: 'min_qty', label: 'Min Qty', width: 66, align: 'right', render: (r) => r.min_qty ?? '—' },
    { key: 'lead_time_days', label: 'Lead', width: 60, align: 'right', render: (r) => (r.lead_time_days != null ? `${r.lead_time_days}d` : '—') },
    { key: 'currency', label: 'Curr', width: 52 },
    { key: 'valid_to', label: 'Valid To', width: 90, render: (r) => r.valid_to || '—' },
  ];
  return (
    <DataGrid
      columns={columns}
      rows={rows.map((r, i) => ({ ...r, _rowId: `${r.supplier_id}-${i}` }))}
      rowKey="_rowId"
      error={error ? (error.message || 'Failed to load vendors') : undefined}
      onRetry={refetch}
      emptyText="No supplier prices listed for this item"
    />
  );
}

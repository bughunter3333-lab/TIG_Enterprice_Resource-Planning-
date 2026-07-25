import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import DataGrid from '../../../ui/DataGrid';
import { T, statusColor } from '../../../ui/tokens';
import { money } from '../stockFormat';

// Jim2 Stock "Buying" tab: full purchase-order line history for this SKU.
export default function StockBuyingTab({ sku, onNavigatePO }) {
  const { data, error, refetch } = useQuery({
    queryKey: ['stock-buying', sku],
    queryFn: () => stock.buying(sku),
  });
  const columns = [
    { key: 'po_id', label: 'PO#', width: 96, render: (r) => (
        <span role="button" tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onNavigatePO && onNavigatePO(r.po_id); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onNavigatePO && onNavigatePO(r.po_id); } }}
          style={{ color: T.accentStrong, fontWeight: 700, cursor: 'pointer', fontFamily: T.mono ?? 'monospace' }}>{r.po_id}</span>
      ) },
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'status', label: 'Status', width: 82, render: (r) => <span style={{ color: statusColor(r.status), fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{r.status}</span> },
    { key: 'order_date', label: 'Ordered', width: 84 },
    { key: 'qty_ordered', label: 'Ord', width: 48, align: 'right' },
    { key: 'qty_received', label: 'Recv', width: 50, align: 'right' },
    { key: 'outstanding', label: 'Outst.', width: 56, align: 'right', render: (r) => <span style={{ fontWeight: 700, color: r.outstanding > 0 ? T.accentStrong : T.textFaint }}>{r.outstanding}</span> },
    { key: 'unit_cost', label: 'Cost', width: 72, align: 'right', render: (r) => money(r.unit_cost) },
  ];
  return (
    <DataGrid
      columns={columns}
      rows={error ? [] : (data || []).map((r, i) => ({ ...r, _rowId: `${r.po_id}-${i}` }))}
      rowKey="_rowId"
      onRowClick={(r) => onNavigatePO && onNavigatePO(r.po_id)}
      error={error ? (error.message || 'Failed to load buying history') : undefined}
      onRetry={refetch}
      emptyText="No purchase orders for this item"
    />
  );
}

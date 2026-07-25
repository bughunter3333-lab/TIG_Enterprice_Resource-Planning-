import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import DataGrid from '../../../ui/DataGrid';
import { T, statusColor } from '../../../ui/tokens';

// Jim2 Stock "Stock On Hand" tab: incoming stock — the outstanding lines of
// open purchase orders (ordered but not yet received) that will land on hand.
// Derived from the same /buying data, filtered to outstanding > 0.
export default function StockOnHandTab({ sku, onNavigatePO }) {
  const { data, error, refetch } = useQuery({
    queryKey: ['stock-buying', sku],
    queryFn: () => stock.buying(sku),
  });
  const rows = (error ? [] : (data || [])).filter(r => (r.outstanding || 0) > 0);
  const incoming = rows.reduce((s, r) => s + (r.outstanding || 0), 0);

  const columns = [
    { key: 'po_id', label: 'PO#', width: 96, render: (r) => (
        <span role="button" tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onNavigatePO && onNavigatePO(r.po_id); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onNavigatePO && onNavigatePO(r.po_id); } }}
          style={{ color: T.accentStrong, fontWeight: 700, cursor: 'pointer', fontFamily: T.mono ?? 'monospace' }}>{r.po_id}</span>
      ) },
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'status', label: 'Status', width: 82, render: (r) => <span style={{ color: statusColor(r.status), fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{r.status}</span> },
    { key: 'expected_date', label: 'Expected', width: 92, render: (r) => r.expected_date || '—' },
    { key: 'qty_ordered', label: 'Ord', width: 48, align: 'right' },
    { key: 'qty_received', label: 'Recv', width: 50, align: 'right' },
    { key: 'outstanding', label: 'Incoming', width: 74, align: 'right', render: (r) => <span style={{ fontWeight: 800, color: T.accentStrong }}>{r.outstanding}</span> },
  ];
  return (
    <div style={{ fontFamily: T.font }}>
      {rows.length > 0 && (
        <div style={{ fontSize: T.fsSmall, color: T.textMuted, marginBottom: 6 }}>
          <strong style={{ color: T.accentStrong }}>{incoming}</strong> unit{incoming === 1 ? '' : 's'} incoming across {rows.length} open order{rows.length === 1 ? '' : 's'}
        </div>
      )}
      <DataGrid
        columns={columns}
        rows={rows.map((r, i) => ({ ...r, _rowId: `${r.po_id}-${i}` }))}
        rowKey="_rowId"
        onRowClick={(r) => onNavigatePO && onNavigatePO(r.po_id)}
        error={error ? (error.message || 'Failed to load incoming stock') : undefined}
        onRetry={refetch}
        emptyText="Nothing on order — no incoming stock"
      />
    </div>
  );
}

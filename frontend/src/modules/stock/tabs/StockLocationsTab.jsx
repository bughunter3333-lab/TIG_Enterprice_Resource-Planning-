import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import DataGrid from '../../../ui/DataGrid';

const COLUMNS = [
  { key: 'branch', label: 'Branch', width: 80 },
  { key: 'zone', label: 'Zone', width: 60 },
  { key: 'qty_on_hand', label: 'On Hand', width: 70, align: 'right' },
  { key: 'committed_qty', label: 'Committed', width: 80, align: 'right' },
  { key: 'available_qty', label: 'Available', width: 80, align: 'right' },
  { key: 'backorder_qty', label: 'Backorder', width: 80, align: 'right' },
  { key: 'on_po_qty', label: 'On PO', width: 60, align: 'right' },
  { key: 'primary_bin_1', label: 'Bin 1', width: 70 },
  { key: 'primary_bin_2', label: 'Bin 2', width: 70 },
];

export default function StockLocationsTab({ sku }) {
  const { data, error, refetch } = useQuery({
    queryKey: ['stock-locations', sku],
    queryFn: () => stock.locations(sku),
  });
  return (
    <DataGrid
      columns={COLUMNS}
      rows={error ? [] : data}
      rowKey="id"
      error={error ? (error.message || 'Failed to load locations') : undefined}
      onRetry={refetch}
      emptyText="No branch stock records"
    />
  );
}

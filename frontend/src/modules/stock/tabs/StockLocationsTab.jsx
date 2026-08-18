import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import DataGrid from '../../../ui/DataGrid';
import { T } from '../../../ui/tokens';

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

const num = (v) => Number(v || 0).toLocaleString('en-AU');

function Figure({ label, value, tone }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontSize: 10, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: T.fsGrid, fontWeight: 700, color: tone ?? T.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </span>
  );
}

export default function StockLocationsTab({ sku }) {
  const { data, error, refetch } = useQuery({
    queryKey: ['stock-locations', sku],
    queryFn: () => stock.locations(sku),
  });
  // Reconciliation against the item total. Stock received before location
  // tracking has no branch, so it shows as unlocated rather than being
  // quietly assigned somewhere it isn't.
  const { data: summary } = useQuery({
    queryKey: ['stock-location-summary', sku],
    queryFn: () => stock.locationSummary(sku),
  });

  const unlocated = summary ? summary.unlocated : 0;
  const short = unlocated > 0;
  const over = unlocated < 0;

  return (
    <div style={{ fontFamily: T.font }}>
      {summary && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          padding: '6px 10px', marginBottom: 8,
          border: `1px solid ${short || over ? T.accentStrong : T.hairline}`,
          borderLeft: `3px solid ${short ? T.accent : over ? T.danger : T.ok}`,
          borderRadius: T.radius, background: T.hairlineSoft,
        }}>
          <Figure label="On hand" value={num(summary.total_on_hand)} />
          <Figure label="In branches" value={num(summary.located)} />
          {short && (
            <Figure label="Not yet located" value={num(unlocated)} tone={T.accentStrong} />
          )}
          {over && (
            <Figure label="Over-allocated" value={num(Math.abs(unlocated))} tone={T.danger} />
          )}
          <span style={{ fontSize: 10.5, color: T.textMuted, marginLeft: 'auto' }}>
            {short
              ? 'Received before branch tracking — put it away to place it.'
              : over
                ? 'Branches hold more than the item total — needs a stocktake.'
                : 'Every unit is accounted for by branch.'}
          </span>
        </div>
      )}
      <DataGrid
        columns={COLUMNS}
        rows={error ? [] : data}
        rowKey="id"
        error={error ? (error.message || 'Failed to load locations') : undefined}
        onRetry={refetch}
        emptyText="No branch stock records"
      />
    </div>
  );
}

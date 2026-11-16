import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import { T } from '../../../ui/tokens';

/**
 * Who changed this SKU, and to what.
 *
 * One line per field that moved rather than per save, because the question is
 * always about a particular value — which change took this out of B.3.H.1 —
 * not about who pressed a button on a Tuesday.
 */

const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const LABELS = {
  primary_bin_1: 'Bin 1',
  primary_bin_2: 'Bin 2',
  max_qty_bin_1: 'Max qty 1',
  max_qty_bin_2: 'Max qty 2',
  zone: 'Zone',
  qty_on_hand: 'On hand',
  committed_qty: 'Committed',
  backorder_qty: 'Backorder',
  on_po_qty: 'On PO',
  location: 'Location',
};

function Value({ children, tone }) {
  if (!children) return <span style={{ color: T.textFaint, fontStyle: 'italic' }}>empty</span>;
  return <span style={{ fontFamily: T.fontMono, color: tone }}>{children}</span>;
}

export default function StockHistoryPanel({ sku }) {
  const { data, error, isPending } = useQuery({
    queryKey: ['stock-history', sku],
    queryFn: () => stock.history(sku),
  });

  return (
    <div style={{ marginTop: 10, border: `1px solid ${T.hairline}`, borderRadius: T.radius, overflow: 'hidden' }}>
      <div style={{
        padding: '5px 8px', background: T.hairlineSoft, borderBottom: `1px solid ${T.hairline}`,
        fontSize: 11, fontWeight: 700, color: T.headerText, textTransform: 'uppercase', letterSpacing: '0.03em',
      }}>
        Edit history
      </div>
      {error ? (
        <div style={{ padding: 8, fontSize: T.fsSmall, color: T.danger }}>
          {error.message || 'Could not load history'}
        </div>
      ) : isPending ? (
        <div style={{ padding: 8, fontSize: T.fsSmall, color: T.textMuted }}>Loading…</div>
      ) : !data?.length ? (
        <div style={{ padding: 8, fontSize: T.fsSmall, color: T.textMuted }}>
          Nothing has been changed on this item yet.
        </div>
      ) : (
        data.map((row) => (
          <div key={row.id} style={{
            display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
            padding: '4px 8px', fontSize: T.fsGrid, borderBottom: `1px solid ${T.hairlineSoft}`,
          }}>
            <span style={{ color: T.textFaint, fontVariantNumeric: 'tabular-nums', minWidth: 96 }}>{when(row.changed_at)}</span>
            <span style={{ fontWeight: 600, color: T.text, minWidth: 70 }}>{row.changed_by}</span>
            <span style={{ color: T.textMuted, minWidth: 70 }}>{row.branch || '—'}</span>
            <span style={{ color: T.textMuted, minWidth: 70 }}>{LABELS[row.field] || row.field}</span>
            <Value tone={T.textMuted}>{row.old_value}</Value>
            <span style={{ color: T.textFaint }}>→</span>
            <Value tone={T.text}>{row.new_value}</Value>
          </div>
        ))
      )}
    </div>
  );
}

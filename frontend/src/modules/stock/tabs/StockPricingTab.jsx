import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import { T } from '../../../ui/tokens';
import { money } from '../stockFormat';

const COST_FIELDS = [
  ['Last Cost', 'last_cost'], ['Avg Cost', 'avg_cost'], ['Last COG', 'last_cog'], ['Avg COG', 'avg_cog'],
  ['Max COG', 'max_cog'], ['Last PO COGS', 'last_po_cogs'], ['Avg PO COGS', 'avg_po_cogs'], ['Last Ex.', 'last_ex'],
];

export default function StockPricingTab({ sku }) {
  const { data, error, refetch } = useQuery({ queryKey: ['stock-pricing', sku], queryFn: () => stock.pricing(sku) });

  if (error) return (
    <div style={{ background: T.dangerTint, color: T.danger, padding: 10, borderRadius: T.radius, fontFamily: T.font, fontSize: T.fsGrid }}>
      {error.message || 'Failed to load pricing'} <button onClick={() => refetch()} style={{ marginLeft: 8 }}>Retry</button>
    </div>
  );
  if (!data) return <div style={{ padding: 12, color: T.textMuted, fontFamily: T.font, fontSize: T.fsGrid }}>Loading…</div>;

  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ fontSize: T.fsHeader, fontWeight: 700, color: T.headerText, textTransform: 'uppercase', marginBottom: 6 }}>Cost Tracking</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px 16px', marginBottom: 6 }}>
        {COST_FIELDS.map(([label, key]) => (
          <div key={key} style={{ fontSize: T.fsGrid }}>
            <span style={{ color: T.textMuted }}>{label}: </span>
            <span style={{ color: T.text, fontVariantNumeric: 'tabular-nums' }}>{data[key] != null ? money(data[key]) : '—'}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: T.fsGrid, color: T.textMuted, marginBottom: 12 }}>Price Template: {data.price_template || '—'} · Last Effective: {data.last_effective_date || '—'}</div>

      <div style={{ fontSize: T.fsHeader, fontWeight: 700, color: T.headerText, textTransform: 'uppercase', marginBottom: 6 }}>Price Levels</div>
      {(data.price_levels || []).length === 0 && <div style={{ fontSize: T.fsGrid, color: T.textFaint }}>No price levels</div>}
      {(data.price_levels || []).map(level => (
        <div key={level.id} style={{ border: `1px solid ${T.hairline}`, borderRadius: T.radius, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 10, padding: '6px 10px', background: T.hairlineSoft, fontSize: T.fsGrid, fontWeight: 600 }}>
            <span>{level.price_level}</span>
            <span style={{ color: T.textMuted, fontWeight: 400 }}>{level.currency} · {level.tax_code} · {level.price_calc_method}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.fsGrid }}>
            <thead>
              <tr style={{ color: T.headerText, textAlign: 'right' }}>
                <th style={{ textAlign: 'left', padding: '3px 10px', fontWeight: 600 }}>≥ Qty</th>
                <th style={{ padding: '3px 10px', fontWeight: 600 }}>Price Ex.</th>
                <th style={{ padding: '3px 10px', fontWeight: 600 }}>Price Inc.</th>
                <th style={{ padding: '3px 10px', fontWeight: 600 }}>Pont %</th>
              </tr>
            </thead>
            <tbody>
              {(level.breakpoints || []).map(bp => (
                <tr key={bp.id} style={{ textAlign: 'right', borderTop: `1px solid ${T.hairlineSoft}` }}>
                  <td style={{ textAlign: 'left', padding: '3px 10px' }}>{bp.min_qty}</td>
                  <td style={{ padding: '3px 10px' }}>{money(bp.price_ex)}</td>
                  <td style={{ padding: '3px 10px' }}>{money(bp.price_inc)}</td>
                  <td style={{ padding: '3px 10px' }}>{bp.pont_pct != null ? `${bp.pont_pct}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

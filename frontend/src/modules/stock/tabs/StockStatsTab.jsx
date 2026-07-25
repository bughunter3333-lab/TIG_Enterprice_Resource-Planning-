import { useQuery } from '@tanstack/react-query';
import { stock } from '../../../api';
import { T } from '../../../ui/tokens';

// Jim2 Stock "Stats" tab: sales velocity + stock cover. The headline metric is
// stock_cover_days — how long on-hand lasts at the trailing-year sales pace —
// which is what actually drives the reorder decision.

const num = (v) => (v == null ? '—' : Number(v).toLocaleString('en-AU'));

function Stat({ label, value, sub, tone }) {
  return (
    <div style={{ border: `1px solid ${T.hairline}`, borderRadius: 8, padding: '10px 12px', background: T.panel, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.textFaint }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone || T.text, lineHeight: 1.2, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// Cover verdict: <14d critical, <42d (6wk) watch, else healthy.
function coverTone(days) {
  if (days == null) return { tone: T.textFaint, label: 'No sales in the last year' };
  if (days < 14) return { tone: T.danger, label: 'Critical — reorder now' };
  if (days < 42) return { tone: T.accentStrong, label: 'Getting low — plan a reorder' };
  return { tone: T.ok, label: 'Healthy cover' };
}

export default function StockStatsTab({ sku }) {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['stock-stats', sku],
    queryFn: () => stock.stats(sku),
  });

  if (isLoading) return <div style={{ padding: 16, color: T.textFaint, fontFamily: T.font, fontSize: T.fsBase }}>Loading stats…</div>;
  if (error) return (
    <div style={{ padding: 16, fontFamily: T.font, fontSize: T.fsBase, color: T.danger }}>
      {error.message || 'Failed to load stats'} · <button onClick={() => refetch()} style={{ color: T.accentStrong, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>retry</button>
    </div>
  );

  const d = data || {};
  const cover = coverTone(d.stock_cover_days);

  return (
    <div style={{ fontFamily: T.font, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Headline: stock cover */}
      <div style={{ border: `1px solid ${cover.tone}`, borderRadius: 10, padding: '14px 16px', background: T.hairlineSoft, display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.textFaint }}>Stock Cover</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: cover.tone, lineHeight: 1 }}>
            {d.stock_cover_days == null ? '—' : `${num(d.stock_cover_days)}`}<span style={{ fontSize: 14, fontWeight: 700 }}> days</span>
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: cover.tone }}>{cover.label}</div>
      </div>

      {/* Velocity grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        <Stat label="On Hand" value={num(d.on_hand)} />
        <Stat label="Sold — 30 days" value={num(d.units_sold_30)} />
        <Stat label="Sold — 90 days" value={num(d.units_sold_90)} />
        <Stat label="Sold — 12 months" value={num(d.units_sold_365)} />
        <Stat label="Avg / month" value={num(d.avg_monthly_sold)} sub={`${num(d.avg_daily_sold)} / day`} />
        <Stat label="Received — 12 mo" value={num(d.units_received_365)} />
      </div>

      {/* Lifetime + last activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        <Stat label="Total Sold" value={num(d.total_sold_all_time)} sub={`${num(d.sale_count)} sales`} />
        <Stat label="Total Received" value={num(d.total_received_all_time)} />
        <Stat label="Last Sold" value={d.last_sold || '—'} />
        <Stat label="Last Received" value={d.last_received || '—'} />
      </div>
    </div>
  );
}

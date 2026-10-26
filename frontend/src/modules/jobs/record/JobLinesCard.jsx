import { ExternalLink } from 'lucide-react';
import { T } from '../../../ui/tokens';
import Card from '../../../ui/Card';
import { money } from './recordFormat';

const th = (align = 'left') => ({
  padding: '0 10px', height: 32, textAlign: align, whiteSpace: 'nowrap',
  fontSize: 11, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.textMuted,
});
const td = (align = 'left') => ({ padding: '7px 10px', textAlign: align, verticalAlign: 'top', fontSize: T.fsGrid, color: T.text, fontVariantNumeric: 'tabular-nums' });
const dash = <span style={{ color: T.textFaint }}>—</span>;

function PoLink({ po, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(po)} title={`Open PO ${po}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
      font: 'inherit', fontFamily: T.fontMono, fontSize: T.fsSmall, fontWeight: 500, color: T.accent,
    }}>
      {po}<ExternalLink size={11} aria-hidden />
    </button>
  );
}

function Freight({ job }) {
  const freightItem = (job.items || []).find((i) => (i.stockCode || '').toUpperCase() === 'FREIGHT' || (i.description || '').toLowerCase().includes('freight'));
  const freight = freightItem ? parseFloat(freightItem.priceEx || freightItem.total || 0) : 0;
  const cartons = freightItem ? (parseInt(freightItem.order, 10) || parseInt(freightItem.qty, 10) || 1) : 1;
  const parts = [
    ['Freight', freight ? `${money(freight)} + GST` : null],
    ['Cartons', freightItem ? String(cartons) : null],
    ['Fuel levy', job.fuelLevy ? money(job.fuelLevy) : null],
    ['Weight', job.weightTotal ? `${Number(job.weightTotal).toFixed(2)} kg` : null],
  ];
  return (
    <span style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {parts.map(([label, value]) => (
        <span key={label}>{label} <span style={{ color: value ? T.text : T.textFaint, fontWeight: 500 }}>{value ?? '—'}</span></span>
      ))}
    </span>
  );
}

/**
 * What the job is made of: every line, the purchase orders behind them, and
 * the freight. Totals sit at the foot of the table, where an accountant looks
 * for them; the money card beside it carries what is paid and owed.
 */
export default function JobLinesCard({ job, onOpenPO }) {
  const items = job.items || [];
  const lineCount = items.filter((i) => (i.displayType || 'product') === 'product').length;
  const linkedPOs = [...new Set(items.filter((i) => i.poNo).map((i) => i.poNo))];
  return (
    <Card
      title="Lines"
      info={`${lineCount} line${lineCount === 1 ? '' : 's'}`}
      actions={linkedPOs.length > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: T.fsSmall, color: T.textMuted }}>
          Purchase orders {linkedPOs.map((po) => <PoLink key={po} po={po} onOpen={onOpenPO} />)}
        </span>
      )}
      padding={16}
      bodyStyle={{ padding: '12px 0 0' }}
      footer={<Freight job={job} />}
    >
      {items.length === 0 ? (
        <p style={{ margin: '8px 16px 16px', fontSize: T.fsGrid, color: T.textMuted }}>No lines yet. Edit the job to add what it is for.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontFamily: T.font }}>
            <thead>
              <tr style={{ background: T.panelAlt, boxShadow: T.shadowHeader }}>
                <th style={th()}>Stock code</th><th style={th()}>Description</th><th style={th()}>Status</th>
                <th style={th('right')}>Order</th><th style={th('right')}>Supply</th><th style={th('right')}>B/O</th>
                <th style={th('right')}>Picked</th><th style={th('right')}>Price ex</th><th style={th('right')}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const key = item.id ?? idx;
                if (item.displayType === 'section') return (
                  <tr key={key} style={{ background: T.panelAlt, borderTop: `1px solid ${T.hairline}` }}>
                    <td colSpan={9} style={{ ...td(), fontWeight: 600 }}>{item.description}</td>
                  </tr>
                );
                if (item.displayType === 'note') return (
                  <tr key={key} style={{ borderTop: `1px solid ${T.hairlineSoft}` }}>
                    <td colSpan={9} style={{ ...td(), color: T.textMuted, fontStyle: 'italic' }}>{item.description}</td>
                  </tr>
                );
                const short = item.supply < item.order;
                const notes = [
                  item.hide && 'Hidden on documents',
                  item.taxType && item.taxType !== 'G' && `Tax ${item.taxType}`,
                ].filter(Boolean);
                return (
                  <tr key={key} style={{ borderTop: `1px solid ${T.hairlineSoft}` }}>
                    <td style={{ ...td(), fontFamily: T.fontMono, fontSize: T.fsSmall, whiteSpace: 'nowrap' }}>{item.stockCode || dash}</td>
                    <td style={{ ...td(), color: item.hide ? T.textMuted : T.text }}>
                      <div style={{ fontWeight: 500 }}>{item.description}</div>
                      {item.sizes && <div style={{ whiteSpace: 'pre-line', color: T.textMuted, fontSize: T.fsSmall, marginTop: 2 }}>{item.sizes}</div>}
                      {(item.decCode || item.embCode || item.trsCode) && (
                        <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                          {item.decorationType && item.decorationType !== 'None' ? `${item.decorationType}: ` : ''}{item.decCode || item.embCode || item.trsCode}{item.stitchCount ? ` · ${item.stitchCount} sts` : ''}
                        </div>
                      )}
                      {item.poNo && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 11, color: T.textMuted }}>
                          <PoLink po={item.poNo} onOpen={onOpenPO} />{item.poDue && <span>due {item.poDue}</span>}
                        </div>
                      )}
                      {notes.length > 0 && <div style={{ fontSize: 11, color: T.textFaint, marginTop: 2 }}>{notes.join(' · ')}</div>}
                    </td>
                    <td style={td()}>
                      {item.itemStatus
                        ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: T.radiusSm, background: T.accentTint, color: T.accentStrong, whiteSpace: 'nowrap' }}>{item.itemStatus}</span>
                        : dash}
                    </td>
                    <td style={td('right')}>{item.order}</td>
                    <td style={{ ...td('right'), color: short ? T.danger : T.ok, fontWeight: 500 }}>{item.supply}</td>
                    <td style={td('right')}>{item.bOrd > 0 ? <span style={{ color: T.warn, fontWeight: 500 }}>{item.bOrd}</span> : dash}</td>
                    <td style={td('right')}>{item.qtyPick > 0 ? item.qtyPick : dash}</td>
                    <td style={{ ...td('right'), whiteSpace: 'nowrap' }}>{money(item.priceEx)}</td>
                    <td style={{ ...td('right'), fontWeight: 600, whiteSpace: 'nowrap' }}>{money(item.total)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `1px solid ${T.hairline}` }}>
                <td colSpan={8} style={{ ...td('right'), color: T.textMuted }}>
                  Subtotal <strong style={{ color: T.text, fontWeight: 600, margin: '0 16px 0 6px' }}>{money(job.subtotal)}</strong>
                  GST <strong style={{ color: T.text, fontWeight: 600, margin: '0 16px 0 6px' }}>{money(job.tax)}</strong>
                  Total inc GST
                </td>
                <td style={{ ...td('right'), fontSize: T.fsBase, fontWeight: 600 }}>{money(job.totalInc || job.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

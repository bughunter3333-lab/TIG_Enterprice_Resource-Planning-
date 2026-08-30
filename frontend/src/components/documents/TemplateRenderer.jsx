import { useMemo } from 'react';
import { barcodeBars } from '../../lib/barcode';
import { JOB_FIELDS, LINE_COLUMNS, PAPER, TOTAL_FIELDS } from '../../lib/documentTemplates';
import { T } from '../../ui/tokens';

/**
 * Renders a document template against a job.
 *
 * One renderer, used for the on-screen preview, for print, and therefore for
 * PDF — the browser's own print-to-PDF. That is the point of the exercise: the
 * job sheet used to be written once in React and again in ReportLab, so a
 * change to the printed layout meant changing two files in two languages and
 * hoping they agreed.
 *
 * Everything here is driven by the template. There is no per-document-type
 * branch anywhere below; a job sheet and a consignment note differ only in the
 * data handed in.
 */

const mm = (n) => `${n}mm`;

const money = (v) =>
  v == null || v === '' ? '' : `$${Number(v).toFixed(2)}`;

/** Values a totals block or a {token} can reach. */
export function deriveTotals(job) {
  const items = (job.items || []).filter((i) => !i.hide && i.displayType !== 'note' && i.displayType !== 'section');
  const num = (v) => Number(v) || 0;
  return {
    lineCount: items.length,
    totalQty: items.reduce((s, i) => s + num(i.order ?? i.qty), 0),
    totalPicked: items.reduce((s, i) => s + num(i.qtyPick), 0),
    totalWeight: Math.round(items.reduce((s, i) => s + num(i.weightKg) * num(i.order ?? i.qty), 0) * 100) / 100,
    cartons: num(job.cartons) || Math.max(1, Math.ceil(items.reduce((s, i) => s + num(i.order ?? i.qty), 0) / 50)),
    totalEx: money(job.totalEx ?? job.subtotal),
    tax: money(job.tax),
    totalInc: money(job.totalInc ?? job.total),
  };
}

/** {id}, {customer} and any other job field, plus the derived totals. */
function fillTokens(text, job, totals) {
  return String(text ?? '').replace(/\{(\w+)\}/g, (whole, key) => {
    if (key in totals) return String(totals[key]);
    const v = job?.[key];
    return v == null || v === '' ? '' : String(v);
  });
}

function partyLines(source, job, company) {
  if (source === 'company') {
    return {
      title: company?.company_name || 'Total Image',
      lines: [company?.address, company?.phone, company?.email].filter(Boolean),
    };
  }
  if (source === 'shipTo') {
    return {
      title: job.customer,
      lines: [job.shipTo, job.shippingAddress, job.nameContact].filter(Boolean),
    };
  }
  return { title: job.customer, lines: [job.shippingAddress, job.nameContact].filter(Boolean) };
}

function Barcode({ value, height }) {
  const encoded = useMemo(() => barcodeBars(value), [value]);
  if (!encoded) return null;
  const { bars, modules } = encoded;
  return (
    <svg
      viewBox={`0 0 ${modules} 10`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: mm(height || 14), display: 'block' }}
      role="img"
      aria-label={`Barcode ${value}`}
    >
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y="0" width={b.width} height="10" fill="#000" />
      ))}
    </svg>
  );
}

function LineTable({ cfg, job, inventory }) {
  const cols = (cfg.columns || []).map((k) => LINE_COLUMNS.find((c) => c.key === k)).filter(Boolean);
  if (!cols.length) return null;
  const rows = (job.items || []).filter((i) => !i.hide);

  return (
    <table className="doc-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {cols.map((c) => (
            <th
              key={c.key}
              style={{
                textAlign: c.align, width: `${c.width}%`, padding: '2mm 1mm',
                borderBottom: '0.4mm solid #000', fontSize: '2.9mm',
                textTransform: 'uppercase', letterSpacing: '.06em',
              }}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((it, idx) => {
          // A section row spans the table and titles the block beneath it; the
          // hardcoded renderers did this and picking depends on it.
          if (it.displayType === 'section') {
            if (!cfg.showSections) return null;
            return (
              <tr key={it.id ?? idx}>
                <td colSpan={cols.length} style={{ padding: '2mm 1mm 1mm', fontWeight: 700, borderBottom: '0.2mm solid #999' }}>
                  {it.description}
                </td>
              </tr>
            );
          }
          if (it.displayType === 'note') {
            return (
              <tr key={it.id ?? idx}>
                <td colSpan={cols.length} style={{ padding: '1mm 1mm', fontStyle: 'italic' }}>
                  {it.description}
                </td>
              </tr>
            );
          }
          return (
            <tr key={it.id ?? idx} style={{ background: cfg.zebra && idx % 2 ? '#f4f4f4' : undefined }}>
              {cols.map((c) => {
                // The bin is the one column that does not come off the job
                // line. It is looked up in stock, and a SKU with nothing on
                // hand says so rather than printing an empty cell that reads
                // as "no bin recorded".
                if (c.key === 'binLocation') {
                  const inv = (inventory || []).find((i) => i.sku === it.stockCode);
                  const inStock = inv && Number(inv.stock) > 0;
                  return (
                    <td key={c.key} style={{ textAlign: c.align, padding: '1.4mm 1mm', borderBottom: '0.15mm solid #ddd', fontFamily: T.fontMono, fontWeight: 600 }}>
                      {inStock ? (inv.location || '—') : <span style={{ color: '#c8102e' }}>OUT OF STOCK</span>}
                    </td>
                  );
                }
                const raw = it[c.key];
                const v = c.key === 'priceEx' || c.key === 'total' ? money(raw) : raw;
                return (
                  <td
                    key={c.key}
                    style={{
                      textAlign: c.align, padding: '1.4mm 1mm',
                      borderBottom: '0.15mm solid #ddd',
                      fontVariantNumeric: c.align === 'right' ? 'tabular-nums' : undefined,
                    }}
                  >
                    {v == null || v === '' ? '' : String(v)}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Block({ b, job, company, totals, inventory }) {
  switch (b.type) {
    case 'logo':
      return (
        <div style={{ textAlign: b.align || 'left' }}>
          <span style={{ fontWeight: 900, fontSize: mm((b.height || 12) * 0.5), letterSpacing: '-.02em', textTransform: 'uppercase' }}>
            {company?.company_name || 'Total Image'}
          </span>
        </div>
      );

    case 'companyBlock': {
      const p = partyLines('company', job, company);
      return (
        <div>
          <div style={{ fontWeight: 700 }}>{p.title}</div>
          {p.lines.map((l, i) => <div key={i} style={{ whiteSpace: 'pre-line' }}>{l}</div>)}
        </div>
      );
    }

    case 'docTitle':
      return (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '4mm' }}>
          <div style={{ fontSize: '6mm', fontWeight: 900, letterSpacing: '.04em' }}>{b.text}</div>
          {b.showJobNumber && (
            <div style={{ fontFamily: T.fontMono, fontSize: '5mm', fontWeight: 700 }}>#{job.id}</div>
          )}
        </div>
      );

    case 'partyBlock': {
      const p = partyLines(b.source, job, company);
      const scale = b.size === 'large' ? 1.5 : b.size === 'small' ? 0.85 : 1;
      return (
        <div>
          {b.heading && (
            <div style={{ fontSize: '2.6mm', textTransform: 'uppercase', letterSpacing: '.16em', color: '#555' }}>
              {b.heading}
            </div>
          )}
          <div style={{ fontWeight: 700, fontSize: mm(4 * scale) }}>{p.title}</div>
          {p.lines.map((l, i) => (
            <div key={i} style={{ whiteSpace: 'pre-line', fontSize: mm(3.2 * scale) }}>{l}</div>
          ))}
        </div>
      );
    }

    case 'fieldGrid': {
      const fields = (b.fields || []).map((k) => JOB_FIELDS.find((f) => f.key === k)).filter(Boolean);
      if (!fields.length) return null;
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${b.columns || 3}, 1fr)`, gap: '2mm 4mm' }}>
          {fields.map((f) => (
            <div key={f.key}>
              <div style={{ fontSize: '2.5mm', textTransform: 'uppercase', letterSpacing: '.12em', color: '#666' }}>
                {f.label}
              </div>
              <div style={{ whiteSpace: 'pre-line' }}>{job[f.key] == null || job[f.key] === '' ? '—' : String(job[f.key])}</div>
            </div>
          ))}
        </div>
      );
    }

    case 'lineTable':
      return <LineTable cfg={b} job={job} inventory={inventory} />;

    case 'totals': {
      const fields = (b.fields || []).map((k) => TOTAL_FIELDS.find((f) => f.key === k)).filter(Boolean);
      if (!fields.length) return null;
      return (
        <div style={{ display: 'flex', gap: '6mm', justifyContent: b.align === 'right' ? 'flex-end' : b.align === 'center' ? 'center' : 'flex-start' }}>
          {fields.map((f) => (
            <div key={f.key} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5mm', textTransform: 'uppercase', letterSpacing: '.12em', color: '#666' }}>
                {f.label}
              </div>
              <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{totals[f.key]}</div>
            </div>
          ))}
        </div>
      );
    }

    case 'barcode': {
      const value = b.source === 'custRef' ? job.custRef : b.source === 'invoice' ? job.invoice : job.id;
      return (
        <div>
          <Barcode value={value} height={b.height} />
          {b.caption && (
            <div style={{ textAlign: 'center', fontFamily: T.fontMono, letterSpacing: '.2em', fontSize: '3mm' }}>
              {value}
            </div>
          )}
        </div>
      );
    }

    case 'freeText':
      return (
        <div
          style={{
            textAlign: b.align || 'left',
            fontSize: b.size === 'small' ? '2.8mm' : b.size === 'large' ? '5mm' : '3.4mm',
            whiteSpace: 'pre-line',
          }}
        >
          {fillTokens(b.text, job, totals)}
        </div>
      );

    case 'signature':
      return (
        <div style={{ display: 'flex', gap: '6mm', marginTop: '6mm' }}>
          {(b.lines || []).map((l) => (
            <div key={l} style={{ flex: 1 }}>
              <div style={{ borderBottom: '0.3mm solid #000', height: '9mm' }} />
              <div style={{ fontSize: '2.6mm', textTransform: 'uppercase', letterSpacing: '.12em', color: '#555', paddingTop: '1mm' }}>
                {l}
              </div>
            </div>
          ))}
        </div>
      );

    case 'divider':
      return <hr style={{ border: 0, borderTop: '0.3mm solid #000', margin: 0 }} />;

    case 'spacer':
      return <div style={{ height: mm(b.size || 4) }} />;

    default:
      return null;
  }
}

export default function TemplateRenderer({ template, job, company, inventory, scale = 1 }) {
  const paper = PAPER[template.paper] || PAPER.A4;
  const totals = useMemo(() => deriveTotals(job || {}), [job]);
  if (!job) return null;

  const bandKeys = template.bands.body ? ['body'] : ['header', 'lines', 'footer'];

  return (
    <div
      className="doc-page"
      data-paper={template.paper}
      style={{
        width: mm(paper.width),
        minHeight: mm(paper.height),
        padding: mm(paper.margin),
        background: '#fff',
        color: '#000',
        fontFamily: T.font,
        fontSize: '3.2mm',
        lineHeight: 1.35,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '3mm',
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      {bandKeys.map((key) => {
        const blocks = template.bands[key] || [];
        if (!blocks.length) return null;
        return (
          <div
            key={key}
            data-band={key}
            style={{
              display: 'flex', flexDirection: 'column', gap: '2.5mm',
              // The lines band takes the slack so the footer sits at the bottom
              // of a short document instead of floating under the last row.
              flex: key === 'lines' ? 1 : undefined,
            }}
          >
            {blocks.map((b) => (
              <Block key={b.id} b={b} job={job} company={company} totals={totals} inventory={inventory} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

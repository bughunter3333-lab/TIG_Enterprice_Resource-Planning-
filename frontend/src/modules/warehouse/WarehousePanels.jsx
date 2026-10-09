/**
 * The panels around the 3D view: search and results on the left, the
 * selected bin on the right. Everything the canvas shows can also be reached
 * here from the keyboard — the 3D view is a picture, these are the controls.
 */
import { Search, X, ExternalLink, MapPinOff } from 'lucide-react';
import { T } from '../../ui/tokens';
import { BIN_COLORS, LEGEND } from './binColors';

const REASONS = {
  format: 'Not an aisle.bay.level.box code',
  aisle: 'Aisle not in the racking',
  bay: 'Bay number beyond the racking',
  level: 'Level higher than the racking',
  position: 'Box number beyond the level',
};

const sectionTitle = { fontSize: T.fsSmall, fontWeight: 700, color: T.textMuted, margin: '14px 0 6px' };

export function SearchPanel({ query, onQuery, results, selected, onPick, offMap, offMapOpen, onOffMapToggle }) {
  return (
    <aside aria-label="Find a bin" style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: `1px solid ${T.hairline}`, background: T.panel }}>
      <div style={{ padding: 12, borderBottom: `1px solid ${T.hairline}` }}>
        <label htmlFor="wh-search" style={{ fontSize: T.fsSmall, color: T.textMuted, display: 'block', marginBottom: 4 }}>
          Find SKU, product or bin
        </label>
        <div style={{ position: 'relative' }}>
          <Search size={14} aria-hidden style={{ position: 'absolute', left: 8, top: 7, color: T.textMuted }} />
          <input
            id="wh-search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="e.g. AS-5001, navy tee, B.3"
            style={{
              width: '100%', height: 28, padding: '0 28px 0 28px', fontFamily: T.font, fontSize: T.fsBase,
              border: `1px solid ${T.textMuted}`, borderRadius: T.radiusField, background: T.panel, color: T.text,
            }}
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => onQuery('')}
              style={{ position: 'absolute', right: 4, top: 4, border: 'none', background: 'transparent', color: T.textMuted, cursor: 'pointer' }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={{ overflowY: 'auto', padding: '0 12px 12px', flex: 1 }}>
        {query.trim() && (
          <>
            <h2 style={sectionTitle}>{results.length} bin{results.length === 1 ? '' : 's'} found</h2>
            {results.length === 0 && (
              <p style={{ fontSize: T.fsSmall, color: T.textMuted }}>Nothing slotted matches “{query.trim()}”.</p>
            )}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {results.slice(0, 60).map((r) => (
                <li key={r.code}>
                  <button type="button" onClick={() => onPick(r.code)} aria-current={selected === r.code}
                    style={{
                      width: '100%', textAlign: 'left', border: 'none', borderRadius: T.radius, padding: '6px 8px', cursor: 'pointer',
                      background: selected === r.code ? T.accentTint : 'transparent', color: T.text, fontFamily: T.font,
                      display: 'flex', gap: 8, alignItems: 'baseline',
                    }}>
                    <span style={{ fontFamily: T.fontMono, fontWeight: 700, fontSize: 13, minWidth: 64 }}>{r.code}</span>
                    <span style={{ fontSize: T.fsSmall, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</span>
                  </button>
                </li>
              ))}
            </ul>
            {results.length > 60 && <p style={{ fontSize: T.fsSmall, color: T.textMuted }}>Showing 60 of {results.length}. Narrow the search.</p>}
          </>
        )}

        <h2 style={sectionTitle}>Box label colour</h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
          {LEGEND.map((l) => (
            <li key={l.state} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: T.fsSmall, color: T.text }}>
              <span aria-hidden style={{ width: 16, height: 8, borderRadius: 2, background: BIN_COLORS[l.state], border: `1px solid ${T.hairline}` }} />
              {l.label}
            </li>
          ))}
        </ul>
        <p style={{ fontSize: T.fsSmall, color: T.textMuted, margin: '8px 0 0' }}>
          Selected box: yellow. The open shelf above the top beam holds excess boxes and is not mapped by bin.
        </p>

        {offMap.length > 0 && (
          <details open={offMapOpen} onToggle={(e) => onOffMapToggle(e.currentTarget.open)} style={{ marginTop: 14 }}>
            <summary style={{ fontSize: T.fsSmall, fontWeight: 700, color: T.warn, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center' }}>
              <MapPinOff size={13} aria-hidden /> {offMap.length} slotted bin{offMap.length === 1 ? '' : 's'} not on the map
            </summary>
            <p style={{ fontSize: T.fsSmall, color: T.textMuted, margin: '6px 0' }}>
              These codes don't fit the racking. Fix the bin on the stock item's Locations tab, or the layout if the racking really is bigger.
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {offMap.slice(0, 200).map((o) => (
                <li key={`${o.bin}-${o.sku}`} style={{ fontSize: T.fsSmall, padding: '3px 0', borderBottom: `1px solid ${T.hairlineSoft}` }}>
                  <span style={{ fontFamily: T.fontMono, fontWeight: 700 }}>{o.bin}</span>
                  <span style={{ color: T.textMuted }}> · {o.sku} · {REASONS[o.reason]}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </aside>
  );
}

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-AU'));

export function BinPanel({ placement, entry, branch, onClose, onOpenSku }) {
  if (!placement) return null;
  const sideWords = placement.side === 'right' ? 'right-hand side' : 'left-hand side';
  return (
    <aside aria-label={`Bin ${placement.code}`} style={{ width: 320, flexShrink: 0, borderLeft: `1px solid ${T.hairline}`, background: T.panel, overflowY: 'auto' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: T.fontMono, fontSize: 22, fontWeight: 700, color: T.text }}>{placement.code}</h2>
          <p style={{ margin: '4px 0 0', fontSize: T.fsSmall, color: T.textMuted }}>
            Aisle {placement.aisle} · Bay {placement.bay}, {sideWords} · Level {placement.level} · Box {placement.position}
          </p>
        </div>
        <button type="button" aria-label="Close bin details" onClick={onClose}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: T.textMuted, padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ padding: '12px 16px' }}>
        {!entry && <p style={{ fontSize: T.fsBase, color: T.textMuted, margin: 0 }}>Nothing is slotted into this box.</p>}
        {entry?.skus.map((s) => (
          <section key={s.sku} style={{ padding: '10px 0', borderBottom: `1px solid ${T.hairlineSoft}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: T.fsBase, color: T.text }}>{s.name || s.sku}</div>
                <div style={{ fontFamily: T.fontMono, fontSize: T.fsSmall, color: T.textMuted }}>
                  {s.sku} · {s.slot === 'primary' ? 'primary bin' : 'overflow bin'}
                </div>
              </div>
              <button type="button" onClick={() => onOpenSku(s.sku)}
                style={{ border: 'none', background: 'transparent', color: T.accentStrong, cursor: 'pointer', fontSize: T.fsSmall, display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                Open item <ExternalLink size={12} aria-hidden />
              </button>
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, margin: '10px 0 0' }}>
              {[['On hand', s.qty_on_hand], ['Committed', s.committed_qty], ['Available', s.available_qty]].map(([k, v]) => (
                <div key={k}>
                  <dt style={{ fontSize: T.fsSmall, color: T.textMuted }}>{k}</dt>
                  <dd style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</dd>
                </div>
              ))}
            </dl>
            <p style={{ margin: '8px 0 0', fontSize: T.fsSmall, color: s.over ? T.danger : T.textMuted }}>
              {s.max_qty ? `Bin holds up to ${fmt(s.max_qty)}.` : 'No capacity set for this bin.'}
              {s.over && ' More on hand than its bins hold.'}
            </p>
          </section>
        ))}
        {entry && (
          <p style={{ fontSize: T.fsSmall, color: T.textMuted, marginTop: 10 }}>
            Figures are the SKU's totals at {branch}; stock is counted per branch, not per box.
          </p>
        )}
      </div>
    </aside>
  );
}

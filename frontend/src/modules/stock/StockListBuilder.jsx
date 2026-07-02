import { useState } from 'react';
import { Play, X, Eye, Plus, Pencil, Boxes } from 'lucide-react';
import { T } from '../../ui/tokens';
import DataGrid from '../../ui/DataGrid';
import { stockAvailable } from './stockListFilters';

// Jim2 "Stock List" — filter form over inventory + live results grid + the
// Add / Edit / View · Run · Cancel · Show Total bar. Presentational: parent owns
// the draft filter and live results.

const lbl = { fontSize: 9, fontWeight: 700, color: T.textFaint, letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: 2, display: 'block' };
const inp = { width: '100%', border: `1px solid ${T.hairline}`, borderRadius: 4, padding: '4px 6px', fontSize: T.fsSmall, fontFamily: T.font, color: T.text, background: T.panel, outline: 'none', height: 28, boxSizing: 'border-box' };

function Group({ title, children }) {
  return (
    <section style={{ border: `1px solid ${T.hairline}`, borderRadius: 7, background: T.panel, overflow: 'hidden', alignSelf: 'start' }}>
      <div style={{ padding: '5px 10px', background: T.hairlineSoft, borderBottom: `1px solid ${T.hairline}`, fontSize: 9, fontWeight: 800, letterSpacing: '0.07em', color: T.textMuted, textTransform: 'uppercase' }}>{title}</div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </section>
  );
}
function Txt({ label, value, onChange, placeholder }) {
  return (<div><label style={lbl}>{label}</label><input style={inp} value={value || ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} /></div>);
}
function Sel({ label, value, onChange, options, allLabel = 'Any' }) {
  return (
    <div><label style={lbl}>{label}</label>
      <select style={inp} value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
function Chk({ label, checked, onToggle }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: T.fsSmall, cursor: 'pointer', padding: '4px 10px', borderRadius: 5, userSelect: 'none', border: `1px solid ${checked ? T.accentStrong : T.hairline}`, background: checked ? T.accentTint : T.panel, color: checked ? T.accentStrong : T.textMuted, fontWeight: checked ? 700 : 500 }}>
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ accentColor: T.accentStrong }} />{label}
    </label>
  );
}
const btn = (variant) => {
  const base = { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', fontSize: T.fsSmall, borderRadius: 6, cursor: 'pointer', fontWeight: 600 };
  if (variant === 'primary') return { ...base, color: '#fff', background: T.accentStrong, border: 'none', fontWeight: 700, padding: '6px 18px' };
  if (variant === 'accent') return { ...base, color: T.accentStrong, background: T.accentTint, border: `1px solid ${T.accentStrong}` };
  return { ...base, color: T.textMuted, background: T.hairlineSoft, border: `1px solid ${T.hairline}` };
};

const num = (n) => Number(n || 0).toLocaleString();
const RESULT_COLUMNS = (onOpen) => [
  { key: 'sku', label: 'Code', width: 128, render: r => <span style={{ fontWeight: 700, fontFamily: T.mono ?? 'monospace' }}>{r.sku}</span> },
  { key: 'name', label: 'Description' },
  { key: 'stock', label: 'On Hand', width: 74, align: 'right', render: r => num(r.stock) },
  { key: 'committed_qty', label: 'Committed', width: 82, align: 'right', render: r => num(r.committed_qty) },
  { key: '_avail', label: 'Available', width: 78, align: 'right', render: r => <span style={{ fontWeight: 600, color: stockAvailable(r) > 0 ? T.ok : T.danger }}>{num(stockAvailable(r))}</span> },
  { key: 'on_order_qty', label: 'On PO', width: 64, align: 'right', render: r => (Number(r.on_order_qty || 0) > 0 ? num(r.on_order_qty) : '—') },
  { key: 'unitCost', label: 'Cost', width: 74, align: 'right', render: r => Number(r.unitCost || 0).toFixed(2) },
  { key: 'unitPrice', label: 'Sell', width: 74, align: 'right', render: r => Number(r.unitPrice || 0).toFixed(2) },
  {
    key: '_open', label: '', width: 32, render: r => (
      <span role="button" tabIndex={0} aria-label={`View ${r.sku}`} title="View stock item"
        onClick={e => { e.stopPropagation(); onOpen?.(r); }} style={{ color: T.textFaint, display: 'flex' }}><Eye size={13} /></span>
    ),
  },
];

export default function StockListBuilder({ draft, listName, onChange, options, results, onRun, onCancel, onAddItem, onEditItem, onViewItem }) {
  const set = (patch) => onChange(patch);
  const o = options || {};
  const [selectedId, setSelectedId] = useState(null);
  const [showTotal, setShowTotal] = useState(false);
  const selected = (results || []).find(r => r.sku === selectedId) || null;
  const stockValue = (results || []).reduce((s, r) => s + Number(r.stock || 0) * Number(r.unitCost || 0), 0);

  return (
    <div style={{ fontFamily: T.font, display: 'flex', flexDirection: 'column', background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${T.hairline}` }}>
        <Boxes size={16} style={{ color: T.accentStrong }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{listName || 'Stock List'}</div>
          <div style={{ fontSize: 10.5, color: T.textFaint }}>Set filters, then Run — empty fields match everything</div>
        </div>
        <button onClick={onCancel} aria-label="Close" style={{ display: 'flex', padding: 4, borderRadius: 5, border: 'none', background: 'transparent', color: T.textFaint, cursor: 'pointer' }}><X size={16} /></button>
      </div>

      <div style={{ padding: 14, borderBottom: `1px solid ${T.hairline}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'start' }}>
          <Group title="Item">
            <Txt label="Code" value={draft.code} onChange={v => set({ code: v })} placeholder="SKU / part of it" />
            <Txt label="Description" value={draft.description} onChange={v => set({ description: v })} placeholder="name contains…" />
            <Sel label="Category" value={draft.category} onChange={v => set({ category: v })} options={o.categories || []} />
            <Sel label="Supplier" value={draft.supplier} onChange={v => set({ supplier: v })} options={o.suppliers || []} />
          </Group>
          <Group title="Classification">
            <Sel label="GL Group" value={draft.glGroup} onChange={v => set({ glGroup: v })} options={o.glGroups || []} />
            <Sel label="Location" value={draft.location} onChange={v => set({ location: v })} options={o.locations || []} />
            <Sel label="Item Type" value={draft.itemType} onChange={v => set({ itemType: v })} options={o.itemTypes || []} />
            <Sel label="Status" value={draft.status} onChange={v => set({ status: v })} options={['Active', 'Inactive']} />
          </Group>
        </div>
        <div style={{ marginTop: 12, padding: '10px 12px', border: `1px solid ${T.hairline}`, borderRadius: 7, background: T.hairlineSoft }}>
          <span style={{ ...lbl, marginBottom: 8 }}>Show items that are</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            <Chk label="Low stock" checked={!!draft.lowStock} onToggle={() => set({ lowStock: !draft.lowStock })} />
            <Chk label="On PO" checked={!!draft.onPO} onToggle={() => set({ onPO: !draft.onPO })} />
            <Chk label="Committed" checked={!!draft.committed} onToggle={() => set({ committed: !draft.committed })} />
            <Chk label="Out of stock" checked={!!draft.outOfStock} onToggle={() => set({ outOfStock: !draft.outOfStock })} />
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 14px 14px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <span style={{ ...lbl, marginBottom: 0 }}>Results</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{results ? results.length : '…'}</span>
          <span style={{ fontSize: 10.5, color: T.textFaint }}>item{results && results.length === 1 ? '' : 's'} — click to select, double-click to view</span>
        </div>
        <DataGrid
          columns={RESULT_COLUMNS(onViewItem)}
          rows={results}
          rowKey="sku"
          selectedKey={selectedId}
          onRowClick={(r) => setSelectedId(r.sku)}
          onRowDoubleClick={onViewItem}
          emptyText="No stock items match these filters"
          maxHeight="30vh"
          initialSort={{ key: 'sku', dir: 'asc' }}
        />
        {showTotal && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 6, fontSize: T.fsSmall, color: T.textMuted }}>
            <span>{(results || []).length} items</span>
            <span style={{ fontWeight: 700, color: T.text }}>Stock value ${stockValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>

      <div style={{ padding: '10px 14px', borderTop: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', gap: 8, background: T.hairlineSoft }}>
        <button onClick={onAddItem} style={btn()}><Plus size={13} /> Add</button>
        <button onClick={() => selected && onEditItem(selected)} disabled={!selected} style={{ ...btn(), opacity: selected ? 1 : 0.45, cursor: selected ? 'pointer' : 'not-allowed' }}><Pencil size={13} /> Edit</button>
        <button onClick={() => selected && onViewItem(selected)} disabled={!selected} style={{ ...btn(), opacity: selected ? 1 : 0.45, cursor: selected ? 'pointer' : 'not-allowed' }}><Eye size={13} /> View</button>
        <div style={{ flex: 1 }} />
        <button onClick={onRun} style={btn('primary')}><Play size={13} /> Run</button>
        <button onClick={onCancel} style={{ ...btn(), color: T.danger, borderColor: T.danger }}><X size={13} /> Cancel</button>
        <button onClick={() => setShowTotal(s => !s)} style={showTotal ? btn('accent') : btn()}>Show Total</button>
      </div>
    </div>
  );
}

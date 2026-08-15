import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Edit2, Trash2, Package, Tag, Grid, List,
  ChevronRight, X, Check, RefreshCw, Layers, Palette, Ruler,
  AlertCircle, TrendingUp, Box, Info,
} from 'lucide-react';
import { styles as stylesApi, inventory as inventoryApi } from '../api';
import { T } from '../ui/tokens';

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRESET_SIZES = {
  'XS-3XL': ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
  'S-2XL': ['S', 'M', 'L', 'XL', '2XL'],
  'Kids (4-16)': ['4', '6', '8', '10', '12', '14', '16'],
  'Kids (2-12)': ['2', '4', '6', '8', '10', '12'],
  'Numeric (26-38)': ['26', '28', '30', '32', '34', '36', '38'],
  'OS': ['OS'],
};

const PRESET_COLOURS = [
  { code: 'BLK', name: 'Black', hex: '#1a1a1a' },
  { code: 'WHT', name: 'White', hex: '#ffffff' },
  { code: 'NVY', name: 'Navy', hex: '#001f5b' },
  { code: 'RED', name: 'Red', hex: '#cc0000' },
  { code: 'ROY', name: 'Royal Blue', hex: '#2351be' },
  { code: 'SKY', name: 'Sky Blue', hex: '#69b3e7' },
  { code: 'GRY', name: 'Grey', hex: '#888888' },
  { code: 'CHR', name: 'Charcoal', hex: '#444444' },
  { code: 'BOT', name: 'Bottle Green', hex: '#1a5c38' },
  { code: 'GLD', name: 'Gold', hex: '#d4a017' },
  { code: 'OGE', name: 'Orange', hex: '#e05c1a' },
  { code: 'PPL', name: 'Purple', hex: '#6b2fa0' },
  { code: 'MAR', name: 'Maroon', hex: '#7b0028' },
  { code: 'TUR', name: 'Turquoise', hex: '#00897b' },
  { code: 'PIK', name: 'Pink', hex: '#e91e8c' },
];

function stockStyle(qty) {
  if (qty === undefined) return { background: T.hairlineSoft, color: T.textFaint };
  if (qty === 0) return { background: '#fef2f2', color: T.danger };
  if (qty <= 5) return { background: '#fffbeb', color: '#b45309' };
  return { background: T.okTint, color: T.ok };
}

function totalStock(style) {
  return style.total_stock ?? 0;
}

// ── Style Form Modal ─────────────────────────────────────────────────────────

function StyleFormModal({ initial, onSave, onClose }) {
  const empty = {
    code: '', name: '', category: '', brand: '', gender: '',
    season: '', collection: '', description: '',
    base_purchase_price: 0, base_sell_price: 0,
    gst_applicable: true, notes: '', active: true,
    colours: [], sizes: [],
  };
  const [form, setForm] = useState(initial ? { ...empty, ...initial } : empty);
  const [tab, setTab] = useState('info');
  const [colourInput, setColourInput] = useState({ code: '', name: '', hex: '#000000' });
  const [sizeInput, setSizeInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const f = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }));

  const purchasePrice = parseFloat(form.base_purchase_price) || 0;
  const sellPrice = parseFloat(form.base_sell_price) || 0;
  const liveMargin = sellPrice > 0 ? ((sellPrice - purchasePrice) / sellPrice * 100) : null;

  function addColour() {
    if (!colourInput.code || !colourInput.name) return;
    const c = { code: colourInput.code.toUpperCase(), name: colourInput.name, hex: colourInput.hex, sort_order: form.colours.length };
    setForm(p => ({ ...p, colours: [...p.colours, c] }));
    setColourInput({ code: '', name: '', hex: '#000000' });
  }

  function addPresetColour(preset) {
    if (form.colours.find(c => c.code === preset.code)) return;
    setForm(p => ({ ...p, colours: [...p.colours, { ...preset, sort_order: p.colours.length }] }));
  }

  function removeColour(code) {
    setForm(p => ({ ...p, colours: p.colours.filter(c => c.code !== code) }));
  }

  function addSizes(codes) {
    const existing = new Set(form.sizes.map(s => s.code));
    const newSizes = codes.filter(c => !existing.has(c)).map((c, i) => ({ code: c, sort_order: form.sizes.length + i }));
    setForm(p => ({ ...p, sizes: [...p.sizes, ...newSizes] }));
  }

  function addSizeInput() {
    const codes = sizeInput.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    addSizes(codes);
    setSizeInput('');
  }

  function removeSize(code) {
    setForm(p => ({ ...p, sizes: p.sizes.filter(s => s.code !== code) }));
  }

  async function handleSave() {
    if (!form.code || !form.name) { setErr('Code and Name are required'); return; }
    if (parseFloat(form.base_purchase_price) < 0) { setErr('Purchase price cannot be negative'); return; }
    if (parseFloat(form.base_sell_price) < 0) { setErr('Sell price cannot be negative'); return; }
    setSaving(true);
    setErr('');
    try {
      await onSave(form);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    border: `1px solid ${T.hairline}`,
    color: T.text,
    background: T.panel,
    borderRadius: T.radius,
  };
  const labelStyle = { color: T.textMuted };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]" style={{ background: T.panel }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${T.hairline}` }}>
          <h2 className="font-semibold flex items-center gap-2" style={{ color: T.text }}>
            <Layers className="w-4 h-4" style={{ color: T.accentStrong }} />
            {initial ? 'Edit Style' : 'New Style'}
          </h2>
          <button onClick={onClose} style={{ color: T.textMuted }}><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 text-sm" style={{ borderBottom: `1px solid ${T.hairline}` }}>
          {[['info', 'Style Info'], ['colours', `Colours (${form.colours.length})`], ['sizes', `Sizes (${form.sizes.length})`]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className="px-3 py-2 border-b-2 font-medium transition-colors"
              style={tab === id
                ? { borderColor: T.accentStrong, color: T.accentStrong }
                : { borderColor: 'transparent', color: T.textMuted }}>
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {err && (
            <div className="px-3 py-2 rounded text-sm flex gap-2"
              style={{ background: '#fef2f2', border: `1px solid #fecaca`, color: T.danger }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{err}
            </div>
          )}

          {tab === 'info' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Style Code *</label>
                  <input className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.code} onChange={f('code')} placeholder="e.g. POLO-5230" disabled={!!initial} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Style Name *</label>
                  <input className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.name} onChange={f('name')} placeholder="e.g. Classic Polo Shirt" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Category</label>
                  <input className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.category} onChange={f('category')} placeholder="Polo Shirts, Jackets, Caps…" list="cat-list" />
                  <datalist id="cat-list">
                    {['Polo Shirts', 'T-Shirts', 'Jackets', 'Pants', 'Shorts', 'Caps', 'Bags', 'Hi-Vis', 'Dress Shirts', 'Fleece'].map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Brand</label>
                  <input className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.brand} onChange={f('brand')} placeholder="e.g. JB's Wear, AS Colour" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Gender</label>
                  <select className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.gender} onChange={f('gender')}>
                    <option value="">— select —</option>
                    <option>Unisex</option><option>Mens</option><option>Womens</option><option>Kids</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Season</label>
                  <input className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.season} onChange={f('season')} placeholder="Core, AW2026, SS2026…" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Collection</label>
                  <input className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.collection} onChange={f('collection')} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Status</label>
                  <select className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.active ? 'active' : 'archived'} onChange={e => setForm(p => ({ ...p, active: e.target.value === 'active' }))}>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Base Purchase Price (ex GST)</label>
                  <input type="number" className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.base_purchase_price} onChange={f('base_purchase_price')} min="0" step="0.01" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Base Sell Price (ex GST)</label>
                  <input type="number" className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.base_sell_price} onChange={f('base_sell_price')} min="0" step="0.01" />
                </div>
              </div>
              {liveMargin !== null && (
                <div className={`text-xs px-3 py-1.5 rounded flex items-center gap-2 ${liveMargin >= 30 ? 'bg-emerald-50 text-emerald-700' : liveMargin >= 10 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>
                  <TrendingUp className="w-3.5 h-3.5" />
                  Gross margin: <strong>{liveMargin.toFixed(1)}%</strong>
                  {liveMargin < 10 && ' — below minimum target'}
                  {liveMargin >= 10 && liveMargin < 30 && ' — acceptable'}
                  {liveMargin >= 30 && ' — healthy'}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Description / Notes</label>
                <textarea className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} rows={3} value={form.description} onChange={f('description')} />
              </div>
            </>
          )}

          {tab === 'colours' && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: T.textMuted }}>Add the colours this style comes in. These drive the variant matrix columns.</p>
              {/* Preset chips */}
              <div>
                <p className="text-xs font-medium mb-1.5" style={{ color: T.textMuted }}>Quick-add common colours</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLOURS.map(p => (
                    <button key={p.code} onClick={() => addPresetColour(p)} type="button"
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors"
                      style={form.colours.find(c => c.code === p.code)
                        ? { background: T.hairlineSoft, color: T.textFaint, border: `1px solid ${T.hairline}` }
                        : { background: T.panel, color: T.text, border: `1px solid ${T.hairline}` }}>
                      {/* garment colour swatch — preserve actual hex */}
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.hex, border: `1px solid ${T.hairline}` }} />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              {/* Custom colour entry */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Code</label>
                  <input className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={colourInput.code} onChange={e => setColourInput(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="NVY" maxLength={10} />
                </div>
                <div className="flex-[2]">
                  <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Colour Name</label>
                  <input className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={colourInput.name} onChange={e => setColourInput(p => ({ ...p, name: e.target.value }))} placeholder="Navy" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Swatch</label>
                  {/* garment swatch colour picker — preserve actual hex value */}
                  <input type="color" className="h-[34px] w-10 rounded cursor-pointer" style={{ border: `1px solid ${T.hairline}` }} value={colourInput.hex} onChange={e => setColourInput(p => ({ ...p, hex: e.target.value }))} />
                </div>
                <button onClick={addColour} type="button" className="px-3 py-1.5 rounded text-sm text-white" style={{ background: T.accentStrong }}>Add</button>
              </div>
              {/* Colour list */}
              {form.colours.length > 0 && (
                <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.hairline}` }}>
                  {form.colours.map(c => (
                    <div key={c.code} className="flex items-center gap-3 px-3 py-2 last:border-0"
                      style={{ borderBottom: `1px solid ${T.hairline}`, background: T.panel }}>
                      {/* garment colour swatch — preserve actual hex */}
                      <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: c.hex || '#ccc', border: `1px solid ${T.hairline}` }} />
                      <span className="font-mono text-xs w-12" style={{ color: T.textMuted }}>{c.code}</span>
                      <span className="text-sm flex-1" style={{ color: T.text }}>{c.name}</span>
                      <button onClick={() => removeColour(c.code)} style={{ color: T.danger }}><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'sizes' && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: T.textMuted }}>Add the sizes this style comes in. These drive the variant matrix rows.</p>
              {/* Preset buttons */}
              <div>
                <p className="text-xs font-medium mb-1.5" style={{ color: T.textMuted }}>Apply size run preset</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(PRESET_SIZES).map(([label, codes]) => (
                    <button key={label} onClick={() => addSizes(codes)} type="button"
                      className="px-2.5 py-1 rounded text-xs transition-colors"
                      style={{ background: T.panel, color: T.text, border: `1px solid ${T.hairline}` }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Manual entry */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-0.5" style={labelStyle}>Size codes (space or comma separated)</label>
                  <input className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={sizeInput} onChange={e => setSizeInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSizeInput(); } }}
                    placeholder="e.g. XS S M L XL" />
                </div>
                <button onClick={addSizeInput} type="button" className="px-3 py-1.5 rounded text-sm text-white" style={{ background: T.accentStrong }}>Add</button>
              </div>
              {/* Size chips */}
              {form.sizes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.sizes.map(sz => (
                    <span key={sz.code} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-sm"
                      style={{ background: T.accentTint, border: `1px solid ${T.accentFocus}`, color: T.accentStrong }}>
                      {sz.code}
                      <button onClick={() => removeSize(sz.code)} style={{ color: T.accentStrong }}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: `1px solid ${T.hairline}`, background: T.hairlineSoft }}>
          <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: T.textMuted }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg disabled:opacity-60 flex items-center gap-1.5 text-white"
            style={{ background: T.accentStrong }}>
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {initial ? 'Save Changes' : 'Create Style'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Variant Matrix ────────────────────────────────────────────────────────────

function VariantMatrix({ style, onGenerateSkus, generating }) {
  const { colours, sizes, matrix = {} } = style;

  if (!colours.length && !sizes.length) {
    return (
      <div className="text-center py-12" style={{ color: T.textFaint }}>
        <Grid className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No colours or sizes defined yet.</p>
        <p className="text-xs mt-1">Edit this style to add colours and sizes, then generate SKUs.</p>
      </div>
    );
  }

  const missingSkus = colours.length * sizes.length - style.sku_count;
  const totalByColour = colours.map(c => sizes.reduce((s, sz) => s + (matrix[c.code]?.[sz.code]?.stock ?? 0), 0));
  const totalBySize = sizes.map(sz => colours.reduce((s, c) => s + (matrix[c.code]?.[sz.code]?.stock ?? 0), 0));
  const grandTotal = totalByColour.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-3">
      {missingSkus > 0 && (
        <div className="flex items-center justify-between rounded-lg px-4 py-2.5"
          style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: '#b45309' }}>
            <AlertCircle className="w-4 h-4" />
            <span>{missingSkus} variant SKU{missingSkus !== 1 ? 's' : ''} not yet created in inventory</span>
          </div>
          <button onClick={onGenerateSkus} disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg disabled:opacity-60 text-white"
            style={{ background: '#b45309' }}>
            {generating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Generate SKUs
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 font-medium min-w-[120px]"
                style={{ background: T.hairlineSoft, border: `1px solid ${T.hairline}`, color: T.textMuted }}>
                Colour ↓ / Size →
              </th>
              {sizes.map((sz, i) => (
                <th key={sz.code} className="px-3 py-2 font-semibold text-center min-w-[60px]"
                  style={{ background: T.hairlineSoft, border: `1px solid ${T.hairline}`, color: T.text }}>
                  {sz.code}
                  <div className="text-[10px] font-normal" style={{ color: T.textFaint }}>{totalBySize[i]}</div>
                </th>
              ))}
              <th className="px-3 py-2 font-semibold text-center min-w-[60px]"
                style={{ background: T.accentTint, border: `1px solid ${T.hairline}`, color: T.accentStrong }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {colours.map((c, ci) => (
              <tr key={c.code}>
                <td className="px-3 py-2" style={{ border: `1px solid ${T.hairline}`, background: T.panel }}>
                  <div className="flex items-center gap-2">
                    {/* garment colour swatch — preserve actual hex */}
                    <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: c.hex || '#ccc', border: `1px solid ${T.hairline}` }} />
                    <div>
                      <span className="font-medium" style={{ color: T.text }}>{c.name}</span>
                      <span className="ml-1.5 font-mono" style={{ color: T.textFaint }}>{c.code}</span>
                    </div>
                  </div>
                </td>
                {sizes.map(sz => {
                  const cell = matrix[c.code]?.[sz.code];
                  return (
                    <td key={sz.code} title={cell !== undefined ? `${style.code}-${c.code}-${sz.code}: ${cell.stock} in stock` : 'SKU not yet created — click Generate SKUs'}
                      className="px-2 py-2 text-center font-mono font-semibold"
                      style={{ border: `1px solid ${T.hairline}`, ...stockStyle(cell?.stock) }}>
                      {cell !== undefined ? cell.stock : <span className="text-xs" style={{ color: T.hairline }}>no SKU</span>}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-center font-semibold font-mono"
                  style={{ border: `1px solid ${T.hairline}`, background: T.accentTint, color: T.accentStrong }}>
                  {totalByColour[ci]}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-3 py-2 font-semibold text-right"
                style={{ border: `1px solid ${T.hairline}`, background: T.hairlineSoft, color: T.text }}>Total</td>
              {totalBySize.map((t, i) => (
                <td key={i} className="px-2 py-2 text-center font-semibold font-mono"
                  style={{ border: `1px solid ${T.hairline}`, background: T.hairlineSoft, color: T.text }}>{t}</td>
              ))}
              <td className="px-2 py-2 text-center font-bold font-mono"
                style={{ border: `1px solid ${T.hairline}`, background: T.accentTint, color: T.accentStrong }}>{grandTotal}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Style Detail ──────────────────────────────────────────────────────────────

function StyleDetail({ style, onEdit, onDelete, onRefresh }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('matrix');
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: inventory } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.list(),
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); notify(m, { type: 'error' }); },
  });

  async function handleGenerateSkus() {
    if (!style.colours.length || !style.sizes.length) {
      alert('Add at least one colour and one size before generating SKUs.');
      return;
    }
    const preview = `${style.code}-{COLOUR}-{SIZE}\ne.g. ${style.code}-${style.colours[0].code}-${style.sizes[0].code}`;
    if (!window.confirm(`This will create ${style.colours.length * style.sizes.length} SKUs in the format:\n\n${preview}\n\nProceed?`)) return;
    setGenerating(true);
    try {
      const res = await stylesApi.generateSkus(style.id);
      await onRefresh();
      if (res.created > 0) qc.invalidateQueries(['inventory']);
      if (res.created === 0) alert('All SKUs already exist — nothing new was created.');
    } catch (e) {
      alert(e.message);
    } finally {
      setGenerating(false);
    }
  }

  const linkedSkus = (inventory || []).filter(i => i.style_id === style.id || (style.matrix && Object.values(style.matrix).some(bySize => bySize[i.size_code]?.sku === i.sku)));

  const margin = style.base_sell_price > 0
    ? ((style.base_sell_price - style.base_purchase_price) / style.base_sell_price * 100).toFixed(1)
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Style header */}
      <div className="px-5 py-3 space-y-2" style={{ borderBottom: `1px solid ${T.hairline}`, background: T.panel }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg flex-shrink-0"
              style={{ background: T.accentTint, color: T.accentStrong }}>
              {style.code.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs px-1.5 py-0.5 rounded"
                  style={{ background: T.hairlineSoft, color: T.textMuted }}>{style.code}</span>
                {!style.active && <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: '#fffbeb', color: '#b45309' }}>Archived</span>}
              </div>
              <h2 className="font-semibold text-base leading-tight mt-0.5" style={{ color: T.text }}>{style.name}</h2>
              <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: T.textMuted }}>
                {style.category && <span>{style.category}</span>}
                {style.brand && <><span>·</span><span className="font-medium">{style.brand}</span></>}
                {style.gender && <><span>·</span><span>{style.gender}</span></>}
                {style.season && <><span>·</span><span className="font-medium" style={{ color: T.accentStrong }}>{style.season}</span></>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg"
              style={{ border: `1px solid ${T.hairline}`, color: T.text }}>
              <Edit2 className="w-3.5 h-3.5" />Edit
            </button>
            <button onClick={() => setDeleting(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg"
              style={{ border: `1px solid #fca5a5`, color: T.danger }}>
              <Trash2 className="w-3.5 h-3.5" />Delete
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs" style={{ color: T.text }}>
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" style={{ color: T.textFaint }} />
            <span>{style.colours.length} colour{style.colours.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5" style={{ color: T.textFaint }} />
            <span>{style.sizes.length} size{style.sizes.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Box className="w-3.5 h-3.5" style={{ color: T.textFaint }} />
            <span>{style.sku_count} SKU{style.sku_count !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold">
            <Package className="w-3.5 h-3.5" style={{ color: T.textFaint }} />
            <span>{totalStock(style)} in stock</span>
          </div>
          {style.base_purchase_price > 0 && (
            <div className="flex items-center gap-1.5 ml-auto" style={{ color: T.textMuted }}>
              <span>Cost ${style.base_purchase_price.toFixed(2)}</span>
              <span>·</span>
              <span>Sell ${style.base_sell_price.toFixed(2)}</span>
              {margin && <span className="font-semibold" style={{ color: T.ok }}>({margin}%)</span>}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-5 text-sm" style={{ borderBottom: `1px solid ${T.hairline}`, background: T.panel }}>
        {[['matrix', 'Stock Matrix'], ['skus', `SKUs (${style.sku_count})`], ['info', 'Details']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className="px-3 py-2 border-b-2 font-medium transition-colors"
            style={tab === id
              ? { borderColor: T.accentStrong, color: T.accentStrong }
              : { borderColor: 'transparent', color: T.textMuted }}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'matrix' && (
          <VariantMatrix style={style} onGenerateSkus={handleGenerateSkus} generating={generating} />
        )}

        {tab === 'skus' && (
          <div className="overflow-x-auto">
            {style.sku_count === 0 ? (
              <div className="text-center py-10" style={{ color: T.textFaint }}>
                <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No inventory SKUs linked to this style yet.</p>
                {style.colours.length > 0 && style.sizes.length > 0 && (
                  <button onClick={handleGenerateSkus} disabled={generating}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg disabled:opacity-60 text-white"
                    style={{ background: T.accentStrong }}>
                    {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Generate SKUs now
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: T.hairlineSoft, color: T.textMuted }}>
                    <th className="text-left px-3 py-2 font-medium" style={{ borderBottom: `1px solid ${T.hairline}` }}>SKU</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ borderBottom: `1px solid ${T.hairline}` }}>Name</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ borderBottom: `1px solid ${T.hairline}` }}>Colour</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ borderBottom: `1px solid ${T.hairline}` }}>Size</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ borderBottom: `1px solid ${T.hairline}` }}>Stock</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ borderBottom: `1px solid ${T.hairline}` }}>Cost</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ borderBottom: `1px solid ${T.hairline}` }}>Sell</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(style.matrix || {}).flatMap(bySize =>
                    Object.values(bySize).map(cell => ({ ...cell }))
                  ).map(cell => (
                    <tr key={cell.sku} style={{ borderBottom: `1px solid ${T.hairline}` }}>
                      <td className="px-3 py-2 font-mono font-semibold" style={{ color: T.text }}>{cell.sku}</td>
                      <td className="px-3 py-2" style={{ color: T.textMuted }}>{cell.sku}</td>
                      <td className="px-3 py-2">
                        {(() => {
                          const cc = cell.sku.split('-').slice(-2, -1)[0];
                          const col = style.colours.find(c => c.code === cc);
                          return col ? (
                            <span className="flex items-center gap-1.5">
                              {/* garment colour swatch — preserve actual hex */}
                              <span className="w-3 h-3 rounded-full" style={{ background: col.hex || '#ccc', border: `1px solid ${T.hairline}` }} />
                              {col.name}
                            </span>
                          ) : cc;
                        })()}
                      </td>
                      <td className="px-3 py-2">{cell.sku.split('-').slice(-1)[0]}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold"
                        style={{ color: cell.stock === 0 ? T.danger : cell.stock <= 5 ? '#b45309' : T.ok }}>
                        {cell.stock}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: T.textMuted }}>${cell.unit_cost.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: T.text }}>${cell.sell_price.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'info' && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              ['Style Code', style.code, true],
              ['Style Name', style.name],
              ['Category', style.category],
              ['Brand', style.brand],
              ['Gender', style.gender],
              ['Season', style.season],
              ['Collection', style.collection],
              ['GST Applicable', style.gst_applicable ? 'Yes' : 'No'],
              ['Base Purchase Price', style.base_purchase_price > 0 ? `$${style.base_purchase_price.toFixed(2)}` : '—'],
              ['Base Sell Price', style.base_sell_price > 0 ? `$${style.base_sell_price.toFixed(2)}` : '—'],
            ].map(([label, value, mono]) => (
              value ? (
                <div key={label}>
                  <div className="text-xs font-medium mb-0.5" style={{ color: T.textFaint }}>{label}</div>
                  <div className={mono ? 'font-mono font-semibold' : ''} style={{ color: T.text }}>{value}</div>
                </div>
              ) : null
            ))}
            {style.description && (
              <div className="col-span-2">
                <div className="text-xs font-medium mb-0.5" style={{ color: T.textFaint }}>Description</div>
                <div className="whitespace-pre-wrap" style={{ color: T.text }}>{style.description}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="rounded-lg shadow-xl p-6 max-w-sm w-full mx-4" style={{ background: T.panel }}>
            <h3 className="font-semibold mb-2" style={{ color: T.text }}>Delete Style?</h3>
            <p className="text-sm mb-4" style={{ color: T.textMuted }}>This will delete <strong>{style.code} — {style.name}</strong> and unlink all {style.sku_count} associated inventory SKUs. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleting(false)} className="px-4 py-2 text-sm" style={{ color: T.textMuted }}>Cancel</button>
              <button onClick={() => onDelete(style.id)} className="px-4 py-2 text-sm rounded-lg text-white" style={{ background: T.danger }}>Delete Style</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Module ───────────────────────────────────────────────────────────────

export default function StylesModule() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSeason, setFilterSeason] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editStyle, setEditStyle] = useState(null);

  const { data: styleList = [], isLoading, refetch } = useQuery({
    queryKey: ['styles', search, filterCategory, filterBrand, filterSeason],
    queryFn: () => stylesApi.list({ search, category: filterCategory, brand: filterBrand, season: filterSeason }),
    staleTime: 15000,
    onError: (e) => { const m = e?.message || String(e); notify(m, { type: 'error' }); },
  });

  const { data: meta = { categories: [], brands: [], seasons: [] } } = useQuery({
    queryKey: ['styles-meta'],
    queryFn: stylesApi.meta,
    staleTime: 60000,
    onError: (e) => { const m = e?.message || String(e); notify(m, { type: 'error' }); },
  });

  const selected = styleList.find(s => s.id === selectedId) ?? null;

  const createMut = useMutation({
    mutationFn: (data) => stylesApi.create(data),
    onSuccess: (s) => {
      qc.invalidateQueries(['styles']);
      qc.invalidateQueries(['styles-meta']);
      setShowForm(false);
      setSelectedId(s.id);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => stylesApi.update(id, data),
    onSuccess: (s) => {
      qc.invalidateQueries(['styles']);
      setEditStyle(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => stylesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries(['styles']);
      qc.invalidateQueries(['styles-meta']);
      setSelectedId(null);
    },
  });

  const filteredStyles = useMemo(() => {
    if (!search) return styleList;
    const q = search.toLowerCase();
    return styleList.filter(s =>
      s.code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.brand || '').toLowerCase().includes(q)
    );
  }, [styleList, search]);

  return (
    <div className="flex h-full" style={{ background: T.hairlineSoft }}>
      {/* Left panel — style list */}
      <div className="w-72 flex-shrink-0 flex flex-col" style={{ background: T.panel, borderRight: `1px solid ${T.hairline}` }}>
        {/* List header */}
        <div className="px-3 py-3 space-y-2" style={{ borderBottom: `1px solid ${T.hairline}` }}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-1.5 text-sm" style={{ color: T.text }}>
              <Layers className="w-4 h-4" style={{ color: T.accentStrong }} />
              Styles
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full"
                style={{ background: T.hairlineSoft, color: T.textMuted }}>{filteredStyles.length}</span>
            </h2>
            <button onClick={() => { setEditStyle(null); setShowForm(true); }}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg text-white"
              style={{ background: T.accentStrong }}>
              <Plus className="w-3.5 h-3.5" />New
            </button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5" style={{ color: T.textFaint }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ border: `1px solid ${T.hairline}`, color: T.text, background: T.panel }}
              placeholder="Search code, name, brand…" />
          </div>
          {/* Filter chips */}
          <div className="flex flex-wrap gap-1">
            {[
              { label: 'Category', val: filterCategory, set: setFilterCategory, opts: meta.categories },
              { label: 'Brand', val: filterBrand, set: setFilterBrand, opts: meta.brands },
              { label: 'Season', val: filterSeason, set: setFilterSeason, opts: meta.seasons },
            ].map(({ label, val, set, opts }) => (
              <select key={label} value={val} onChange={e => set(e.target.value)}
                className="text-xs rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                style={{ border: `1px solid ${T.hairline}`, background: T.panel, color: T.text }}>
                <option value="">{label}</option>
                {opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
            {(filterCategory || filterBrand || filterSeason) && (
              <button onClick={() => { setFilterCategory(''); setFilterBrand(''); setFilterSeason(''); }}
                className="text-xs px-1" style={{ color: T.accentStrong }}>Clear</button>
            )}
          </div>
        </div>

        {/* Style list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-8 text-sm" style={{ color: T.textFaint }}>Loading…</div>
          ) : filteredStyles.length === 0 ? (
            <div className="text-center py-8" style={{ color: T.textFaint }}>
              <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No styles found</p>
              {!search && <p className="text-xs mt-1">Click "New" to add your first style</p>}
            </div>
          ) : (
            filteredStyles.map(s => (
              <button key={s.id} onClick={() => setSelectedId(s.id)}
                className="w-full text-left px-3 py-2.5 transition-colors"
                style={{
                  borderBottom: `1px solid ${T.hairline}`,
                  borderLeft: selectedId === s.id ? `2px solid ${T.accentStrong}` : '2px solid transparent',
                  background: selectedId === s.id ? T.accentTint : T.panel,
                }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px]" style={{ color: T.textFaint }}>{s.code}</span>
                      {!s.active && <span className="text-[9px] px-1 rounded" style={{ background: '#fffbeb', color: '#b45309' }}>archived</span>}
                    </div>
                    <div className="text-xs font-medium truncate" style={{ color: T.text }}>{s.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {s.brand && <span className="text-[10px]" style={{ color: T.textMuted }}>{s.brand}</span>}
                      {s.season && <span className="text-[10px]" style={{ color: T.accentStrong }}>{s.season}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex gap-1 justify-end mb-0.5">
                      {/* garment colour swatches — preserve actual hex */}
                      {s.colours.slice(0, 5).map(c => (
                        <span key={c.code} className="w-3 h-3 rounded-full shadow-sm" style={{ background: c.hex || '#ccc', border: '1px solid white' }} title={c.name} />
                      ))}
                      {s.colours.length > 5 && <span className="text-[10px]" style={{ color: T.textFaint }}>+{s.colours.length - 5}</span>}
                    </div>
                    <div className="text-[10px] font-mono font-semibold"
                      style={{ color: totalStock(s) === 0 ? T.danger : T.textMuted }}>
                      {totalStock(s)} pcs
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel — detail */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {selected ? (
          <StyleDetail
            key={selected.id}
            style={selected}
            onEdit={() => setEditStyle(selected)}
            onDelete={(id) => deleteMut.mutate(id)}
            onRefresh={refetch}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: T.textFaint }}>
            <Layers className="w-14 h-14 mb-4 opacity-20" />
            <p className="text-lg font-medium">Select a style</p>
            <p className="text-sm mt-1">Or create a new one to get started</p>
            <button onClick={() => setShowForm(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white"
              style={{ background: T.accentStrong }}>
              <Plus className="w-4 h-4" />New Style
            </button>
          </div>
        )}
      </div>

      {/* Create / Edit form modal */}
      {(showForm || editStyle) && (
        <StyleFormModal
          initial={editStyle}
          onClose={() => { setShowForm(false); setEditStyle(null); }}
          onSave={async (data) => {
            if (editStyle) {
              await updateMut.mutateAsync({ id: editStyle.id, data });
            } else {
              await createMut.mutateAsync(data);
            }
          }}
        />
      )}
    </div>
  );
}

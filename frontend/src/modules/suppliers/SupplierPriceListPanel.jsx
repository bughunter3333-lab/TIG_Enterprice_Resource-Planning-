import { React } from 'react';
import { Edit, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { notify } from '../../lib/notify';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../api';

export default function SupplierPriceListPanel({ supplierId }) {
  const queryClient = useQueryClient();
  const { data: items = [], isFetching, refetch } = useQuery({
    queryKey: ['supplier-price-list', supplierId],
    queryFn: () => api.supplierPriceLists.list(supplierId),
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); setErr(m); notify(m, { type: 'error' }); },
  });

  const emptyForm = { sku: '', description: '', unitCost: '', minQty: 1, leadTimeDays: '', validFrom: '', validTo: '', notes: '' };
  const [form, setForm] = React.useState(null);
  const [editId, setEditId] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');

  async function save() {
    if (!form.sku || !form.unitCost) { setErr('SKU and Unit Cost are required'); return; }
    setSaving(true); setErr('');
    try {
      if (editId) {
        await api.supplierPriceLists.update(supplierId, editId, { ...form, unitCost: parseFloat(form.unitCost) });
      } else {
        await api.supplierPriceLists.create(supplierId, { ...form, unitCost: parseFloat(form.unitCost) });
      }
      queryClient.invalidateQueries(['supplier-price-list', supplierId]);
      setForm(null); setEditId(null);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  async function del(id) {
    if (!window.confirm('Remove this price list entry?')) return;
    await api.supplierPriceLists.delete(supplierId, id);
    queryClient.invalidateQueries(['supplier-price-list', supplierId]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Contracted prices &amp; lead times from this supplier</p>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="text-xs text-accent-strong hover:text-accent-strong flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </button>
          <button onClick={() => { setForm({ ...emptyForm }); setEditId(null); setErr(''); }}
            className="flex items-center gap-1 px-3 py-1.5 bg-accent-strong text-white text-xs font-semibold rounded-lg hover:bg-accent-strong">
            <Plus className="w-3 h-3" />Add Price
          </button>
        </div>
      </div>

      {form && (
        <div className="bg-accent-tint border border-accent rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-accent-strong">{editId ? 'Edit' : 'Add'} Price List Entry</h4>
          {err && <p className="text-xs text-danger bg-danger-tint border border-danger rounded px-2 py-1">{err}</p>}
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-[10px] font-medium text-muted block mb-0.5">SKU *</label>
              <input className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-focus" value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} disabled={!!editId} /></div>
            <div><label className="text-[10px] font-medium text-muted block mb-0.5">Unit Cost *</label>
              <input type="number" min="0" step="0.01" className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-focus" value={form.unitCost}
                onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} /></div>
            <div><label className="text-[10px] font-medium text-muted block mb-0.5">Min Qty</label>
              <input type="number" min="1" className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-focus" value={form.minQty}
                onChange={e => setForm(f => ({ ...f, minQty: parseInt(e.target.value) || 1 }))} /></div>
            <div><label className="text-[10px] font-medium text-muted block mb-0.5">Lead Time (days)</label>
              <input type="number" min="0" className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-focus" value={form.leadTimeDays}
                onChange={e => setForm(f => ({ ...f, leadTimeDays: e.target.value }))} /></div>
            <div><label className="text-[10px] font-medium text-muted block mb-0.5">Valid From</label>
              <input type="date" className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-focus" value={form.validFrom}
                onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} /></div>
            <div><label className="text-[10px] font-medium text-muted block mb-0.5">Valid To</label>
              <input type="date" className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-focus" value={form.validTo}
                onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))} /></div>
            <div className="col-span-3"><label className="text-[10px] font-medium text-muted block mb-0.5">Description / Notes</label>
              <input className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-focus" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setForm(null); setEditId(null); }} className="px-3 py-1.5 text-xs text-muted hover:text-fg">Cancel</button>
            <button onClick={save} disabled={saving} className="px-3 py-1.5 text-xs bg-accent-strong text-white rounded-lg hover:bg-accent-strong disabled:opacity-60 flex items-center gap-1">
              {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Save
            </button>
          </div>
        </div>
      )}

      {items.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-panel-alt border-b">
              <tr>
                {['SKU','Unit Cost','Min Qty','Lead Time','Valid','Notes',''].map(h => (
                  <th key={h} className="text-left px-2 py-2 font-semibold text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-panel-alt'}>
                  <td className="px-2 py-2 font-mono font-bold text-accent-strong">{item.sku}</td>
                  <td className="px-2 py-2 font-semibold text-fg">${parseFloat(item.unit_cost || 0).toFixed(2)}</td>
                  <td className="px-2 py-2 text-muted">{item.min_qty || 1}</td>
                  <td className="px-2 py-2 text-muted">{item.lead_time_days ? `${item.lead_time_days}d` : '—'}</td>
                  <td className="px-2 py-2 text-muted text-[10px]">
                    {item.valid_from && item.valid_to ? `${item.valid_from} – ${item.valid_to}` : item.valid_from || item.valid_to || '—'}
                  </td>
                  <td className="px-2 py-2 text-muted max-w-28 truncate" title={item.notes}>{item.notes || '—'}</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditId(item.id); setForm({ sku: item.sku, description: item.description || '', unitCost: item.unit_cost, minQty: item.min_qty || 1, leadTimeDays: item.lead_time_days || '', validFrom: item.valid_from || '', validTo: item.valid_to || '', notes: item.notes || '' }); setErr(''); }}
                        className="p-1 hover:bg-accent-tint rounded text-accent"><Edit className="w-3 h-3" /></button>
                      <button onClick={() => del(item.id)} className="p-1 hover:bg-danger-tint rounded text-danger"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !isFetching && <p className="text-sm text-faint text-center py-8">No price list entries yet.</p>
      )}
    </div>
  );
}

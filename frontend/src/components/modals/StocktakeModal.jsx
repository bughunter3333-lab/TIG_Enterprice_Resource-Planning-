import { useQueryClient } from '@tanstack/react-query';
import { CheckSquare, X } from 'lucide-react';
import * as api from '../../api';
import DraggableModal from '../../ui/DraggableModal';
import { BRANCHES } from '../../branches';
import { T } from '../../ui/tokens';

export default function StocktakeModal({ setStocktakeModal, stocktakeModal }) {
  const queryClient = useQueryClient();
  if (!stocktakeModal.open) return null;
  const close = () => setStocktakeModal(m => ({ ...m, open: false }));
  const submit = async () => {
    setStocktakeModal(m => ({ ...m, loading: true, error: '' }));
    try {
      const result = await api.inventory.stocktake(stocktakeModal.items, stocktakeModal.reference, stocktakeModal.method, stocktakeModal.branch);
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
      setStocktakeModal(m => ({ ...m, loading: false, results: result }));
    } catch (e) { setStocktakeModal(m => ({ ...m, loading: false, error: e.message })); }
  };
  const updateCount = (sku, val) => setStocktakeModal(m => ({ ...m, items: m.items.map(i => i.sku === sku ? { ...i, countedQty: parseInt(val) || 0 } : i) }));
  return (
    <DraggableModal onClose={close} cardClass="w-[700px] p-6" cardStyle={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
      <div className="flex items-center justify-between mb-4 cursor-move select-none">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: T.text }}><CheckSquare className="w-5 h-5" style={{ color: T.ok }} />Stocktake</h3>
        <button onClick={close}><X className="w-5 h-5" style={{ color: T.textMuted }} /></button>
      </div>
      {stocktakeModal.results ? (
        <>
          <p className="text-sm font-medium mb-3" style={{ color: T.ok }}>Stocktake complete — {stocktakeModal.results.reference}</p>
          <div className="overflow-auto flex-1 rounded" style={{ border: `1px solid ${T.hairline}` }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: T.hairlineSoft }}><tr>{['SKU','Previous','Counted','Variance'].map(h => <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: T.textMuted }}>{h}</th>)}</tr></thead>
              <tbody>
                {stocktakeModal.results.results.map(r => (
                  <tr key={r.sku} style={{ borderTop: `1px solid ${T.hairline}` }}>
                    <td className="px-3 py-1.5 font-mono" style={{ color: T.text }}>{r.sku}</td>
                    <td className="px-3 py-1.5" style={{ color: T.text }}>{r.previous}</td>
                    <td className="px-3 py-1.5" style={{ color: T.text }}>{r.counted}</td>
                    <td className="px-3 py-1.5 font-medium" style={{ color: r.variance > 0 ? T.ok : r.variance < 0 ? T.danger : T.textFaint }}>{r.variance > 0 ? '+' : ''}{r.variance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end pt-3"><button onClick={close} className="px-4 py-2 text-white rounded text-sm" style={{ background: T.textMuted }}>Close</button></div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: T.text }}>Method</label>
              <select value={stocktakeModal.method} onChange={e => setStocktakeModal(m => ({ ...m, method: e.target.value }))} className="rounded px-3 py-1.5 text-sm" style={{ border: `1px solid ${T.hairline}` }}>
                <option>Informed</option><option>Blind</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: T.text }}>Branch counted</label>
              <select value={stocktakeModal.branch} onChange={e => setStocktakeModal(m => ({ ...m, branch: e.target.value }))} className="rounded px-3 py-1.5 text-sm" style={{ border: `1px solid ${T.hairline}` }}>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: T.text }}>Reference</label>
              <input value={stocktakeModal.reference} onChange={e => setStocktakeModal(m => ({ ...m, reference: e.target.value }))} placeholder="auto-generated if blank" className="rounded px-3 py-1.5 text-sm w-44" style={{ border: `1px solid ${T.hairline}` }} />
            </div>
          </div>
          <p className="text-xs mb-3" style={{ color: T.textMuted }}>
            Counting a branch also claims any stock that has no branch yet — the
            units are in front of you, so they stop being unlocated.
          </p>
          {stocktakeModal.error && <p className="text-sm mb-3" style={{ color: T.danger }}>{stocktakeModal.error}</p>}
          <div className="overflow-auto flex-1 rounded mb-4" style={{ border: `1px solid ${T.hairline}` }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: T.hairlineSoft }}><tr>{['SKU','Name','System Qty',stocktakeModal.method === 'Blind' ? 'Counted Qty' : 'Counted Qty'].map(h => <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: T.textMuted }}>{h}</th>)}</tr></thead>
              <tbody>
                {stocktakeModal.items.map(item => (
                  <tr key={item.sku} style={{ borderTop: `1px solid ${T.hairline}` }}>
                    <td className="px-3 py-1 font-mono" style={{ color: T.text }}>{item.sku}</td>
                    <td className="px-3 py-1" style={{ color: T.text }}>{item.name}</td>
                    <td className="px-3 py-1" style={{ color: T.textMuted }}>{stocktakeModal.method === 'Blind' ? '—' : item.currentStock}</td>
                    <td className="px-3 py-0.5"><input type="number" min="0" value={item.countedQty} onChange={e => updateCount(item.sku, e.target.value)} className={`w-20 border rounded px-2 py-1 text-xs ${item.countedQty !== item.currentStock ? 'border-indigo-400 bg-indigo-50' : ''}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 pt-3" style={{ borderTop: `1px solid ${T.hairline}` }}>
            <button onClick={close} className="px-4 py-2 rounded text-sm" style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}>Cancel</button>
            <button onClick={submit} disabled={stocktakeModal.loading} className="px-4 py-2 text-white rounded text-sm disabled:opacity-50 flex items-center gap-2" style={{ background: T.ok }}>
              <CheckSquare className="w-4 h-4" />{stocktakeModal.loading ? 'Saving...' : 'Commit Stocktake'}
            </button>
          </div>
        </>
      )}
    </DraggableModal>
  );
}

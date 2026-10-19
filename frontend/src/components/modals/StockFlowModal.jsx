import { TrendingUp, X } from 'lucide-react';
import DraggableModal from '../../ui/DraggableModal';
import { T } from '../../ui/tokens';

export default function StockFlowModal({ setStockFlowModal, stockFlowModal }) {
  if (!stockFlowModal.open) return null;
  const close = () => setStockFlowModal(m => ({ ...m, open: false }));
  const filtered = (stockFlowModal.data || []).filter(i => !stockFlowModal.search || i.sku.toLowerCase().includes(stockFlowModal.search.toLowerCase()) || i.name.toLowerCase().includes(stockFlowModal.search.toLowerCase()));
  return (
    <DraggableModal onClose={close} cardClass="w-[900px] p-6" cardStyle={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
      <div className="flex items-center justify-between mb-4 cursor-move select-none">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: T.text }}><TrendingUp className="w-5 h-5" style={{ color: T.accentStrong }} />Stock Flow</h3>
        <button onClick={close}><X className="w-5 h-5" style={{ color: T.textMuted }} /></button>
      </div>
      <input value={stockFlowModal.search} onChange={e => setStockFlowModal(m => ({ ...m, search: e.target.value }))} placeholder="Search SKU or name..." className="rounded px-3 py-2 text-sm mb-3 w-64" style={{ border: `1px solid ${T.hairline}` }} />
      {stockFlowModal.loading && <p className="text-sm py-8 text-center" style={{ color: T.textMuted }}>Loading stock flow data...</p>}
      {!stockFlowModal.loading && (
        <div className="overflow-auto flex-1 space-y-3">
          {filtered.map(item => (
            <div key={item.sku} className="rounded p-3" style={{ border: `1px solid ${T.hairline}` }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-mono font-medium text-sm" style={{ color: T.accentStrong }}>{item.sku}</span>
                  <span className="ml-2 text-sm" style={{ color: T.text }}>{item.name}</span>
                  {item.location && <span className="ml-2 text-xs" style={{ color: T.textFaint }}>@ {item.location}</span>}
                </div>
                <div className="flex items-center gap-4 text-xs" style={{ color: T.textMuted }}>
                  <span>Stock: <span className="font-semibold" style={{ color: item.stock <= item.min_stock ? T.danger : T.text }}>{item.stock}</span></span>
                  <span>Min: {item.min_stock}</span>
                  <span>Cost: ${item.unit_cost.toFixed(2)}</span>
                  <span>Price: ${item.sell_price.toFixed(2)}</span>
                </div>
              </div>
              {item.movements.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ borderTop: `1px solid ${T.hairline}` }}>
                    <thead style={{ color: T.textMuted }}><tr><th className="text-left py-1 pr-3">Date</th><th className="text-left py-1 pr-3">Type</th><th className="text-right py-1 pr-3">Qty</th><th className="text-left py-1 pr-3">Reference</th><th className="text-left py-1">Notes</th></tr></thead>
                    <tbody>
                      {item.movements.map(m => (
                        <tr key={m.id} style={{ borderTop: `1px solid ${T.hairline}` }}>
                          <td className="py-1 pr-3" style={{ color: T.textMuted }}>{m.date}</td>
                          <td className="py-1 pr-3" style={{ color: T.text }}>{m.type}</td>
                          <td className="py-1 pr-3 text-right font-medium" style={{ color: m.quantity > 0 ? T.ok : T.danger }}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                          <td className="py-1 pr-3" style={{ color: T.textMuted }}>{m.reference || '—'}</td>
                          <td className="py-1" style={{ color: T.textMuted }}>{m.notes || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-xs pt-1" style={{ color: T.textFaint }}>No movement history</p>}
            </div>
          ))}
          {filtered.length === 0 && <p className="text-sm text-center py-8" style={{ color: T.textFaint }}>No items match.</p>}
        </div>
      )}
    </DraggableModal>
  );
}

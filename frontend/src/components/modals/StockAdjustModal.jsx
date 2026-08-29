import { Box, X } from 'lucide-react';
import DraggableModal from '../../ui/DraggableModal';
import { T } from '../../ui/tokens';

export default function StockAdjustModal({ adjustStock, setStockAdjustModal, stockAdjustModal }) {
  if (!stockAdjustModal.show) return null;
  const adj = parseInt(stockAdjustModal.adjustment) || 0;
  const newStock = Math.max(0, stockAdjustModal.currentStock + adj);
  return (
    <DraggableModal onClose={() => setStockAdjustModal({ show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' })} cardClass="max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-4 cursor-move select-none">
          <h3 className="text-lg font-bold" style={{ color: T.text }}>Adjust Stock</h3>
          <button onClick={() => setStockAdjustModal({ show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' })}>
            <X className="w-5 h-5" style={{ color: T.textMuted }} />
          </button>
        </div>
        <p className="text-sm mb-4" style={{ color: T.textMuted }}>{stockAdjustModal.name}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: T.textMuted }}>Adjustment (+/-)</label>
            <input
              type="number"
              value={stockAdjustModal.adjustment}
              onChange={(e) => setStockAdjustModal({ ...stockAdjustModal, adjustment: e.target.value })}
              placeholder="e.g. +10 or -5"
              className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ border: `1px solid ${T.hairline}` }}
              autoFocus
            />
            <p className="text-xs mt-1" style={{ color: T.textFaint }}>
              Current: {stockAdjustModal.currentStock} → New: <span style={{ color: newStock < stockAdjustModal.currentStock ? T.danger : T.ok, fontWeight: 500 }}>{newStock}</span>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: T.textMuted }}>Reason</label>
            <input
              type="text"
              value={stockAdjustModal.reason}
              onChange={(e) => setStockAdjustModal({ ...stockAdjustModal, reason: e.target.value })}
              placeholder="e.g. Stocktake, Damaged goods..."
              className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ border: `1px solid ${T.hairline}` }}
            />
          </div>
        </div>
        <div className="flex justify-end space-x-2 mt-4 pt-4" style={{ borderTop: `1px solid ${T.hairline}` }}>
          <button
            onClick={() => setStockAdjustModal({ show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' })}
            className="px-4 py-2 rounded"
            style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (adj !== 0) adjustStock(stockAdjustModal.sku, adj, stockAdjustModal.reason || 'Manual adjustment');
              setStockAdjustModal({ show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' });
            }}
            disabled={adj === 0}
            className="px-4 py-2 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            style={{ background: T.accentStrong }}
          >
            <Box className="w-4 h-4 mr-2" />
            Apply Adjustment
          </button>
        </div>
    </DraggableModal>
  );
}

import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, X } from 'lucide-react';
import * as api from '../../api';
import DraggableModal from '../../ui/DraggableModal';
import { BRANCHES } from '../../branches';
import { T } from '../../ui/tokens';

export default function TransferModal({ inventory, setTransferModal, transferModal }) {
  const queryClient = useQueryClient();
  if (!transferModal.open) return null;
  const close = () => setTransferModal(m => ({ ...m, open: false }));
  const submit = async () => {
    if (!transferModal.fromSku) return setTransferModal(m => ({ ...m, error: 'Source SKU is required.' }));
    if (!transferModal.toSku && !transferModal.toLocation) return setTransferModal(m => ({ ...m, error: 'Destination SKU or Location is required.' }));
    setTransferModal(m => ({ ...m, loading: true, error: '' }));
    try {
      await api.inventory.transfer({ fromSku: transferModal.fromSku, toSku: transferModal.toSku || null, toLocation: transferModal.toLocation || null, quantity: transferModal.quantity, fromBranch: transferModal.fromBranch, toBranch: transferModal.toBranch, reference: transferModal.reference, notes: transferModal.notes });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
      close();
    } catch (e) { setTransferModal(m => ({ ...m, loading: false, error: e.message })); }
  };
  const fromItem = inventory.find(i => i.sku === transferModal.fromSku);
  return (
    <DraggableModal onClose={close} cardClass="w-[500px] p-6">
      <div className="flex items-center justify-between mb-4 cursor-move select-none">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: T.text }}><RefreshCw className="w-5 h-5" style={{ color: T.accentStrong }} />Transfer Stock</h3>
        <button onClick={close}><X className="w-5 h-5" style={{ color: T.textMuted }} /></button>
      </div>
      {transferModal.error && <p className="text-sm mb-3 px-3 py-2 rounded" style={{ color: T.danger, background: T.dangerTint }}>{transferModal.error}</p>}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: T.text }}>Source SKU *</label>
          <select value={transferModal.fromSku} onChange={e => setTransferModal(m => ({ ...m, fromSku: e.target.value }))} className="w-full rounded px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairline}` }}>
            <option value="">— Select source item —</option>
            {inventory.map(i => <option key={i.sku} value={i.sku}>{i.sku} — {i.name} (Stock: {i.stock})</option>)}
          </select>
          {fromItem && <p className="text-xs mt-1" style={{ color: T.textMuted }}>Available: {fromItem.stock} | Location: {fromItem.location || 'N/A'}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: T.text }}>Quantity *</label>
          <input type="number" min="1" max={fromItem?.stock || 9999} value={transferModal.quantity} onChange={e => setTransferModal(m => ({ ...m, quantity: parseInt(e.target.value) || 1 }))} className="w-32 rounded px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairline}` }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: T.text }}>From branch</label>
            <select value={transferModal.fromBranch} onChange={e => setTransferModal(m => ({ ...m, fromBranch: e.target.value }))} className="w-full rounded px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairline}` }}>
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: T.text }}>To branch</label>
            <select value={transferModal.toBranch} onChange={e => setTransferModal(m => ({ ...m, toBranch: e.target.value }))} className="w-full rounded px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairline}` }}>
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
        <div className="pt-3" style={{ borderTop: `1px solid ${T.hairline}` }}>
          <p className="text-xs mb-2 font-medium" style={{ color: T.textMuted }}>DESTINATION — fill one:</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: T.text }}>Destination SKU</label>
              <select value={transferModal.toSku} onChange={e => setTransferModal(m => ({ ...m, toSku: e.target.value, toLocation: '' }))} className="w-full rounded px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairline}` }}>
                <option value="">— Same item —</option>
                {inventory.filter(i => i.sku !== transferModal.fromSku).map(i => <option key={i.sku} value={i.sku}>{i.sku} — {i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: T.text }}>New Location</label>
              <input value={transferModal.toLocation} onChange={e => setTransferModal(m => ({ ...m, toLocation: e.target.value, toSku: '' }))} placeholder="e.g. Bin A3" className="w-full rounded px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairline}` }} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: T.text }}>Reference</label>
            <input value={transferModal.reference} onChange={e => setTransferModal(m => ({ ...m, reference: e.target.value }))} placeholder="XFER-001" className="w-full rounded px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairline}` }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: T.text }}>Notes</label>
            <input value={transferModal.notes} onChange={e => setTransferModal(m => ({ ...m, notes: e.target.value }))} placeholder="Optional" className="w-full rounded px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairline}` }} />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4" style={{ borderTop: `1px solid ${T.hairline}` }}>
        <button onClick={close} className="px-4 py-2 rounded text-sm" style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}>Cancel</button>
        <button onClick={submit} disabled={transferModal.loading} className="px-4 py-2 text-white rounded text-sm disabled:opacity-50 flex items-center gap-2" style={{ background: T.ok }}>
          <RefreshCw className="w-4 h-4" />{transferModal.loading ? 'Transferring...' : 'Transfer'}
        </button>
      </div>
    </DraggableModal>
  );
}

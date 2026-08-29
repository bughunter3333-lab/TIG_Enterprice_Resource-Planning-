/**
 * UNREACHABLE. Nothing opens this modal.
 *
 * `dispatchModal` is declared in TotalImageERP.jsx and passed in, but no code
 * anywhere sets `open: true` on it, so this never renders. That was already
 * true while it lived inside the monolith as renderDispatchModal; carving it
 * into its own file did not change it, but it does make it look like a live
 * component sitting next to ten that are, which is worse.
 *
 * Dispatch actually happens through `dispatchBatch` in TotalImageERP.jsx,
 * which posts to `api.dispatchSessions.create`, with the UI in
 * src/modules/jobs/DispatchList.jsx. This file still calls the older
 * single-job `api.jobs.dispatch`.
 *
 * Delete it and its state, or wire it and retire the batch path. Keeping both
 * is the outcome that gets the wrong one edited. Recorded as F3 in
 * docs/backlog.md.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Box, Truck, X } from 'lucide-react';
import * as api from '../../api';
import DraggableModal from '../../ui/DraggableModal';
import { T } from '../../ui/tokens';

  // Takes the monolith's updatePinnedJob, not setActiveJob. The job can be open
  // in the pinned tab strip as well as active, and setActiveJob only refreshes
  // one of the two — so the strip kept showing the pre-unprint status until a
  // refetch landed. updatePinnedJob writes both, and is what every other save
  // path in the app already uses.
export default function DispatchModal({ dispatchModal, onJobUpdated, setDispatchModal }) {
  const queryClient = useQueryClient();
  if (!dispatchModal.open) return null;
  const close = () => setDispatchModal(m => ({ ...m, open: false }));
  const submit = async () => {
    if (!dispatchModal.shipVia || !dispatchModal.shipRef) return setDispatchModal(m => ({ ...m, error: 'Ship Via and Reference are required.' }));
    setDispatchModal(m => ({ ...m, loading: true, error: '' }));
    try {
      const updated = await api.jobs.dispatch(dispatchModal.job.id, { shipVia: dispatchModal.shipVia, shipRef: dispatchModal.shipRef, cartons: dispatchModal.cartons, notes: dispatchModal.notes, advanceStatus: dispatchModal.advanceStatus });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      onJobUpdated(updated);
      close();
    } catch (e) { setDispatchModal(m => ({ ...m, loading: false, error: e.message })); }
  };
  return (
    <DraggableModal onClose={close} cardClass="w-[480px] p-6">
      <div className="flex items-center justify-between mb-4 cursor-move select-none">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: T.text }}><Box className="w-5 h-5" style={{ color: T.accentStrong }} />Dispatch Job #{dispatchModal.job?.id}</h3>
        <button onClick={close}><X className="w-5 h-5" style={{ color: T.textMuted }} /></button>
      </div>
      {dispatchModal.error && <p className="text-sm mb-3 px-3 py-2 rounded" style={{ color: T.danger, border: `1px solid ${T.danger}` }}>{dispatchModal.error}</p>}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: T.textMuted }}>Ship Via *</label>
            <input value={dispatchModal.shipVia} onChange={e => setDispatchModal(m => ({ ...m, shipVia: e.target.value }))} placeholder="e.g. StarTrack, Australia Post" className="w-full rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ border: `1px solid ${T.hairline}` }} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: T.textMuted }}>Ship Reference *</label>
            <input value={dispatchModal.shipRef} onChange={e => setDispatchModal(m => ({ ...m, shipRef: e.target.value }))} placeholder="Tracking number" className="w-full rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ border: `1px solid ${T.hairline}` }} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: T.textMuted }}>No. of Cartons</label>
          <input type="number" min="1" value={dispatchModal.cartons} onChange={e => setDispatchModal(m => ({ ...m, cartons: parseInt(e.target.value) || 1 }))} className="w-32 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ border: `1px solid ${T.hairline}` }} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: T.textMuted }}>Notes</label>
          <input value={dispatchModal.notes} onChange={e => setDispatchModal(m => ({ ...m, notes: e.target.value }))} placeholder="Optional notes" className="w-full rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ border: `1px solid ${T.hairline}` }} />
        </div>
        {dispatchModal.job?.status === 'FINISH' && (
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: T.text }}>
            <input type="checkbox" checked={dispatchModal.advanceStatus} onChange={e => setDispatchModal(m => ({ ...m, advanceStatus: e.target.checked }))} />
            Advance status to INVOICE after dispatch
          </label>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4" style={{ borderTop: `1px solid ${T.hairline}` }}>
        <button onClick={close} className="px-4 py-2 rounded text-sm" style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}>Cancel</button>
        <button onClick={submit} disabled={dispatchModal.loading} className="px-4 py-2 text-white rounded text-sm disabled:opacity-50 flex items-center gap-2" style={{ background: T.accentStrong }}>
          <Truck className="w-4 h-4" />{dispatchModal.loading ? 'Dispatching...' : 'Confirm Dispatch'}
        </button>
      </div>
    </DraggableModal>
  );
}

import { useQueryClient } from '@tanstack/react-query';
import { Printer, X } from 'lucide-react';
import * as api from '../../api';
import DraggableModal from '../../ui/DraggableModal';
import { T } from '../../ui/tokens';

  // Takes the monolith's updatePinnedJob, not setActiveJob. The job can be open
  // in the pinned tab strip as well as active, and setActiveJob only refreshes
  // one of the two — so the strip kept showing the pre-unprint status until a
  // refetch landed. updatePinnedJob writes both, and is what every other save
  // path in the app already uses.
export default function UnprintModal({ onJobUpdated, setUnprintModal, unprintModal }) {
  const queryClient = useQueryClient();
  if (!unprintModal.open) return null;
  const close = () => setUnprintModal(m => ({ ...m, open: false }));
  const confirm = async () => {
    setUnprintModal(m => ({ ...m, loading: true, error: '' }));
    try {
      const updated = await api.jobs.unprint(unprintModal.job.id);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      onJobUpdated(updated);
      close();
    } catch (e) { setUnprintModal(m => ({ ...m, loading: false, error: e.message })); }
  };
  return (
    <DraggableModal onClose={close} cardClass="w-[420px] p-6">
      <div className="flex items-center justify-between mb-4 cursor-move select-none">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: T.text }}><Printer className="w-5 h-5 text-accent-strong" />Unprint Job #{unprintModal.job?.id}</h3>
        <button onClick={close}><X className="w-5 h-5" style={{ color: T.textMuted }} /></button>
      </div>
      <p className="text-sm mb-2" style={{ color: T.text }}>This will revert the job from <span className="font-semibold text-accent-strong">{unprintModal.job?.status}</span> back to <span className="font-semibold" style={{ color: T.accentStrong }}>FINISH</span>.</p>
      <p className="text-xs mb-4" style={{ color: T.textMuted }}>An internal comment will be added recording this action. Use this to recall and re-issue an invoice.</p>
      {unprintModal.error && <p className="text-sm mb-3 px-3 py-2 rounded" style={{ color: T.danger, background: T.dangerTint }}>{unprintModal.error}</p>}
      <div className="flex justify-end gap-2 pt-4" style={{ borderTop: `1px solid ${T.hairline}` }}>
        <button onClick={close} className="px-4 py-2 rounded text-sm" style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}>Cancel</button>
        <button onClick={confirm} disabled={unprintModal.loading} className="px-4 py-2 text-white rounded text-sm disabled:opacity-50 flex items-center gap-2" style={{ background: T.accentStrong }}>
          <Printer className="w-4 h-4" />{unprintModal.loading ? 'Reverting...' : 'Confirm Unprint'}
        </button>
      </div>
    </DraggableModal>
  );
}

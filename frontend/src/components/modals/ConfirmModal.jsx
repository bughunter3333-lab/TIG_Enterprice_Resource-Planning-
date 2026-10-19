import { AlertCircle } from 'lucide-react';
import DraggableModal from '../../ui/DraggableModal';
import { T } from '../../ui/tokens';

export default function ConfirmModal({ confirmModal, setConfirmModal }) {
  if (!confirmModal.show) return null;
  return (
    <DraggableModal onClose={() => setConfirmModal({ show: false, message: '', onConfirm: null })} cardClass="max-w-sm w-full p-6">
        <div className="flex items-start space-x-3 mb-4">
          <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: T.danger }} />
          <p style={{ color: T.text }}>{confirmModal.message}</p>
        </div>
        <div className="flex justify-end space-x-2">
          <button
            onClick={() => setConfirmModal({ show: false, message: '', onConfirm: null })}
            className="px-4 py-2 rounded"
            style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}
          >
            Cancel
          </button>
          <button
            onClick={confirmModal.onConfirm}
            className="px-4 py-2 text-white rounded"
            style={{ background: T.danger }}
          >
            Delete
          </button>
        </div>
    </DraggableModal>
  );
}

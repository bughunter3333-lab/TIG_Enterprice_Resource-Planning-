import { useQueryClient } from '@tanstack/react-query';
import { CreditCard, RefreshCw, X } from 'lucide-react';
import DraggableModal from '../../ui/DraggableModal';
import { T } from '../../ui/tokens';
import { initiateTyroPurchase } from '../../lib/tyroClient';
import { notify } from '../../lib/notify';

export default function PaymentModal({ paymentModal, recordPayment, setPaymentModal }) {
  const queryClient = useQueryClient();
  if (!paymentModal.show) return null;
  const closeModal = () => setPaymentModal({ show: false, jobId: null, maxAmount: 0, amount: '', method: 'Credit Card', tyroStatus: null, tyroProcessing: false });
  const isTyro = paymentModal.method === 'Tyro EFTPOS';

  const handleConfirm = async () => {
    const amount = parseFloat(paymentModal.amount);
    if (!amount || amount <= 0) return;

    if (isTyro) {
      // Load Tyro settings from cache
      const companySettings = queryClient.getQueryData(['settings/company']);
      const merchantId = companySettings?.tyro_merchant_id;
      const terminalId = companySettings?.tyro_terminal_id;
      const environment = companySettings?.tyro_environment || 'sandbox';
      if (!merchantId || !terminalId) {
        setPaymentModal(m => ({
          ...m,
          tyroProcessing: false,
          tyroStatus: 'Tyro not configured: missing merchant or terminal ID',
        }));
        return;
      }
      setPaymentModal(m => ({ ...m, tyroProcessing: true, tyroStatus: 'Connecting to terminal…' }));
      try {
        await initiateTyroPurchase(amount, {
          merchantId: companySettings?.tyro_merchant_id,
          terminalId: companySettings?.tyro_terminal_id,
          environment,
        }, {
          onStatusUpdate: (msg) => setPaymentModal(m => ({ ...m, tyroStatus: msg })),
          onApproved: async () => {
            try {
              await recordPayment(paymentModal.jobId, amount, 'Tyro EFTPOS');
              closeModal();
            } catch (err) {
              console.error('Tyro payment approved but recordPayment failed', err);
              setPaymentModal(m => ({
                ...m,
                tyroProcessing: false,
                tyroStatus: 'Payment approved but could not record the transaction. Please retry or contact support.',
              }));
            }
          },
          onDeclined: () => setPaymentModal(m => ({ ...m, tyroProcessing: false, tyroStatus: 'Declined — payment was not approved by the bank.' })),
          onCancelled: () => setPaymentModal(m => ({ ...m, tyroProcessing: false, tyroStatus: 'Cancelled — transaction was cancelled at the terminal.' })),
          onFailed: (r) => setPaymentModal(m => ({ ...m, tyroProcessing: false, tyroStatus: `Failed — ${r?.statusText || 'unknown error'}. Please try again.` })),
        });
      } catch (err) {
        setPaymentModal(m => ({ ...m, tyroProcessing: false, tyroStatus: `Error: ${err.message}` }));
      }
    } else {
      try {
        await recordPayment(paymentModal.jobId, amount, paymentModal.method);
        closeModal();
      } catch (err) {
        // Stay open. Closing is what the operator reads as success, and the
        // status panel below is Tyro-only so it cannot carry this message.
        notify(`Could not record the payment: ${err.message}`, { type: 'error' });
      }
    }
  };

  return (
    <DraggableModal onClose={closeModal} cardClass="max-w-sm w-full p-6">
      <div className="flex items-center justify-between mb-4 cursor-move select-none">
        <h3 className="text-lg font-bold" style={{ color: T.text }}>Record Payment</h3>
        <button onClick={closeModal}><X className="w-5 h-5" style={{ color: T.textMuted }} /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: T.textMuted }}>Amount ($)</label>
          <input
            type="number" step="0.01" min="0.01" max={paymentModal.maxAmount}
            value={paymentModal.amount}
            onChange={(e) => setPaymentModal({ ...paymentModal, amount: e.target.value })}
            className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ border: `1px solid ${T.hairline}` }}
            autoFocus disabled={paymentModal.tyroProcessing}
          />
          <p className="text-xs mt-1" style={{ color: T.textMuted }}>Balance due: ${paymentModal.maxAmount.toFixed(2)}</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: T.textMuted }}>Payment Method</label>
          <select
            value={paymentModal.method}
            onChange={(e) => setPaymentModal({ ...paymentModal, method: e.target.value, tyroStatus: null })}
            className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ border: `1px solid ${T.hairline}` }}
            disabled={paymentModal.tyroProcessing}
          >
            <option>Tyro EFTPOS</option>
            <option>Credit Card</option>
            <option>Cash</option>
            <option>Bank Transfer</option>
            <option>Account</option>
          </select>
        </div>

        {/* Tyro status panel */}
        {isTyro && (() => {
          const isErr = paymentModal.tyroStatus?.startsWith('Declined') || paymentModal.tyroStatus?.startsWith('Failed') || paymentModal.tyroStatus?.startsWith('Error');
          const isCancelled = paymentModal.tyroStatus?.startsWith('Cancelled');
          return (
            <div className="rounded-lg px-4 py-3 text-sm"
              style={isErr
                ? { border: `1px solid ${T.danger}`, color: T.danger }
                : isCancelled
                ? { border: '1px solid #d97706', color: '#b45309' }
                : { border: `1px solid ${T.hairline}`, color: T.text }}>
              {paymentModal.tyroProcessing && (
                <div className="flex items-center gap-2 mb-1">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="font-medium">Processing…</span>
                </div>
              )}
              <p>{paymentModal.tyroStatus || 'Click "Charge via Tyro" to send to the EFTPOS terminal.'}</p>
            </div>
          );
        })()}
      </div>

      <div className="flex justify-end space-x-2 mt-4 pt-4" style={{ borderTop: `1px solid ${T.hairline}` }}>
        <button onClick={closeModal} className="px-4 py-2 rounded" style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }} disabled={paymentModal.tyroProcessing}>
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={paymentModal.tyroProcessing || !parseFloat(paymentModal.amount)}
          className="px-4 py-2 text-white rounded flex items-center gap-2 disabled:opacity-50"
          style={{ background: isTyro ? T.accentStrong : T.ok }}
        >
          <CreditCard className="w-4 h-4" />
          {isTyro ? 'Charge via Tyro' : 'Confirm Payment'}
        </button>
      </div>
    </DraggableModal>
  );
}

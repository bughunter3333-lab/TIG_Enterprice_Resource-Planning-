/**
 * Print a purchase order, or email it to its supplier (finding F17).
 *
 * "Sent" used to be a status somebody set while the order went to the supplier
 * from outside the system. Emailing it here attaches the PDF, logs the send,
 * and makes a Draft Sent.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, Printer } from 'lucide-react';
import { purchaseOrders } from '../../api';
import { useOffer } from '../../lib/useMyAccess';
import { notify } from '../../lib/notify';

const btn = 'flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-hairline bg-white hover:bg-panel-alt disabled:opacity-50';

export default function POSendActions({ po, onSent }) {
  const offer = useOffer();
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    try {
      const r = await purchaseOrders.email(po.id);
      notify(r.message, { type: 'success' });
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      onSent?.(r.status);
    } catch (e) {
      notify(e.message || 'The purchase order was not sent', { type: 'error' });
    } finally {
      setSending(false);
    }
  };
  return (
    <>
      <a href={purchaseOrders.pdfUrl(po.id)} target="_blank" rel="noopener noreferrer" className={btn}>
        <Printer className="w-3.5 h-3.5" />Print
      </a>
      {offer('POST', '/purchase-orders/{po_id}/email') && (
        <button onClick={send} disabled={sending} className={btn}>
          <Mail className="w-3.5 h-3.5" />{sending ? 'Sending…' : 'Email supplier'}
        </button>
      )}
    </>
  );
}

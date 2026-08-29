import { useState } from 'react';
import { Mail, Send, X } from 'lucide-react';
import DraggableModal from '../../ui/DraggableModal';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '../../api';

export default function EmailJobModal({ job, customers, onClose }) {
  const qc = useQueryClient();
  const isQuote = job.status === 'QUOTE';
  const cust = customers.find(c => c.id === job.customerId) || {};
  const [form, setForm] = useState({
    to_email: cust.email || '',
    cc: '',
    subject: isQuote
      ? `Quote #${job.id} – ${job.customer}`
      : `Invoice #${job.invoice || job.id} – ${job.customer}`,
    message: '',
    email_type: isQuote ? 'quote' : 'invoice',
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (!form.to_email.trim()) { setError('Recipient email is required'); return; }
    setSending(true);
    setError('');
    try {
      await api.email.send({ job_id: String(job.id), ...form });
      setSent(true);
      qc.invalidateQueries(['email-log']);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <DraggableModal onClose={onClose} cardClass="w-full max-w-lg">
      <div className="flex items-center justify-between px-5 py-3.5 border-b">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-accent-strong" />
          <span className="font-semibold text-fg">Email {isQuote ? 'Quote' : 'Invoice'}</span>
          <span className="text-xs text-faint font-mono">#{job.invoice || job.id}</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-hairline-soft rounded"><X className="w-4 h-4" /></button>
      </div>
      {sent ? (
        <div className="px-6 py-10 text-center">
          <div className="text-5xl mb-3 text-ok">✓</div>
          <p className="text-header font-medium">Email sent to {form.to_email}</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-accent-strong text-white rounded-lg text-sm hover:bg-accent-strong">Close</button>
        </div>
      ) : (
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">To *</label>
            <input type="email" value={form.to_email} onChange={e => setForm({ ...form, to_email: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-focus" placeholder="customer@example.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">CC</label>
            <input type="email" value={form.cc} onChange={e => setForm({ ...form, cc: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-focus" placeholder="optional" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Subject</label>
            <input type="text" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-focus" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Type</label>
            <select value={form.email_type} onChange={e => setForm({ ...form, email_type: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-focus">
              <option value="invoice">Invoice</option>
              <option value="quote">Quote</option>
              <option value="reminder">Payment Reminder</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Message (optional)</label>
            <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
              rows={4} placeholder="Add a personal note…"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-focus resize-none" />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-panel-alt">Cancel</button>
            <button onClick={send} disabled={sending}
              className="px-4 py-2 text-sm bg-accent-strong text-white rounded-lg hover:bg-accent-strong disabled:opacity-50 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" />{sending ? 'Sending…' : 'Send Email'}
            </button>
          </div>
        </div>
      )}
    </DraggableModal>
  );
}

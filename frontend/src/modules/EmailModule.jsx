import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, Send, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import * as api from '../api';

const EMAIL_TYPES = [
  { value: 'invoice', label: 'Tax Invoice' },
  { value: 'quote',   label: 'Quote' },
  { value: 'reminder', label: 'Payment Reminder' },
];

function StatusBadge({ status }) {
  if (status === 'sent') return (
    <span className="flex items-center gap-1 text-green-700"><CheckCircle className="w-3.5 h-3.5" />Sent</span>
  );
  return (
    <span className="flex items-center gap-1 text-red-600"><XCircle className="w-3.5 h-3.5" />Failed</span>
  );
}

export default function EmailModule({ jobs = [], customers = [] }) {
  const [form, setForm] = useState({
    job_id: '',
    to_email: '',
    cc: '',
    subject: '',
    message: '',
    email_type: 'invoice',
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [jobSearch, setJobSearch] = useState('');
  const [logJobFilter, setLogJobFilter] = useState('');

  const filteredJobs = jobs
    .filter(j => {
      const q = jobSearch.toLowerCase();
      return !q || j.id?.toLowerCase().includes(q) || j.customer?.toLowerCase().includes(q) || j.invoice?.toLowerCase().includes(q);
    })
    .slice(0, 15);

  const selectedJob = jobs.find(j => j.id === form.job_id);

  const { data: logData, refetch: refetchLog, isFetching: logFetching } = useQuery({
    queryKey: ['email/log'],
    queryFn: () => api.email.log({ limit: 100 }),
    staleTime: 15000,
  });
  const log = logData || [];

  // Warn if this job was already emailed today
  const today = new Date().toISOString().slice(0, 10);
  const alreadySentToday = form.job_id
    ? log.filter(e => e.job_id === form.job_id && e.status === 'sent' && e.sent_at?.startsWith(today))
    : [];

  function selectJob(job) {
    // Auto-populate To email from customer master if available
    const customer = customers.find(c => c.id === job.customerId || c.name === job.customer);
    const autoEmail = customer?.email || '';
    setForm(f => ({
      ...f,
      job_id: job.id,
      to_email: autoEmail,
    }));
    setJobSearch(`${job.id} — ${job.customer || ''}`);
    setResult(null);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!form.job_id || !form.to_email) return;
    setSending(true);
    setResult(null);
    try {
      const r = await api.email.send({
        job_id: form.job_id,
        to_email: form.to_email,
        cc: form.cc || undefined,
        subject: form.subject || undefined,
        message: form.message || undefined,
        email_type: form.email_type,
      });
      setResult({ ok: true, message: r.message });
      refetchLog();
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setSending(false);
    }
  }

  // Auto-generate subject preview
  const subjectPreview = form.job_id && selectedJob
    ? form.email_type === 'invoice'
      ? `Tax Invoice #${selectedJob.invoice || selectedJob.id} — ${selectedJob.customer || ''}`
      : form.email_type === 'quote'
      ? `Quote #${selectedJob.id} — ${selectedJob.customer || ''}`
      : `Payment Reminder — Job #${selectedJob.id}`
    : '';

  const filteredLog = logJobFilter
    ? log.filter(e => e.job_id?.toLowerCase().includes(logJobFilter.toLowerCase()) || e.to_email?.toLowerCase().includes(logJobFilter.toLowerCase()))
    : log;

  return (
    <div className="grid grid-cols-5 gap-6">
      {/* ── Compose Form ── */}
      <div className="col-span-2 space-y-4">
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />Send Invoice / Quote
          </h3>
          <form onSubmit={handleSend} className="space-y-3">
            {/* Job picker */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Job / Invoice *</label>
              <div className="relative">
                <input
                  type="text"
                  value={jobSearch}
                  onChange={e => { setJobSearch(e.target.value); setForm(f => ({ ...f, job_id: '' })); }}
                  placeholder="Type job# or customer name…"
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {jobSearch && !form.job_id && filteredJobs.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">
                    {filteredJobs.map(j => (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => selectJob(j)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between gap-2"
                      >
                        <span className="font-mono text-xs text-blue-700 shrink-0">{j.id}</span>
                        <span className="text-gray-700 truncate flex-1">{j.customer}</span>
                        <span className="text-gray-400 text-xs shrink-0">
                          {j.invoice ? `#${j.invoice}` : j.status} · ${parseFloat(j.total || 0).toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedJob && (
                <div className="mt-1 text-xs text-green-700 bg-green-50 rounded px-2 py-1.5 flex items-center justify-between">
                  <span>✓ {selectedJob.customer}</span>
                  <span className="font-medium">
                    {selectedJob.invoice ? `Invoice #${selectedJob.invoice}` : `Job #${selectedJob.id}`}
                    {' · '}${parseFloat(selectedJob.total || 0).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Already sent warning */}
            {alreadySentToday.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  This job was already emailed today ({alreadySentToday.length}×) to {alreadySentToday.map(e => e.to_email).join(', ')}.
                  Are you sure you want to send again?
                </span>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Email Type</label>
              <select value={form.email_type} onChange={e => setForm(f => ({ ...f, email_type: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {EMAIL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">To *</label>
              <input type="email" value={form.to_email} onChange={e => setForm(f => ({ ...f, to_email: e.target.value }))}
                required placeholder="customer@example.com"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              {selectedJob && !form.to_email && (
                <p className="text-xs text-amber-600 mt-0.5">No email on file for this customer — enter manually.</p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                CC <span className="font-normal text-gray-400">(comma-separate multiple)</span>
              </label>
              <input type="text" value={form.cc} onChange={e => setForm(f => ({ ...f, cc: e.target.value }))}
                placeholder="optional — e.g. accounts@co.com, mgr@co.com"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Subject</label>
              <input type="text" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder={subjectPreview || 'Auto-generated if blank'}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              {subjectPreview && !form.subject && (
                <p className="text-xs text-gray-400 mt-0.5">Will use: <em>{subjectPreview}</em></p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Message <span className="font-normal text-gray-400">(optional note above items)</span>
              </label>
              <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                rows={3} placeholder="e.g. Please find your tax invoice attached. Payment is due within 30 days."
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
            </div>

            {result && (
              <div className={`rounded-lg px-3 py-2 text-sm flex items-center gap-2 ${result.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {result.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                {result.message}
              </div>
            )}

            <button
              type="submit"
              disabled={sending || !form.job_id || !form.to_email}
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Queuing…' : 'Send Email'}
            </button>
          </form>
        </div>
      </div>

      {/* ── Email Log ── */}
      <div className="col-span-3">
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />Email History
              <span className="text-xs text-gray-400 font-normal">({log.length} most recent)</span>
            </h3>
            <button onClick={() => refetchLog()} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
              <RefreshCw className={`w-3 h-3 ${logFetching ? 'animate-spin' : ''}`} />Refresh
            </button>
          </div>
          {/* Log filter */}
          <input
            type="text"
            value={logJobFilter}
            onChange={e => setLogJobFilter(e.target.value)}
            placeholder="Filter by job# or recipient…"
            className="w-full border rounded px-3 py-1.5 text-xs mb-3 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {filteredLog.length === 0 ? (
            <div className="text-center text-gray-400 py-12 text-sm">
              {logJobFilter ? 'No emails match that filter.' : 'No emails sent yet.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {['Sent (AEST)','To','Subject','Job','Type','Status','By'].map(h => (
                      <th key={h} className="text-left pb-2 text-xs font-semibold text-gray-600 pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredLog.map(entry => (
                    <tr key={entry.id} className={`hover:bg-gray-50 ${entry.status === 'failed' ? 'bg-red-50' : ''}`}>
                      <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
                        {entry.sent_at
                          ? new Date(entry.sent_at).toLocaleString('en-AU', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
                          : '—'}
                      </td>
                      <td className="py-2 pr-3 text-xs truncate max-w-[140px]" title={entry.to_email}>{entry.to_email}</td>
                      <td className="py-2 pr-3 text-xs truncate max-w-[160px] text-gray-600" title={entry.subject}>{entry.subject}</td>
                      <td className="py-2 pr-3 text-xs font-mono text-blue-700">{entry.job_id}</td>
                      <td className="py-2 pr-3 text-xs capitalize">{entry.email_type === 'invoice' ? 'Invoice' : entry.email_type === 'quote' ? 'Quote' : 'Reminder'}</td>
                      <td className="py-2 pr-3 text-xs">
                        <StatusBadge status={entry.status} />
                        {entry.status === 'failed' && entry.error && (
                          <p className="text-red-500 text-[10px] mt-0.5 max-w-[120px] truncate" title={entry.error}>{entry.error}</p>
                        )}
                      </td>
                      <td className="py-2 text-xs text-gray-500">{entry.sent_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

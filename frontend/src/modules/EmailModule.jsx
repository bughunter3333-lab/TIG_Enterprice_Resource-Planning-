import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, Send, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import * as api from '../api';
import { notify } from '../lib/notify';
import { T } from '../ui/tokens';

const EMAIL_TYPES = [
  { value: 'invoice', label: 'Tax Invoice' },
  { value: 'quote',   label: 'Quote' },
  { value: 'reminder', label: 'Payment Reminder' },
];

function StatusBadge({ status }) {
  if (status === 'sent') return (
    <span className="flex items-center gap-1" style={{ color: T.ok }}><CheckCircle className="w-3.5 h-3.5" />Sent</span>
  );
  return (
    <span className="flex items-center gap-1" style={{ color: T.danger }}><XCircle className="w-3.5 h-3.5" />Failed</span>
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
    onError: (e) => { const m = e?.message || String(e); console.error('email.log fetch error', e); notify(m, { type: 'error' }); },
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
        <div className="rounded-lg p-5" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: T.text }}>
            <Mail className="w-4 h-4" style={{ color: T.accentStrong }} />Send Invoice / Quote
          </h3>
          <form onSubmit={handleSend} className="space-y-3">
            {/* Job picker */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: T.textMuted }}>Job / Invoice *</label>
              <div className="relative">
                <input
                  type="text"
                  value={jobSearch}
                  onChange={e => { setJobSearch(e.target.value); setForm(f => ({ ...f, job_id: '' })); }}
                  placeholder="Type job# or customer name…"
                  className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                  style={{ border: `1px solid ${T.hairline}` }}
                />
                {jobSearch && !form.job_id && filteredJobs.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
                    {filteredJobs.map(j => (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => selectJob(j)}
                        className="w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-panel-alt"
                      >
                        <span className="font-mono text-xs shrink-0" style={{ color: T.accentStrong }}>{j.id}</span>
                        <span className="truncate flex-1" style={{ color: T.text }}>{j.customer}</span>
                        <span className="text-xs shrink-0" style={{ color: T.textFaint }}>
                          {j.invoice ? `#${j.invoice}` : j.status} · ${parseFloat(j.total || 0).toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedJob && (
                <div className="mt-1 text-xs rounded px-2 py-1.5 flex items-center justify-between" style={{ color: T.ok, background: T.okTint }}>
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
              <div className="bg-accent-tint border border-accent rounded-lg px-3 py-2 text-xs text-accent-strong flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  This job was already emailed today ({alreadySentToday.length}×) to {alreadySentToday.map(e => e.to_email).join(', ')}.
                  Are you sure you want to send again?
                </span>
              </div>
            )}

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: T.textMuted }}>Email Type</label>
              <select value={form.email_type} onChange={e => setForm(f => ({ ...f, email_type: e.target.value }))}
                className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                style={{ border: `1px solid ${T.hairline}`, color: T.text }}>
                {EMAIL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: T.textMuted }}>To *</label>
              <input type="email" value={form.to_email} onChange={e => setForm(f => ({ ...f, to_email: e.target.value }))}
                required placeholder="customer@example.com"
                className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                style={{ border: `1px solid ${T.hairline}` }} />
              {selectedJob && !form.to_email && (
                <p className="text-xs mt-0.5" style={{ color: '#d97706' }}>No email on file for this customer — enter manually.</p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: T.textMuted }}>
                CC <span className="font-normal" style={{ color: T.textFaint }}>(comma-separate multiple)</span>
              </label>
              <input type="text" value={form.cc} onChange={e => setForm(f => ({ ...f, cc: e.target.value }))}
                placeholder="optional — e.g. accounts@co.com, mgr@co.com"
                className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                style={{ border: `1px solid ${T.hairline}` }} />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: T.textMuted }}>Subject</label>
              <input type="text" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder={subjectPreview || 'Auto-generated if blank'}
                className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                style={{ border: `1px solid ${T.hairline}` }} />
              {subjectPreview && !form.subject && (
                <p className="text-xs mt-0.5" style={{ color: T.textFaint }}>Will use: <em>{subjectPreview}</em></p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: T.textMuted }}>
                Message <span className="font-normal" style={{ color: T.textFaint }}>(optional note above items)</span>
              </label>
              <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                rows={3} placeholder="e.g. Please find your tax invoice attached. Payment is due within 30 days."
                className="w-full rounded px-3 py-2 text-sm focus:outline-none resize-none"
                style={{ border: `1px solid ${T.hairline}` }} />
            </div>

            {result && (
              <div className="rounded-lg px-3 py-2 text-sm flex items-center gap-2" style={result.ok ? { background: T.okTint, color: T.ok, border: `1px solid ${T.ok}33` } : { background: T.dangerTint, color: T.danger, border: `1px solid ${T.danger}33` }}>
                {result.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                {result.message}
              </div>
            )}

            <button
              type="submit"
              disabled={sending || !form.job_id || !form.to_email}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: T.accentStrong, color: '#ffffff' }}
            >
              {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Queuing…' : 'Send Email'}
            </button>
          </form>
        </div>
      </div>

      {/* ── Email Log ── */}
      <div className="col-span-3">
        <div className="rounded-lg p-5" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2" style={{ color: T.text }}>
              <Clock className="w-4 h-4" style={{ color: T.textMuted }} />Email History
              <span className="text-xs font-normal" style={{ color: T.textFaint }}>({log.length} most recent)</span>
            </h3>
            <button onClick={() => refetchLog()} className="text-xs flex items-center gap-1" style={{ color: T.accentStrong }}>
              <RefreshCw className={`w-3 h-3 ${logFetching ? 'animate-spin' : ''}`} />Refresh
            </button>
          </div>
          {/* Log filter */}
          <input
            type="text"
            value={logJobFilter}
            onChange={e => setLogJobFilter(e.target.value)}
            placeholder="Filter by job# or recipient…"
            className="w-full rounded px-3 py-1.5 text-xs mb-3 focus:outline-none"
            style={{ border: `1px solid ${T.hairline}` }}
          />
          {filteredLog.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color: T.textFaint }}>
              {logJobFilter ? 'No emails match that filter.' : 'No emails sent yet.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.hairline}` }}>
                    {['Sent (AEST)','To','Subject','Job','Type','Status','By'].map(h => (
                      <th key={h} className="text-left pb-2 text-xs font-semibold pr-3" style={{ color: T.textMuted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLog.map(entry => (
                    <tr key={entry.id} className="hover:bg-panel-alt" style={entry.status === 'failed' ? { background: T.dangerTint } : {}}>
                      <td className="py-2 pr-3 text-xs whitespace-nowrap" style={{ color: T.textMuted }}>
                        {entry.sent_at
                          ? new Date(entry.sent_at).toLocaleString('en-AU', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
                          : '—'}
                      </td>
                      <td className="py-2 pr-3 text-xs truncate max-w-[140px]" title={entry.to_email} style={{ color: T.text }}>{entry.to_email}</td>
                      <td className="py-2 pr-3 text-xs truncate max-w-[160px]" title={entry.subject} style={{ color: T.textMuted }}>{entry.subject}</td>
                      <td className="py-2 pr-3 text-xs font-mono" style={{ color: T.accentStrong }}>{entry.job_id}</td>
                      <td className="py-2 pr-3 text-xs capitalize" style={{ color: T.text }}>{entry.email_type === 'invoice' ? 'Invoice' : entry.email_type === 'quote' ? 'Quote' : 'Reminder'}</td>
                      <td className="py-2 pr-3 text-xs">
                        <StatusBadge status={entry.status} />
                        {entry.status === 'failed' && entry.error && (
                          <p className="text-[10px] mt-0.5 max-w-[120px] truncate" title={entry.error} style={{ color: T.danger }}>{entry.error}</p>
                        )}
                      </td>
                      <td className="py-2 text-xs" style={{ color: T.textMuted }}>{entry.sent_by}</td>
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

/**
 * One remittance, paying several invoices (finding F35).
 *
 * Portal clients pay many small per-employee invoices in one EFT. Recording it
 * meant a payment per job, the reference retyped each time. Here it is entered
 * once; the server pays the customer's oldest invoices first and says which.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { customers } from '../../api';
import { notify } from '../../lib/notify';
import { todayKey } from '../../lib/dates';

/** What is wrong with the remittance, by field; empty when it can be sent. */
export function remittanceProblems(form, owed) {
  const problems = {};
  const amount = Number(form.amount);
  if (!(amount > 0)) problems.amount = 'Enter the amount received.';
  else if (owed != null && amount > owed + 0.005) problems.amount = `They owe $${owed.toFixed(2)} on their invoices.`;
  if (!form.reference.trim()) problems.reference = 'The bank reference, so the payment can be found again.';
  return problems;
}

const inp = 'w-full rounded border px-2 py-1 text-sm';

export default function RemittanceForm({ customerId, owed }) {
  const [form, setForm] = useState({ amount: '', reference: '', method: 'EFT', receivedDate: todayKey() });
  const [tried, setTried] = useState(false);
  const [result, setResult] = useState(null);
  const qc = useQueryClient();
  const problems = remittanceProblems(form, owed);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const send = useMutation({
    mutationFn: () => customers.recordRemittance(customerId, { ...form, amount: Number(form.amount) }),
    onSuccess: (r) => {
      setResult(r);
      setForm((f) => ({ ...f, amount: '', reference: '' }));
      setTried(false);
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['reports/aged-receivables'] });
      notify(`Remittance of $${r.amount.toFixed(2)} paid ${r.payments.length} invoice${r.payments.length === 1 ? '' : 's'}`, { type: 'success' });
    },
    onError: (e) => notify(e.message, { type: 'error' }),
  });
  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length === 0) send.mutate();
  };
  const field = (key, label, input) => (
    <label className="block text-xs text-muted">
      {label}
      {input}
      {tried && problems[key] && <span role="alert" className="block text-danger">{problems[key]}</span>}
    </label>
  );
  return (
    <div className="mt-5 border-t pt-4">
      <h4 className="font-semibold text-header text-sm mb-2">Record a remittance</h4>
      <form onSubmit={submit} className="grid grid-cols-4 gap-2 items-end" aria-label="Remittance">
        {field('amount', 'Amount received', <input className={inp} inputMode="decimal" value={form.amount} onChange={set('amount')} />)}
        {field('reference', 'Reference', <input className={inp} value={form.reference} onChange={set('reference')} maxLength={100} />)}
        {field('receivedDate', 'Received', <input className={inp} type="date" value={form.receivedDate} onChange={set('receivedDate')} />)}
        <button type="submit" disabled={send.isPending} className="text-xs px-3 py-2 rounded bg-accent-strong text-white disabled:opacity-50">
          {send.isPending ? 'Recording…' : 'Pay oldest invoices first'}
        </button>
      </form>
      {result && (
        <ul className="mt-3 text-xs text-muted" aria-label="Paid">
          {result.payments.map((p) => (
            <li key={p.payment_id}>#{p.job_id} — ${p.amount.toFixed(2)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

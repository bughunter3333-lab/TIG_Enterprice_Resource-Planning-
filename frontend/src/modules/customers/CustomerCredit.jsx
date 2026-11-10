import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import { creditNotes as creditNotesApi, reports as reportsApi } from '../../api';
import { notify } from '../../lib/notify';
import { useOffer } from '../../lib/useMyAccess';
import { formatDay } from '../../lib/dates';
import { money } from '../jobs/record/recordFormat';
import { creditLeft } from '../credit-notes/creditNotes';

const control = {
  height: 30, fontFamily: T.font, fontSize: T.fsGrid, border: `1px solid ${T.fieldBorder}`,
  borderRadius: T.radiusField, padding: '0 8px', background: T.panel, color: T.text,
};

/** The customer's statement, shared by the Statement tab and this panel. */
export const statementQuery = (customerId) => ({
  queryKey: ['customer-statement', customerId],
  queryFn: () => reportsApi.customerStatement(customerId),
});

/** Their invoices that still owe, from the statement (every invoice, not the newest 500 jobs). */
export const openInvoices = (statement) =>
  (statement?.lines || [])
    .filter((l) => l.status === 'INVOICE' && Number(l.balance) > 0)
    .map((l) => ({ id: l.job_id, invoiceNo: l.invoice_no, balanceDue: Number(l.balance) }));

/** One credit note with credit left, and where to use it. */
function NoteRow({ note, invoices, mayApply, onApply, busy }) {
  const left = creditLeft(note);
  const [chosen, setChosen] = useState('');
  const [amount, setAmount] = useState('');
  // Worked out from the list as it is now: an invoice paid off since drops out.
  const jobId = invoices.some((j) => j.id === chosen) ? chosen : invoices[0]?.id ?? '';
  const owed = invoices.find((j) => j.id === jobId)?.balanceDue || 0;
  const most = Math.min(left, owed);
  const value = amount === '' ? most : Number(amount);
  const fits = value > 0 && value <= most + 0.004;
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderTop: `1px solid ${T.hairlineSoft}` }}>
      <a href={creditNotesApi.pdfUrl(note.id)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: T.fontMono, fontWeight: 600, color: T.accentStrong }}>{note.id}</a>
      <span style={{ fontSize: T.fsSmall, color: T.textMuted }}>{formatDay(note.credit_date)} · job {note.job_id}</span>
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(left)} left</span>
      {mayApply && invoices.length > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <select aria-label={`Apply ${note.id} to invoice`} value={jobId} onChange={(e) => { setChosen(e.target.value); setAmount(''); }} style={control}>
            {invoices.map((j) => <option key={j.id} value={j.id}>{j.invoiceNo || j.id} — owes {money(j.balanceDue)}</option>)}
          </select>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={most}
            aria-label={`Amount of ${note.id} to apply`}
            value={amount === '' ? most.toFixed(2) : amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ ...control, width: 96, textAlign: 'right' }}
          />
          <Button size="sm" disabled={!fits || busy} onClick={() => onApply(note, jobId, Math.round(value * 100) / 100)}>Apply</Button>
        </span>
      )}
    </li>
  );
}

/**
 * The customer's credit on account: credit notes not yet used on an invoice,
 * applied to one of their open invoices here (managers and admins).
 * docs/superpowers/specs/2026-11-09-returns-credit-notes.md
 */
export default function CustomerCredit({ customer }) {
  const offer = useOffer();
  const queryClient = useQueryClient();
  const shown = offer('GET', '/credit-notes');
  const mayApply = offer('POST', '/credit-notes/{note_id}/apply');
  const { data: notes = [] } = useQuery({
    queryKey: ['credit-notes', 'customer', customer.id],
    queryFn: () => creditNotesApi.list({ customerId: customer.id, withCredit: true }),
    enabled: !!shown,
  });
  const { data: statement } = useQuery({
    ...statementQuery(customer.id),
    enabled: !!shown && !!mayApply && notes.length > 0,
  });
  const applying = useMutation({
    mutationFn: ({ note, jobId, amount }) => creditNotesApi.apply(note.id, jobId, amount),
    onSuccess: (_, { note, jobId, amount }) => {
      for (const key of [['credit-notes'], ['jobs'], ['customers'], ['customer-statement']]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      notify(`${money(amount)} of ${note.id} applied to job ${jobId}.`, { type: 'success' });
    },
    onError: (e) => notify(e.message, { type: 'error' }),
  });
  if (!shown || !notes.length) return null;
  const invoices = openInvoices(statement);
  const total = notes.reduce((sum, n) => sum + creditLeft(n), 0);
  return (
    <section aria-label="Credit on account" style={{ border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: '10px 12px', background: T.panel }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: T.fsBase, fontWeight: 600 }}>Credit on account</h3>
        <span style={{ fontWeight: 600, color: T.ok, fontVariantNumeric: 'tabular-nums' }}>{money(total)}</span>
        {mayApply && statement && !invoices.length && <span style={{ fontSize: T.fsSmall, color: T.textMuted }}>No open invoice to apply it to.</span>}
      </div>
      <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
        {notes.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            invoices={invoices}
            mayApply={mayApply}
            busy={applying.isPending}
            onApply={(n, jobId, amount) => applying.mutate({ note: n, jobId, amount })}
          />
        ))}
      </ul>
    </section>
  );
}

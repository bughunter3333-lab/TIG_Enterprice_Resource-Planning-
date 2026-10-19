import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accounting } from '../../api';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import { money, todayIso } from './accountingFormat';

/**
 * A journal a person writes: rent, wages, bank fees, depreciation.
 *
 * Post stays disabled until the entry balances, and the difference is shown in
 * the footer as it is typed, so the problem is visible before it is submitted
 * rather than coming back as an error. The server checks all of it again —
 * this is for the person, not instead of the ledger.
 */

const blankLine = () => ({ key: Math.random().toString(36).slice(2), accountId: '', description: '', debit: '', credit: '' });

const cents = (v) => Math.round((Number(v) || 0) * 100);

export function journalProblems(lines) {
  const used = lines.filter((l) => l.accountId || l.debit || l.credit);
  const problems = [];
  used.forEach((l, i) => {
    if (!l.accountId) problems.push(`Line ${i + 1} has no account`);
    if (cents(l.debit) && cents(l.credit)) problems.push(`Line ${i + 1} has both a debit and a credit`);
    if (cents(l.debit) < 0 || cents(l.credit) < 0) problems.push(`Line ${i + 1} is negative`);
    if (l.accountId && !cents(l.debit) && !cents(l.credit)) problems.push(`Line ${i + 1} has no amount`);
  });
  if (used.length < 2) problems.push('A journal needs at least two lines');
  const debits = used.reduce((s, l) => s + cents(l.debit), 0);
  const credits = used.reduce((s, l) => s + cents(l.credit), 0);
  if (debits !== credits) problems.push(`Out by ${money(Math.abs(debits - credits) / 100)}`);
  return { problems, debits: debits / 100, credits: credits / 100, used };
}

const input = {
  height: 24, width: '100%', fontSize: T.fsGrid, padding: '0 6px', color: T.text,
  border: `1px solid ${T.hairline}`, borderRadius: T.radius - 1, background: T.panel, outline: 'none',
};

export default function NewJournalModal({ onClose }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState([blankLine(), blankLine()]);

  const { data: accounts = [] } = useQuery({
    queryKey: ['ledger-accounts'],
    queryFn: () => accounting.accounts(),
  });
  const active = accounts.filter((a) => a.is_active);

  const { problems, debits, credits, used } = journalProblems(lines);
  const ready = problems.length === 0 && memo.trim() !== '' && debits > 0;

  const post = useMutation({
    mutationFn: () => accounting.postJournal({
      entry_date: date,
      memo: memo.trim(),
      lines: used.map((l) => ({
        account_id: Number(l.accountId),
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description || null,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ledger-journals'] });
      qc.invalidateQueries({ queryKey: ['ledger-accounts'] });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('ledger-') });
      onClose();
    },
  });

  const setLine = (key, field) => (e) => {
    const { value } = e.target;
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  };

  return (
    <Modal
      title="New journal"
      onClose={onClose}
      width={760}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => post.mutate()} disabled={!ready || post.isPending}>
            {post.isPending ? 'Posting…' : 'Post journal'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, marginBottom: 12 }}>
        <label style={{ fontSize: T.fsSmall, color: T.headerText, fontWeight: 600 }}>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...input, marginTop: 3 }} />
        </label>
        <label style={{ fontSize: T.fsSmall, color: T.headerText, fontWeight: 600 }}>
          Memo
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="September rent" style={{ ...input, marginTop: 3 }} />
        </label>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.fsGrid }}>
        <thead>
          <tr style={{ fontSize: 11, color: T.headerText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <th style={{ textAlign: 'left', padding: '2px 4px', width: '34%' }}>Account</th>
            <th style={{ textAlign: 'left', padding: '2px 4px' }}>Description</th>
            <th style={{ textAlign: 'right', padding: '2px 4px', width: 110 }}>Debit</th>
            <th style={{ textAlign: 'right', padding: '2px 4px', width: 110 }}>Credit</th>
            <th style={{ width: 28 }} />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.key}>
              <td style={{ padding: 3 }}>
                <select aria-label={`Line ${i + 1} account`} value={l.accountId} onChange={setLine(l.key, 'accountId')} style={input}>
                  <option value="">— Account —</option>
                  {active.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                </select>
              </td>
              <td style={{ padding: 3 }}>
                <input aria-label={`Line ${i + 1} description`} value={l.description} onChange={setLine(l.key, 'description')} style={input} />
              </td>
              <td style={{ padding: 3 }}>
                <input aria-label={`Line ${i + 1} debit`} type="number" min="0" step="0.01" value={l.debit} onChange={setLine(l.key, 'debit')} style={{ ...input, textAlign: 'right' }} />
              </td>
              <td style={{ padding: 3 }}>
                <input aria-label={`Line ${i + 1} credit`} type="number" min="0" step="0.01" value={l.credit} onChange={setLine(l.key, 'credit')} style={{ ...input, textAlign: 'right' }} />
              </td>
              <td style={{ padding: 3, textAlign: 'center' }}>
                {lines.length > 2 && (
                  <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    style={{ border: 'none', background: 'none', color: T.textFaint, cursor: 'pointer', fontSize: 14 }}>×</button>
                )}
              </td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td style={{ padding: '6px 4px' }}>
              <Button size="sm" variant="ghost" onClick={() => setLines((ls) => [...ls, blankLine()])}>Add line</Button>
            </td>
            <td style={{ padding: '6px 4px', textAlign: 'right', color: T.textMuted }}>Totals</td>
            <td style={{ padding: '6px 7px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${T.text}` }}>{money(debits)}</td>
            <td style={{ padding: '6px 7px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${T.text}` }}>{money(credits)}</td>
            <td />
          </tr>
        </tbody>
      </table>

      <div role="status" style={{ marginTop: 8, fontSize: T.fsSmall, color: problems.length ? T.danger : T.ok }}>
        {problems.length ? problems[0] : 'Balanced'}
      </div>
      {post.error && (
        <div role="alert" style={{ marginTop: 6, fontSize: T.fsSmall, color: T.danger }}>
          {post.error.message || 'Could not post the journal'}
        </div>
      )}
    </Modal>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accounting } from '../../api';
import DataGrid from '../../ui/DataGrid';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import NewJournalModal from './NewJournalModal';
import { money, moneyOrBlank, SOURCE_LABELS, CAN_WRITE_LEDGER } from './accountingFormat';

/**
 * Every entry in the ledger, newest first.
 *
 * An automatic entry names the document that posted it, and cannot be reversed
 * from here — it is corrected by changing that document, and the ledger
 * follows. A manual journal is reversed here, by an admin, and the reversal is
 * a new entry dated today: nothing already posted is edited.
 */

const FILTERS = [
  { value: '', label: 'All entries' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'payment', label: 'Payments' },
  { value: 'bill', label: 'Bills' },
  { value: 'bill_payment', label: 'Bill payments' },
  { value: 'manual', label: 'Journals' },
];

function state(entry) {
  if (entry.reverses_id) return { text: 'Reversal', color: T.textMuted };
  if (entry.reversed_by_id) return { text: 'Reversed', color: T.danger };
  return { text: 'Posted', color: T.ok };
}

const COLUMNS = [
  { key: 'number', label: 'Entry', width: 92, render: (e) => <span style={{ fontFamily: T.fontMono, fontWeight: 600 }}>{e.number}</span> },
  { key: 'date', label: 'Date', width: 90 },
  {
    key: 'source_type', label: 'Source', width: 150,
    render: (e) => (
      <span>
        {SOURCE_LABELS[e.source_type] ?? e.source_type}
        {e.source_id && <span style={{ fontFamily: T.fontMono, color: T.textMuted }}> {e.source_id}</span>}
      </span>
    ),
  },
  { key: 'memo', label: 'Memo' },
  { key: 'total', label: 'Amount', width: 110, align: 'right', render: (e) => money(e.total) },
  { key: 'state', label: 'Status', width: 80, render: (e) => { const s = state(e); return <span style={{ color: s.color, fontWeight: 600 }}>{s.text}</span>; } },
];

function EntryDetail({ entry, canWrite }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const reversible = canWrite && entry.source_type === 'manual' && !entry.reverses_id && !entry.reversed_by_id;
  const reverse = useMutation({
    mutationFn: () => accounting.reverseJournal(entry.id, reason),
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('ledger-') }),
  });
  const cell = { padding: '4px 8px', borderBottom: `1px solid ${T.hairlineSoft}` };

  return (
    <div style={{ marginTop: 10, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: 10, background: T.panel }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: T.fontMono, fontWeight: 700 }}>{entry.number}</span>
        <span style={{ color: T.textMuted }}>{entry.date} · posted by {entry.created_by}</span>
        <div style={{ flex: 1 }} />
        {entry.reversed_by_id && <span style={{ color: T.danger, fontSize: T.fsSmall }}>Reversed by entry {entry.reversed_by_id}</span>}
        {entry.reverses_id && <span style={{ color: T.textMuted, fontSize: T.fsSmall }}>Reverses entry {entry.reverses_id}</span>}
      </div>
      <div style={{ marginBottom: 8, color: T.text }}>{entry.memo}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.fsGrid }}>
        <thead>
          <tr style={{ fontSize: 11, color: T.headerText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <th style={{ ...cell, textAlign: 'left' }}>Account</th>
            <th style={{ ...cell, textAlign: 'left' }}>Description</th>
            <th style={{ ...cell, textAlign: 'right' }}>Debit</th>
            <th style={{ ...cell, textAlign: 'right' }}>Credit</th>
          </tr>
        </thead>
        <tbody>
          {entry.lines.map((ln) => (
            <tr key={ln.id}>
              <td style={cell}><span style={{ fontFamily: T.fontMono, color: T.textFaint, marginRight: 6 }}>{ln.account_code}</span>{ln.account_name}</td>
              <td style={{ ...cell, color: T.textMuted }}>{ln.description}{ln.job_id ? ` · job ${ln.job_id}` : ''}</td>
              <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{moneyOrBlank(ln.debit)}</td>
              <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{moneyOrBlank(ln.credit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {reversible && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <input
            aria-label="Reason for reversing" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            style={{ flex: 1, height: 24, fontSize: T.fsGrid, padding: '0 6px', border: `1px solid ${T.hairline}`, borderRadius: T.radius - 1 }}
          />
          <Button size="sm" variant="danger" onClick={() => reverse.mutate()} disabled={reverse.isPending}>
            {reverse.isPending ? 'Reversing…' : 'Reverse journal'}
          </Button>
        </div>
      )}
      {entry.source_type !== 'manual' && !entry.reverses_id && (
        <div style={{ marginTop: 8, fontSize: T.fsSmall, color: T.textFaint }}>
          Posted automatically by {(SOURCE_LABELS[entry.source_type] ?? entry.source_type).toLowerCase()} {entry.source_id}. To correct it, change that document — the ledger follows.
        </div>
      )}
      {reverse.error && <div role="alert" style={{ marginTop: 6, color: T.danger, fontSize: T.fsSmall }}>{reverse.error.message}</div>}
    </div>
  );
}

export default function JournalsTab({ currentUser }) {
  const canWrite = CAN_WRITE_LEDGER.includes(currentUser?.role);
  const [sourceType, setSourceType] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [composing, setComposing] = useState(false);

  const { data, error, refetch } = useQuery({
    queryKey: ['ledger-journals', sourceType],
    queryFn: () => accounting.journals({ source_type: sourceType, limit: 200 }),
  });
  const entries = data?.entries;
  const selected = entries?.find((e) => e.id === selectedId);

  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <select
          aria-label="Filter entries" value={sourceType} onChange={(e) => { setSourceType(e.target.value); setSelectedId(null); }}
          style={{ height: 24, fontSize: T.fsGrid, border: `1px solid ${T.hairline}`, borderRadius: T.radius - 1, background: T.panel, color: T.text }}
        >
          {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        {data && <span style={{ fontSize: T.fsSmall, color: T.textMuted }}>{data.total} entries</span>}
        <div style={{ flex: 1 }} />
        {canWrite && <Button size="sm" variant="primary" onClick={() => setComposing(true)}>New journal</Button>}
      </div>
      <DataGrid
        columns={COLUMNS}
        rows={error ? [] : entries}
        rowKey="id"
        onRowClick={(row) => setSelectedId(row.id)}
        error={error ? error.message || 'Could not load the ledger' : undefined}
        onRetry={refetch}
        emptyText="Nothing has been posted yet. Invoices, payments and bills post here automatically."
      />
      {selected && <EntryDetail entry={selected} canWrite={canWrite} />}
      {composing && <NewJournalModal onClose={() => setComposing(false)} />}
    </div>
  );
}

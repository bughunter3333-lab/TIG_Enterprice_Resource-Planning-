import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accounting } from '../../api';
import Button from '../../ui/Button';
import Modal from '../../ui/Modal';
import Field from '../../ui/Field';
import Select from '../../ui/Select';
import { T } from '../../ui/tokens';
import {
  money, moneyOrBlank, CATEGORY_LABELS, CATEGORY_ORDER, CAN_WRITE_LEDGER, financialYear, todayIso,
} from './accountingFormat';

/**
 * The chart of accounts, with each account's balance.
 *
 * Grouped by category in the order a balance sheet and P&L read. An account
 * marked "system" is one the ledger posts to automatically — receivables, GST,
 * sales and so on — and cannot be switched off. Selecting any account opens
 * its ledger: every line, with the balance running down the side.
 */

function AccountLedger({ account }) {
  const fy = financialYear();
  const { data, error } = useQuery({
    queryKey: ['ledger-gl', account.id, fy.from],
    queryFn: () => accounting.generalLedger(account.id, fy.from, todayIso()),
  });
  const cell = { padding: '4px 8px', borderBottom: `1px solid ${T.hairlineSoft}`, fontSize: T.fsGrid };
  if (error) return <div role="alert" style={{ color: T.danger }}>{error.message}</div>;
  if (!data) return <div style={{ color: T.textMuted }}>Loading…</div>;
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: T.fsSmall, color: T.textMuted }}>
        <span>{data.date_from} to {data.date_to}</span>
        <span>Opening <b style={{ color: T.text }}>{money(data.opening_balance)}</b></span>
        <span>Closing <b style={{ color: T.text }}>{money(data.closing_balance)}</b></span>
      </div>
      {data.lines.length === 0 ? (
        <div style={{ color: T.textFaint, fontStyle: 'italic' }}>No movement this financial year.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ fontSize: 11, color: T.headerText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <th style={{ ...cell, textAlign: 'left' }}>Date</th>
              <th style={{ ...cell, textAlign: 'left' }}>Entry</th>
              <th style={{ ...cell, textAlign: 'left' }}>Memo</th>
              <th style={{ ...cell, textAlign: 'right' }}>Debit</th>
              <th style={{ ...cell, textAlign: 'right' }}>Credit</th>
              <th style={{ ...cell, textAlign: 'right' }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((ln, i) => (
              <tr key={`${ln.entry_id}-${i}`}>
                <td style={cell}>{ln.date}</td>
                <td style={{ ...cell, fontFamily: T.fontMono }}>{ln.number}</td>
                <td style={{ ...cell, color: T.textMuted }}>{ln.memo}</td>
                <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{moneyOrBlank(ln.debit)}</td>
                <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{moneyOrBlank(ln.credit)}</td>
                <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(ln.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NewAccountModal({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ code: '', name: '', category: 'expense' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const create = useMutation({
    mutationFn: () => accounting.createAccount({ ...form, code: form.code.trim(), name: form.name.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ledger-accounts'] }); onClose(); },
  });
  const ready = form.code.trim() && form.name.trim();
  return (
    <Modal
      title="New account"
      onClose={onClose}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => create.mutate()} disabled={!ready || create.isPending}>
            {create.isPending ? 'Adding…' : 'Add account'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10 }}>
        <Field label="Code" value={form.code} onChange={set('code')} placeholder="6150" />
        <Field label="Name" value={form.name} onChange={set('name')} placeholder="Cleaning" />
      </div>
      <Select
        label="Category" value={form.category} onChange={set('category')} style={{ marginTop: 10 }}
        options={CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
      />
      <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 10 }}>
        The category decides which statement an account appears on, so it cannot be changed once the
        account is in use.
      </div>
      {create.error && <div role="alert" style={{ color: T.danger, marginTop: 8 }}>{create.error.message}</div>}
    </Modal>
  );
}

export default function ChartTab({ currentUser }) {
  const canWrite = CAN_WRITE_LEDGER.includes(currentUser?.role);
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const { data: accounts, error, refetch } = useQuery({
    queryKey: ['ledger-accounts'],
    queryFn: () => accounting.accounts(),
  });

  if (error) {
    return (
      <div role="alert" style={{ color: T.danger, padding: 12 }}>
        {error.message || 'Could not load the chart of accounts'}{' '}
        <button type="button" onClick={() => refetch()} style={{ textDecoration: 'underline', background: 'none', border: 'none', color: T.accentStrong, cursor: 'pointer' }}>Retry</button>
      </div>
    );
  }
  if (!accounts) return <div style={{ color: T.textMuted, padding: 12 }}>Loading…</div>;

  return (
    <div style={{ fontFamily: T.font, fontSize: T.fsGrid }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: T.fsSmall, color: T.textMuted }}>{accounts.length} accounts · balances as at today</span>
        <div style={{ flex: 1 }} />
        {canWrite && <Button size="sm" onClick={() => setAdding(true)}>New account</Button>}
      </div>

      {CATEGORY_ORDER.map((category) => {
        const rows = accounts.filter((a) => a.category === category);
        if (!rows.length) return null;
        return (
          <div key={category} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.headerText, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 3px', borderBottom: `1px solid ${T.hairline}` }}>
              {CATEGORY_LABELS[category]}
            </div>
            {rows.map((a) => (
              <div key={a.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(openId === a.id ? null : a.id)}
                  aria-expanded={openId === a.id}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'baseline', gap: 10, padding: '5px 4px',
                    background: openId === a.id ? T.accentTint : 'transparent', border: 'none',
                    borderBottom: `1px solid ${T.hairlineSoft}`, cursor: 'pointer', textAlign: 'left',
                    opacity: a.is_active ? 1 : 0.5, fontSize: T.fsGrid, color: T.text,
                  }}
                >
                  <span style={{ fontFamily: T.fontMono, color: T.textFaint, minWidth: 38 }}>{a.code}</span>
                  <span style={{ flex: 1 }}>{a.name}</span>
                  {a.role && <span style={{ fontSize: 10, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>system</span>}
                  {!a.is_active && <span style={{ fontSize: 10, color: T.textFaint }}>inactive</span>}
                  <span style={{ minWidth: 110, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: a.balance ? 600 : 400, color: a.balance ? T.text : T.textFaint }}>
                    {money(a.balance)}
                  </span>
                </button>
                {openId === a.id && (
                  <div style={{ padding: '10px 4px 14px 52px' }}>
                    <AccountLedger account={a} />
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
      {adding && <NewAccountModal onClose={() => setAdding(false)} />}
    </div>
  );
}

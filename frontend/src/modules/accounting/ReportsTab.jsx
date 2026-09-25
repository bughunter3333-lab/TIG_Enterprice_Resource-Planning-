import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { accounting } from '../../api';
import { T } from '../../ui/tokens';
import { money, financialYear, todayIso } from './accountingFormat';

/**
 * The financial statements, read from the ledger.
 *
 * Laid out as statements rather than grids: a heading per section, accounts
 * indented under it, a rule and a subtotal, and the figure that matters —
 * gross profit, net profit, whether the balance sheet balances — set apart
 * from the rows that make it up.
 */

const REPORTS = [
  { id: 'pl', label: 'Profit & Loss' },
  { id: 'bs', label: 'Balance Sheet' },
  { id: 'tb', label: 'Trial Balance' },
  { id: 'bas', label: 'BAS' },
];

const num = { fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' };

function Row({ label, amount, code, strong, rule, indent = 1, tone }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 10, padding: '3px 0',
      paddingLeft: indent * 14, borderTop: rule ? `1px solid ${T.text}` : undefined,
      marginTop: rule ? 4 : 0, fontWeight: strong ? 700 : 400,
    }}>
      {code && <span style={{ fontFamily: T.fontMono, fontSize: 10.5, color: T.textFaint, minWidth: 34 }}>{code}</span>}
      <span style={{ flex: 1, color: T.text }}>{label}</span>
      <span style={{ ...num, minWidth: 110, color: tone ?? T.text }}>{money(amount)}</span>
    </div>
  );
}

function Section({ title, rows, total, totalLabel }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.headerText, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
        {title}
      </div>
      {rows.length === 0 && (
        <div style={{ paddingLeft: 14, color: T.textFaint, fontStyle: 'italic', padding: '3px 0 3px 14px' }}>Nothing posted</div>
      )}
      {rows.map((r) => <Row key={r.account_id} code={r.code} label={r.name} amount={r.amount} />)}
      <Row label={totalLabel ?? `Total ${title.toLowerCase()}`} amount={total} strong rule indent={0} />
    </div>
  );
}

function Headline({ label, amount }) {
  const negative = Number(amount) < 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', padding: '8px 10px', margin: '4px 0 16px',
      background: negative ? T.dangerTint : T.accentTint, borderRadius: T.radius,
    }}>
      <span style={{ flex: 1, fontWeight: 700, color: T.text }}>{label}</span>
      <span style={{ ...num, fontSize: 16, fontWeight: 700, color: negative ? T.danger : T.accentStrong }}>{money(amount)}</span>
    </div>
  );
}

function Check({ ok, okText, badText }) {
  return (
    <div role="status" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600,
      padding: '3px 8px', borderRadius: T.radius,
      color: ok ? T.ok : T.danger, background: ok ? T.okTint : T.dangerTint,
    }}>
      {ok ? '✓' : '✕'} {ok ? okText : badText}
    </div>
  );
}

function ProfitLoss({ from, to }) {
  const { data, error } = useQuery({
    queryKey: ['ledger-pl', from, to],
    queryFn: () => accounting.profitLoss(from, to),
  });
  if (error) return <Failed error={error} />;
  if (!data) return <Loading />;
  return (
    <>
      <Section title="Income" rows={data.income} total={data.total_income} />
      <Section title="Cost of Sales" rows={data.cost_of_sales} total={data.total_cost_of_sales} />
      <Headline label="Gross Profit" amount={data.gross_profit} />
      <Section title="Expenses" rows={data.expenses} total={data.total_expenses} />
      <Headline label="Net Profit" amount={data.net_profit} />
    </>
  );
}

function BalanceSheet({ asAt }) {
  const { data, error } = useQuery({
    queryKey: ['ledger-bs', asAt],
    queryFn: () => accounting.balanceSheet(asAt),
  });
  if (error) return <Failed error={error} />;
  if (!data) return <Loading />;
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Check ok={data.balanced} okText="Assets equal liabilities plus equity" badText="Does not balance — the ledger has an error" />
      </div>
      <Section title="Assets" rows={data.assets} total={data.total_assets} />
      <Section title="Liabilities" rows={data.liabilities} total={data.total_liabilities} />
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.headerText, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Equity</div>
        {data.equity.map((r) => <Row key={r.account_id} code={r.code} label={r.name} amount={r.amount} />)}
        <Row label="Retained earnings (prior years)" amount={data.retained_earnings_prior_years} />
        <Row label={`Current year earnings (from ${data.financial_year_start})`} amount={data.current_year_earnings} />
        <Row label="Total equity" amount={data.total_equity} strong rule indent={0} />
      </div>
      <Headline label="Net Assets" amount={data.total_assets - data.total_liabilities} />
    </>
  );
}

function TrialBalance({ asAt }) {
  const { data, error } = useQuery({
    queryKey: ['ledger-tb', asAt],
    queryFn: () => accounting.trialBalance(asAt),
  });
  if (error) return <Failed error={error} />;
  if (!data) return <Loading />;
  const cell = { padding: '4px 8px', borderBottom: `1px solid ${T.hairlineSoft}` };
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Check ok={data.balanced} okText="Debits equal credits" badText="Debits and credits differ" />
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.fsGrid }}>
        <thead>
          <tr style={{ color: T.headerText, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <th style={{ ...cell, textAlign: 'left' }}>Account</th>
            <th style={{ ...cell, ...num }}>Debit</th>
            <th style={{ ...cell, ...num }}>Credit</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.account_id}>
              <td style={cell}><span style={{ fontFamily: T.fontMono, color: T.textFaint, marginRight: 8 }}>{r.code}</span>{r.name}</td>
              <td style={{ ...cell, ...num }}>{r.debit ? money(r.debit) : ''}</td>
              <td style={{ ...cell, ...num }}>{r.credit ? money(r.credit) : ''}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td style={{ ...cell, borderTop: `1px solid ${T.text}` }}>Total</td>
            <td style={{ ...cell, ...num, borderTop: `1px solid ${T.text}` }}>{money(data.total_debit)}</td>
            <td style={{ ...cell, ...num, borderTop: `1px solid ${T.text}` }}>{money(data.total_credit)}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function Bas({ from, to }) {
  const { data, error } = useQuery({
    queryKey: ['ledger-bas', from, to],
    queryFn: () => accounting.bas(from, to),
  });
  if (error) return <Failed error={error} />;
  if (!data) return <Loading />;
  const payable = data.net_gst >= 0;
  return (
    <>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>
        Accrual basis — invoices by invoice date, bills by bill date. Read off the GST accounts, so it
        agrees with the ledger by construction.
      </div>
      <Row code="G1" label="Total sales (including GST)" amount={data.G1} indent={0} />
      <Row code="G11" label="Non-capital purchases (including GST)" amount={data.G11} indent={0} />
      <Row code="1A" label="GST on sales" amount={data['1A']} indent={0} />
      <Row code="1B" label="GST on purchases" amount={data['1B']} indent={0} />
      <Headline label={payable ? 'GST payable to the ATO' : 'GST refund due from the ATO'} amount={Math.abs(data.net_gst)} />
    </>
  );
}

function Loading() {
  return <div style={{ color: T.textMuted, padding: 12 }}>Loading…</div>;
}

function Failed({ error }) {
  return <div role="alert" style={{ color: T.danger, padding: 12 }}>{error.message || 'Could not load this report'}</div>;
}

function DateInput({ label, value, onChange }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: T.fsSmall, color: T.textMuted }}>
      {label}
      <input
        type="date" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ height: 24, fontSize: T.fsGrid, padding: '0 6px', border: `1px solid ${T.hairline}`, borderRadius: T.radius - 1, color: T.text, background: T.panel }}
      />
    </label>
  );
}

export default function ReportsTab() {
  const fy = financialYear();
  const [report, setReport] = useState('pl');
  const [from, setFrom] = useState(fy.from);
  const [to, setTo] = useState(todayIso() < fy.to ? todayIso() : fy.to);
  const [asAt, setAsAt] = useState(todayIso());
  const isRange = report === 'pl' || report === 'bas';

  return (
    <div style={{ fontFamily: T.font, fontSize: T.fsGrid }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div role="tablist" aria-label="Report" style={{ display: 'inline-flex', border: `1px solid ${T.hairline}`, borderRadius: T.radius, overflow: 'hidden' }}>
          {REPORTS.map((r) => (
            <button
              key={r.id} type="button" role="tab" aria-selected={report === r.id}
              onClick={() => setReport(r.id)}
              style={{
                padding: '4px 12px', fontSize: T.fsGrid, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: report === r.id ? T.accentStrong : T.panel,
                color: report === r.id ? '#fff' : T.textMuted,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        {isRange ? (
          <>
            <DateInput label="From" value={from} onChange={setFrom} />
            <DateInput label="To" value={to} onChange={setTo} />
          </>
        ) : (
          <DateInput label="As at" value={asAt} onChange={setAsAt} />
        )}
      </div>
      <div style={{ maxWidth: 640 }}>
        {report === 'pl' && <ProfitLoss from={from} to={to} />}
        {report === 'bs' && <BalanceSheet asAt={asAt} />}
        {report === 'tb' && <TrialBalance asAt={asAt} />}
        {report === 'bas' && <Bas from={from} to={to} />}
      </div>
    </div>
  );
}

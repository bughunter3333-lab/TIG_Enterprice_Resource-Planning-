import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accounting } from '../../api';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import { money, CAN_WRITE_LEDGER } from './accountingFormat';

/**
 * Whether the ledger can be trusted, and the controls that keep it that way.
 *
 * The agreement check is the ledger's proof of itself: receivables must equal
 * what the jobs say customers owe, payables what the bills say the business
 * owes. Anything that does not agree is listed by document, because a total
 * that is out by some amount is not something a person can act on.
 */

function Agreement({ label, row }) {
  const ok = row.difference === 0;
  const cell = { padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  return (
    <tr>
      <td style={{ padding: '4px 8px' }}>{label}</td>
      <td style={cell}>{money(row.ledger)}</td>
      <td style={cell}>{money(row.documents)}</td>
      <td style={{ ...cell, fontWeight: 700, color: ok ? T.ok : T.danger }}>{ok ? '—' : money(row.difference)}</td>
    </tr>
  );
}

function Issue({ title, why, rows, render }) {
  if (!rows?.length) return null;
  return (
    <div style={{ marginTop: 12, borderLeft: `3px solid ${T.warn}`, padding: '6px 10px', background: T.warnTint, borderRadius: T.radius }}>
      <div style={{ fontWeight: 700, color: T.text }}>{title} <span style={{ color: T.textMuted, fontWeight: 400 }}>({rows.length})</span></div>
      <div style={{ fontSize: T.fsSmall, color: T.textMuted, margin: '2px 0 6px' }}>{why}</div>
      {rows.slice(0, 20).map((r) => (
        <div key={r.job_id} style={{ fontSize: T.fsGrid, padding: '1px 0' }}>{render(r)}</div>
      ))}
      {rows.length > 20 && <div style={{ fontSize: T.fsSmall, color: T.textFaint }}>…and {rows.length - 20} more</div>}
    </div>
  );
}

function Health() {
  const { data, error } = useQuery({ queryKey: ['ledger-health'], queryFn: accounting.health });
  if (error) return <div role="alert" style={{ color: T.danger }}>{error.message}</div>;
  if (!data) return <div style={{ color: T.textMuted }}>Checking…</div>;
  const head = { padding: '4px 8px', fontSize: 11, color: T.headerText, textTransform: 'uppercase', letterSpacing: '0.04em' };
  const job = (r) => <><span style={{ fontFamily: T.fontMono }}>{r.job_id}</span> {r.customer ? `· ${r.customer}` : ''}</>;
  return (
    <div>
      <div role="status" style={{
        display: 'inline-flex', gap: 6, fontWeight: 700, padding: '4px 10px', borderRadius: T.radius, marginBottom: 10,
        color: data.in_agreement ? T.ok : T.danger, background: data.in_agreement ? T.okTint : T.dangerTint,
      }}>
        {data.in_agreement ? '✓ The ledger agrees with the jobs and bills' : '✕ The ledger does not agree with the jobs and bills'}
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: T.fsGrid, minWidth: 460 }}>
        <thead>
          <tr>
            <th style={{ ...head, textAlign: 'left' }} />
            <th style={{ ...head, textAlign: 'right' }}>Ledger</th>
            <th style={{ ...head, textAlign: 'right' }}>Documents</th>
            <th style={{ ...head, textAlign: 'right' }}>Difference</th>
          </tr>
        </thead>
        <tbody>
          <Agreement label="Owed by customers" row={data.receivables} />
          <Agreement label="Owed to suppliers" row={data.payables} />
        </tbody>
      </table>

      <Issue
        title="Invoiced but not in the ledger" rows={data.unposted_invoices}
        why="Invoiced before the ledger existed, or imported. Bring history into the ledger below."
        render={(r) => <>{job(r)} · {money(r.total)}</>}
      />
      <Issue
        title="Ledger and job disagree" rows={data.mismatched_jobs}
        why="The job's total or payments no longer match what was posted for it."
        render={(r) => <>{job(r)} · job says {money(r.expected)}, ledger says {money(r.ledger)}</>}
      />
      <Issue
        title="Marked paid, but no payment recorded" rows={data.paid_with_balance_owing}
        why="Set to PAID without the money being entered, so the ledger still shows it owed. Record the payment on the job."
        render={(r) => <>{job(r)} · {money(r.unpaid)} unrecorded</>}
      />
      <Issue
        title="Invoiced with no invoice date" rows={data.invoiced_without_date}
        why="Posted on the day it was brought into the ledger, which may be the wrong BAS quarter. Check the invoice date."
        render={(r) => <>{job(r)} · {money(r.total)}</>}
      />
    </div>
  );
}

function Backfill() {
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: accounting.backfill,
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('ledger-') }),
  });
  return (
    <div>
      <div style={{ fontSize: T.fsSmall, color: T.textMuted, marginBottom: 8, maxWidth: 560 }}>
        Posts every invoice, payment and bill that predates the ledger, each on its own date. Safe to run
        again — anything already posted is left alone.
      </div>
      <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
        {run.isPending ? 'Posting…' : 'Bring history into the ledger'}
      </Button>
      {run.data && (
        <span role="status" style={{ marginLeft: 10, fontSize: T.fsSmall, color: T.ok }}>
          {run.data.entries_posted === 0 ? 'Nothing new to post' : `${run.data.entries_posted} entries posted`}
        </span>
      )}
      {run.error && <div role="alert" style={{ color: T.danger, marginTop: 6 }}>{run.error.message}</div>}
    </div>
  );
}

function LockDate() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['ledger-lock'], queryFn: accounting.lockDate });
  const [value, setValue] = useState('');
  const save = useMutation({
    mutationFn: (v) => accounting.setLockDate(v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ledger-lock'] }); setValue(''); },
  });
  const current = data?.lock_date;
  return (
    <div>
      <div style={{ fontSize: T.fsSmall, color: T.textMuted, marginBottom: 8, maxWidth: 560 }}>
        Nothing can be posted on or before the lock date — close a period once its BAS is lodged, and it
        stays as lodged. A document dated inside a locked period posts on today&apos;s date instead.
      </div>
      <div style={{ marginBottom: 8, fontSize: T.fsGrid }}>
        Currently: <b>{current ? `locked up to and including ${current}` : 'not locked'}</b>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="date" aria-label="Lock date" value={value} onChange={(e) => setValue(e.target.value)}
          style={{ height: 24, fontSize: T.fsGrid, padding: '0 6px', border: `1px solid ${T.hairline}`, borderRadius: T.radius - 1 }}
        />
        <Button size="sm" onClick={() => save.mutate(value)} disabled={!value || save.isPending}>Lock up to this date</Button>
        {current && <Button size="sm" variant="ghost" onClick={() => save.mutate(null)} disabled={save.isPending}>Unlock</Button>}
      </div>
      {save.error && <div role="alert" style={{ color: T.danger, marginTop: 6 }}>{save.error.message}</div>}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 12, fontWeight: 700, color: T.headerText, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>{title}</h3>
      {children}
    </section>
  );
}

export default function SetupTab({ currentUser }) {
  const canWrite = CAN_WRITE_LEDGER.includes(currentUser?.role);
  return (
    <div style={{ fontFamily: T.font, fontSize: T.fsGrid }}>
      <Panel title="Ledger health"><Health /></Panel>
      {canWrite && <Panel title="History"><Backfill /></Panel>}
      {canWrite && <Panel title="Lock date"><LockDate /></Panel>}
    </div>
  );
}

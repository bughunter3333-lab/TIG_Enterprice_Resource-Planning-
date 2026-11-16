import { useQuery } from '@tanstack/react-query';
import { T } from '../../ui/tokens';
import { useOffer } from '../../lib/useMyAccess';
import { formatDay } from '../../lib/dates';
import { money } from '../jobs/record/recordFormat';
import { statusLabel } from '../jobs/jobStatuses';
import { statementQuery } from './CustomerCredit';

const cell = { padding: '8px 12px', borderBottom: `1px solid ${T.hairlineSoft}`, fontSize: T.fsSmall, verticalAlign: 'top' };
const head = { ...cell, fontWeight: 600, color: T.textMuted, textAlign: 'left', background: T.panelAlt };
const num = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

/**
 * The customer's statement as the server keeps it (GET
 * /reports/customers/{id}/statement) — invoices, what settled them, and each
 * credit note as a credit — so the screen and the PDF beside it say the same.
 * It used to be added up here from the loaded jobs, which left credit notes out.
 */
export default function CustomerStatement({ customer }) {
  const offer = useOffer();
  const may = offer('GET', '/reports/customers/{customer_id}/statement');
  const { data, isPending, isError, error } = useQuery({ ...statementQuery(customer.id), enabled: !!may });
  if (!may) return <p style={{ margin: 0, fontSize: T.fsSmall, color: T.textMuted }}>Statements are for staff and above.</p>;
  if (isPending) return <p style={{ margin: 0, fontSize: T.fsSmall, color: T.textMuted }}>Loading…</p>;
  if (isError) return <p role="alert" style={{ margin: 0, fontSize: T.fsSmall, color: T.danger }}>{error.message}</p>;
  const { lines = [], totals = {} } = data;
  let running = 0;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.font }}>
      <thead>
        <tr>
          <th style={head}>Date</th>
          <th style={head}>Invoice</th>
          <th style={head}>Description</th>
          <th style={{ ...head, textAlign: 'right' }}>Amount</th>
          <th style={{ ...head, textAlign: 'right' }}>Paid / credit</th>
          <th style={{ ...head, textAlign: 'right' }}>Balance</th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 && (
          <tr><td colSpan={6} style={{ ...cell, color: T.textMuted }}>No invoices.</td></tr>
        )}
        {lines.map((line) => {
          running += Number(line.balance) || 0;
          const credit = line.status === 'CREDIT';
          const settled = (Number(line.paid) || 0) + (Number(line.credited) || 0);
          return (
            <tr key={`${line.status}-${line.invoice_no || line.job_id}`}>
              <td style={{ ...cell, color: T.textMuted }}>{formatDay(line.date)}</td>
              <td style={{ ...cell, fontFamily: T.fontMono, fontWeight: 600, color: credit ? T.ok : T.accentStrong }}>
                {line.invoice_no || line.job_id}
                {!credit && line.invoice_no && <div style={{ fontWeight: 400, color: T.textFaint }}>job {line.job_id}</div>}
              </td>
              <td style={cell}>{credit ? line.description : `${statusLabel(line.status)}${line.description ? ` · ${line.description}` : ''}`}</td>
              <td style={{ ...num, color: credit ? T.ok : T.text }}>{money(line.total_inc)}</td>
              <td style={{ ...num, color: T.ok }}>{settled ? money(-settled) : '—'}</td>
              <td style={{ ...num, fontWeight: 600, color: running > 0 ? T.danger : T.ok }}>{money(running)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3} style={{ ...cell, fontWeight: 600, borderTop: `2px solid ${T.hairline}` }}>
            Outstanding
            <span style={{ marginLeft: 8, fontWeight: 400, color: T.textMuted }}>
              invoiced {money(totals.invoiced)} · paid {money(totals.paid)}{totals.credited ? ` · credited ${money(totals.credited)}` : ''}
            </span>
          </td>
          <td colSpan={3} style={{ ...num, fontWeight: 700, borderTop: `2px solid ${T.hairline}`, color: totals.outstanding > 0 ? T.danger : T.ok }}>
            {money(totals.outstanding)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import SegmentedControl from '../../ui/SegmentedControl';
import { T } from '../../ui/tokens';
import { creditNotes as creditNotesApi } from '../../api';
import { notify } from '../../lib/notify';
import { useOffer } from '../../lib/useMyAccess';
import { formatDay } from '../../lib/dates';

const VIEWS = [
  { value: 'waiting', label: 'To inspect' },
  { value: 'restocked', label: 'Restocked' },
  { value: 'scrapped', label: 'Written off' },
];
// Used on a tablet at the returns bench: buttons a finger can hit.
const TOUCH = { height: 48, minWidth: 48 };
const cell = { padding: '8px 10px', borderBottom: `1px solid ${T.hairlineSoft}`, fontSize: T.fsGrid, verticalAlign: 'middle' };
const head = { ...cell, fontSize: T.fsSmall, fontWeight: 600, color: T.textMuted, textAlign: 'left' };

/**
 * Goods back on credit notes, waiting at RET (docs/superpowers/specs/2026-11-09-returns-credit-notes.md).
 * Inspected once: restocked to the job's branch, or written off at RET.
 */
export default function ReturnsModule() {
  const offer = useOffer();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('waiting');
  // A write-off cannot be taken back: it asks once more, naming what goes.
  const [confirming, setConfirming] = useState(null);
  const mayInspect = offer('POST', '/credit-notes/{note_id}/lines/{line_id}/inspect');
  const { data: rows = [], isPending, isError, error } = useQuery({
    queryKey: ['returns', status],
    queryFn: () => creditNotesApi.returns(status),
  });
  const inspecting = useMutation({
    mutationFn: ({ row, outcome }) => creditNotesApi.inspect(row.credit_note_id, row.line_id, outcome),
    onSuccess: (_, { row, outcome }) => {
      setConfirming(null);
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
      notify(
        outcome === 'restock'
          ? `${row.qty} × ${row.stock_code} back on the shelf at ${row.branch || 'HQ'}.`
          : `${row.qty} × ${row.stock_code} written off.`,
        { type: 'success' },
      );
    },
    onError: (e) => notify(e.message, { type: 'error' }),
  });

  return (
    <Card
      title="Returns"
      info={status === 'waiting' && rows.length ? `${rows.length} to inspect` : undefined}
      actions={<SegmentedControl options={VIEWS} value={status} onChange={setStatus} label="Which returns" size="sm" />}
    >
      {isPending && <p style={{ margin: 0, color: T.textMuted }}>Loading…</p>}
      {isError && <p role="alert" style={{ margin: 0, color: T.danger }}>{error.message}</p>}
      {!isPending && !isError && rows.length === 0 && (
        <p style={{ margin: 0, color: T.textMuted }}>
          {status === 'waiting' ? 'Nothing waiting at RET.' : 'None.'}
        </p>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.font }}>
            <thead>
              <tr>
                <th style={head}>Credit note</th>
                <th style={head}>Job</th>
                <th style={head}>Customer</th>
                <th style={head}>Code</th>
                <th style={{ ...head, textAlign: 'right' }}>Qty</th>
                <th style={head}>Back on</th>
                <th style={head}>{status === 'waiting' ? '' : 'By'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const busy = inspecting.isPending && inspecting.variables?.row.line_id === row.line_id;
                return (
                  <tr key={row.line_id}>
                    <td style={{ ...cell, fontFamily: T.fontMono }}>{row.credit_note_id}</td>
                    <td style={{ ...cell, fontFamily: T.fontMono }}>{row.job_id}</td>
                    <td style={cell}>{row.customer}</td>
                    <td style={cell}>
                      <div style={{ fontFamily: T.fontMono, fontWeight: 600 }}>{row.stock_code}</div>
                      <div style={{ fontSize: T.fsSmall, color: T.textMuted }}>{row.description}</div>
                    </td>
                    <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.qty}</td>
                    <td style={cell}>{formatDay(row.credit_date)}</td>
                    <td style={cell}>
                      {status !== 'waiting' && <span style={{ fontSize: T.fsSmall, color: T.textMuted }}>{row.inspected_by}</span>}
                      {status === 'waiting' && mayInspect && (
                        <span style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {confirming === row.line_id ? (
                            <>
                              <Button variant="danger" disabled={busy} style={TOUCH} onClick={() => inspecting.mutate({ row, outcome: 'scrap' })}>
                                Write off {row.qty} × {row.stock_code}
                              </Button>
                              <Button disabled={busy} style={TOUCH} onClick={() => setConfirming(null)}>Keep</Button>
                            </>
                          ) : (
                            <>
                              <Button disabled={busy} style={TOUCH} onClick={() => inspecting.mutate({ row, outcome: 'restock' })} aria-label={`Restock ${row.qty} ${row.stock_code} from ${row.credit_note_id}`}>
                                Restock to {row.branch || 'HQ'}
                              </Button>
                              <Button variant="ghost" disabled={busy} style={TOUCH} onClick={() => setConfirming(row.line_id)} aria-label={`Write off ${row.qty} ${row.stock_code} from ${row.credit_note_id}`}>
                                Write off…
                              </Button>
                            </>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

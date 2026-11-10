import { useMemo, useState } from 'react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import Field from '../../ui/Field';
import SegmentedControl from '../../ui/SegmentedControl';
import { labelStyle } from '../../ui/fieldStyle';
import { T } from '../../ui/tokens';
import { isoDay } from '../../lib/dates';
import { money } from '../jobs/record/recordFormat';
import {
  amountEstimate, creditableLines, creditedSoFar, decorated, leftOnInvoice, leftToCredit, leftToReturn,
  mayComeBack, noteEstimate,
} from './creditNotes';

const cell = { padding: '6px 8px', borderBottom: `1px solid ${T.hairlineSoft}`, fontSize: T.fsGrid, verticalAlign: 'middle' };
const head = { ...cell, fontSize: T.fsSmall, fontWeight: 600, color: T.textMuted, textAlign: 'left', background: T.panelAlt };
const num = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const MODES = [{ value: 'lines', label: 'Lines' }, { value: 'amount', label: 'An amount' }];

/**
 * Credit lines of an invoice — saying whether the goods are coming back — or
 * an amount (an invoice imported as a header has no lines; a price
 * adjustment needs none). Plain goods back wait at RET for inspection;
 * decorated goods are credited and never re-enter stock; a decoration or
 * charge is money only. The credit is applied to the invoice up to what it
 * owes, the rest is credit on the customer's account.
 */
export default function CreditNoteDialog({ job, notes, busy, error, onRaise, onClose }) {
  const lines = useMemo(() => creditableLines(job), [job]);
  const so = useMemo(() => creditedSoFar(notes), [notes]);
  const left = leftOnInvoice(job, notes);
  const [mode, setMode] = useState(lines.length ? 'lines' : 'amount');
  const [qty, setQty] = useState({});
  const [back, setBack] = useState({});
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [day, setDay] = useState(isoDay(new Date()));

  const picks = Object.fromEntries(Object.entries(qty).filter(([, n]) => n > 0));
  const byLines = mode === 'lines';
  const total = byLines ? noteEstimate(job, notes, picks) : amountEstimate(job, notes, Number(amount));
  const tooManyBack = byLines ? lines.filter((l) => back[l.id] && (qty[l.id] || 0) > leftToReturn(l, so)) : [];
  const amountOver = !byLines && Number(amount) > left.inc + 0.004;
  const something = byLines ? Object.keys(picks).length > 0 : Number(amount) > 0;
  const ready = something && reason.trim() && !tooManyBack.length && !amountOver && !busy;
  const owed = Number(job.balanceDue) || 0;
  const onAccount = Math.max(0, total.inc - owed);

  const setLineQty = (line, value) => {
    const n = Math.max(0, Math.min(leftToCredit(line, so), Math.floor(Number(value) || 0)));
    setQty((q) => ({ ...q, [line.id]: n }));
  };
  const raise = () => onRaise({
    ...(byLines
      ? { lines: Object.entries(picks).map(([id, n]) => ({ itemId: Number(id), qty: n, goodsBack: !!back[id] })) }
      : { amount: Math.round(Number(amount) * 100) / 100 }),
    reason: reason.trim(),
    creditDate: day,
  });

  return (
    <Modal
      title={`Credit / return — job ${job.id}`}
      onClose={onClose}
      width={760}
      footer={(
        <>
          <span style={{ flex: 1, fontSize: T.fsSmall, color: T.textMuted }}>
            {total.inc > 0 && (onAccount > 0
              ? `${money(total.inc - onAccount)} off this invoice, ${money(onAccount)} credit on the account`
              : 'All of it off this invoice')}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ready} onClick={raise}>
            {busy ? 'Raising…' : `Raise credit note ${total.inc > 0 ? money(total.inc) : ''}`}
          </Button>
        </>
      )}
    >
      {lines.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <SegmentedControl options={MODES} value={mode} onChange={setMode} label="Credit what" size="sm" />
        </div>
      )}
      {byLines ? (
        <div style={{ maxHeight: 340, overflowY: 'auto', border: `1px solid ${T.hairline}`, borderRadius: T.radius }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.font }}>
            <thead>
              <tr>
                <th style={head}>Code</th>
                <th style={head}>Description</th>
                <th style={{ ...head, textAlign: 'right' }}>Left</th>
                <th style={{ ...head, textAlign: 'right' }}>Credit</th>
                <th style={head}>Coming back</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const lineLeft = leftToCredit(line, so);
                const comesBack = mayComeBack(line);
                return (
                  <tr key={line.id}>
                    <td style={{ ...cell, fontFamily: T.fontMono }}>{line.stockCode}</td>
                    <td style={{ ...cell, color: T.textMuted, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.description}</td>
                    <td style={num}>{lineLeft}</td>
                    <td style={num}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        max={lineLeft}
                        disabled={lineLeft === 0}
                        aria-label={`Credit how many ${line.stockCode}`}
                        value={qty[line.id] ?? ''}
                        placeholder="0"
                        onChange={(e) => setLineQty(line, e.target.value)}
                        style={{ width: 64, height: 30, textAlign: 'right', fontFamily: T.font, fontSize: T.fsGrid, border: `1px solid ${T.fieldBorder}`, borderRadius: T.radiusField, padding: '0 6px' }}
                      />
                    </td>
                    <td style={cell}>
                      {comesBack ? (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: T.fsSmall, color: T.textMuted }}>
                          <input
                            type="checkbox"
                            disabled={!(qty[line.id] > 0)}
                            checked={!!back[line.id]}
                            onChange={(e) => setBack((b) => ({ ...b, [line.id]: e.target.checked }))}
                            aria-label={`${line.stockCode} is coming back`}
                          />
                          {decorated(line, job.items) ? 'Decorated — not restocked' : 'To RET for inspection'}
                        </label>
                      ) : (
                        <span style={{ fontSize: T.fsSmall, color: T.textFaint }}>Money only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12, alignItems: 'end' }}>
          <Field
            label="Credit (inc GST)"
            type="number"
            min="0.01"
            step="0.01"
            max={left.inc}
            value={amount}
            error={amountOver ? `${money(left.inc)} is left to credit` : undefined}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p style={{ margin: 0, fontSize: T.fsSmall, color: T.textMuted }}>
            {lines.length ? 'An amount off the invoice, with no lines and nothing coming back.' : 'This invoice has no lines: credit an amount.'}
            {' '}{money(left.inc)} is left to credit.
          </p>
        </div>
      )}
      {tooManyBack.map((l) => (
        <p key={l.id} role="alert" style={{ margin: '8px 0 0', fontSize: T.fsSmall, color: T.danger }}>
          Only {leftToReturn(l, so)} of {l.stockCode} went out and has not come back.
        </p>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 12, marginTop: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="credit-reason" style={labelStyle}>Reason (printed on the adjustment note)</label>
          <textarea
            id="credit-reason"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            style={{ fontFamily: T.font, fontSize: T.fsGrid, border: `1px solid ${T.fieldBorder}`, borderRadius: T.radiusField, padding: 8, resize: 'vertical' }}
          />
        </div>
        <Field
          label="Dated"
          type="date"
          value={day}
          max={isoDay(new Date())}
          min={(job.invoiceDate || '').slice(0, 10) || undefined}
          onChange={(e) => setDay(e.target.value)}
        />
      </div>
      <p style={{ margin: '12px 0 0', fontSize: T.fsBase, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
        Credit <strong>{money(total.inc)}</strong>
        <span style={{ color: T.textMuted }}> — {money(total.ex)} ex GST, {money(total.tax)} GST</span>
      </p>
      {error && <p role="alert" style={{ margin: '8px 0 0', fontSize: T.fsSmall, color: T.danger }}>{error}</p>}
    </Modal>
  );
}

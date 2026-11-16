import { useEffect, useId, useRef, useState } from 'react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import Field from '../../ui/Field';
import { T } from '../../ui/tokens';
import { lineText } from './productionBoard';

// A finger at the machine, not a cursor: every control here is at least this tall.
const TOUCH = 44;

/**
 * Hand a job's work at one lane to another lane, and optionally a person —
 * the tablet way: large lane buttons, one name field (the names used before
 * offered). Handing to the lane it is in, with a new name, is how work changes
 * hands at one machine. It never changes the job's status.
 *
 * Focus goes to the chosen lane when the sheet opens; the lanes are one radio
 * group, moved through with the arrow keys.
 */
export default function HandOffSheet({ card, lanes, holders, canHandOff, busy, onHandOff, onOpenJob, onClose }) {
  const [toLane, setToLane] = useState(card.lane);
  const [holder, setHolder] = useState(card.holder ?? '');
  const listId = useId();
  const radios = useRef([]);
  const here = lanes.find((l) => l.key === card.lane)?.label ?? card.lane;
  const unchanged = toLane === card.lane && holder.trim() === (card.holder ?? '');

  useEffect(() => {
    const at = lanes.findIndex((l) => l.key === card.lane);
    radios.current[Math.max(at, 0)]?.focus();
    // Only when the sheet opens: the lanes move nothing on their own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (e, i) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + lanes.length) % lanes.length;
    setToLane(lanes[next].key);
    radios.current[next]?.focus();
  };

  return (
    <Modal
      title={`Job ${card.job_id} · ${here}`}
      onClose={onClose}
      width={520}
      footer={(
        <>
          <Button variant="ghost" style={{ height: TOUCH }} onClick={() => onOpenJob(card.job_id)}>Open job</Button>
          <span style={{ flex: 1 }} />
          <Button style={{ height: TOUCH }} onClick={onClose}>Cancel</Button>
          {canHandOff && (
            <Button variant="primary" style={{ height: TOUCH }} disabled={busy || unchanged} onClick={() => onHandOff(toLane, holder.trim())}>
              {busy ? 'Handing off…' : 'Hand off'}
            </Button>
          )}
        </>
      )}
    >
      <p style={{ margin: '0 0 10px', color: T.text, fontSize: T.fsBase }}>{card.customer_name}</p>
      <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none' }}>
        {card.lines.map((line) => (
          <li key={line.item_id} style={{ fontFamily: T.fontMono, fontSize: T.fsSmall, color: T.textMuted }}>{lineText(line)}</li>
        ))}
      </ul>
      {canHandOff ? (
        <>
          <div role="radiogroup" aria-label="Hand to lane" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}>
            {lanes.map((lane, i) => {
              const chosen = lane.key === toLane;
              return (
                <button
                  key={lane.key}
                  ref={(el) => { radios.current[i] = el; }}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  tabIndex={chosen ? 0 : -1}
                  onClick={() => setToLane(lane.key)}
                  onKeyDown={(e) => move(e, i)}
                  style={{
                    minHeight: 48, padding: '8px 10px', borderRadius: T.radius, cursor: 'pointer',
                    fontFamily: T.font, fontSize: T.fsBase, fontWeight: chosen ? 600 : 400, textAlign: 'left',
                    background: chosen ? T.accentTint : T.panel, color: chosen ? T.accentStrong : T.text,
                    border: `1px solid ${chosen ? T.accent : T.hairline}`,
                  }}
                >
                  {lane.label}{lane.key === card.lane ? <span style={{ display: 'block', fontSize: T.fsSmall, color: T.textMuted, fontWeight: 400 }}>here now</span> : null}
                </button>
              );
            })}
          </div>
          <Field
            label="To a person (optional)"
            list={listId}
            value={holder}
            maxLength={50}
            onChange={(e) => setHolder(e.target.value)}
            placeholder="e.g. Lina"
            inputStyle={{ height: TOUCH, width: '100%', boxSizing: 'border-box' }}
          />
          <datalist id={listId}>
            {holders.map((name) => <option key={name} value={name} />)}
          </datalist>
        </>
      ) : (
        <p style={{ margin: 0, color: T.textMuted, fontSize: T.fsSmall }}>
          {card.holder ? `With ${card.holder}. ` : ''}Your role views the board; handing work on is for the floor team.
        </p>
      )}
    </Modal>
  );
}

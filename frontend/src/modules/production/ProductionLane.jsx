import { useState } from 'react';
import { T } from '../../ui/tokens';
import { dueOf } from '../jobs/record/recordFormat';
import { cardKey, isPressing, lineText, sinceText } from './productionBoard';

/**
 * One lane of the production board: its cards, most pressing first. When the
 * person may hand work off, a card can be dragged here from another lane
 * (mouse); on a tablet, tapping a card opens the hand-off sheet instead —
 * native drag does not work by touch.
 */
export default function ProductionLane({ lane, canHandOff, onOpenCard, onDropCard }) {
  const [over, setOver] = useState(false);
  const count = lane.cards.length;
  const dropProps = canHandOff
    ? {
        onDragOver: (e) => { e.preventDefault(); setOver(true); },
        onDragLeave: () => setOver(false),
        onDrop: (e) => {
          e.preventDefault();
          setOver(false);
          const key = e.dataTransfer.getData('text/plain');
          if (key) onDropCard(key, lane.key);
        },
      }
    : {};

  return (
    <section
      aria-label={`${lane.label}, ${count} job${count === 1 ? '' : 's'}`}
      data-lane={lane.key}
      tabIndex={-1}
      {...dropProps}
      style={{
        width: 272, flex: '0 0 272px', display: 'flex', flexDirection: 'column',
        background: over ? T.accentTint : T.panelAlt,
        border: `1px solid ${over ? T.accent : T.hairline}`,
        borderRadius: T.radiusLg, transition: 'background 120ms, border-color 120ms',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 8px' }}>
        <h3 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: T.fsSmall, fontWeight: 600, color: T.text, letterSpacing: '0.01em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lane.label}
        </h3>
        <span style={{ fontSize: T.fsSmall, color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 8px 10px', overflowY: 'auto', maxHeight: 'calc(100vh - 230px)' }}>
        {count === 0
          ? <p style={{ margin: 0, padding: '14px 8px', fontSize: T.fsSmall, color: T.textFaint, textAlign: 'center', border: `1px dashed ${T.hairline}`, borderRadius: T.radius }}>Nothing here</p>
          : lane.cards.map((card) => (
            <BoardCard key={cardKey(card)} card={card} draggable={canHandOff} onOpen={() => onOpenCard(card)} />
          ))}
      </div>
    </section>
  );
}

function BoardCard({ card, draggable, onOpen }) {
  const [focused, setFocused] = useState(false);
  const due = dueOf({ due: card.due, status: card.status });
  // Everything the card shows, in the order it shows it — the label replaces
  // the content for a screen reader, so it must not leave any of it out.
  const label = [
    `Job ${card.job_id}`,
    card.customer_name || 'no customer',
    isPressing(card) ? card.priority : null,
    due.text ? (due.overdue ? `overdue, due ${due.text}` : `due ${due.text}`) : null,
    `${card.lines.length} line${card.lines.length === 1 ? '' : 's'}`,
    card.holder ? `with ${card.holder} ${sinceText(card.since)}`.trim() : null,
  ].filter(Boolean).join(', ');
  return (
    <button
      type="button"
      onClick={onOpen}
      draggable={draggable}
      onDragStart={draggable ? (e) => e.dataTransfer.setData('text/plain', cardKey(card)) : undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      data-card-key={cardKey(card)}
      aria-label={label}
      style={{
        all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'block', width: '100%',
        background: T.panel, border: `1px solid ${focused ? T.accent : T.hairline}`, borderRadius: T.radius,
        padding: '10px 12px', fontFamily: T.font, minHeight: 44,
        // The inline style beats the global focus ring, so the card draws its own.
        boxShadow: focused ? `0 0 0 2px ${T.panel}, 0 0 0 4px ${T.accentFocus}` : T.shadowSm,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: T.fontMono, fontWeight: 600, color: T.text, fontSize: T.fsBase }}>{card.job_id}</span>
        {isPressing(card) && (
          <span style={{ fontSize: T.fsSmall, fontWeight: 600, color: card.priority === 'Urgent' ? T.danger : T.warn }}>{card.priority}</span>
        )}
        <span style={{ flex: 1 }} />
        {due.text && (
          <span style={{ fontSize: T.fsSmall, color: due.overdue ? T.danger : T.textMuted, fontWeight: due.overdue ? 600 : 400 }}>
            {due.overdue ? `Overdue · ${due.text}` : due.text}
          </span>
        )}
      </span>
      <span style={{ display: 'block', marginTop: 2, fontSize: T.fsBase, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {card.customer_name}{card.cust_ref ? <span style={{ color: T.textMuted }}> · {card.cust_ref}</span> : null}
      </span>
      <span style={{ display: 'block', marginTop: 6 }}>
        {card.lines.map((line) => (
          <span key={line.item_id} style={{ display: 'block', fontSize: T.fsSmall, color: T.textMuted, fontFamily: T.fontMono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lineText(line)}
          </span>
        ))}
      </span>
      {card.holder && (
        <span style={{ display: 'block', marginTop: 6, fontSize: T.fsSmall, color: T.text }}>
          With <strong style={{ fontWeight: 600 }}>{card.holder}</strong>
          <span style={{ color: T.textMuted }}> {sinceText(card.since)}</span>
        </span>
      )}
    </button>
  );
}

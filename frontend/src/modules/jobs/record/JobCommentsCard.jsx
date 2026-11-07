import { useState } from 'react';
import { Check, Lock, Pin, PinOff } from 'lucide-react';
import { T } from '../../../ui/tokens';
import Card from '../../../ui/Card';
import Button from '../../../ui/Button';
import { fieldChrome } from '../../../ui/fieldStyle';

/**
 * The job's running notes, newest first, and a line to add one. An internal
 * note never reaches the customer's documents; "Inc" marks a comment that is
 * included on them. Enter adds a comment; Internal adds it as a note.
 *
 * A pinned comment stays at the top, above the newest-first rest (Jim2 v4.6):
 * the note that matters does not sink under the system lines. `onPin(comment,
 * pinned)` is given only where pinning is offered.
 */
export default function JobCommentsCard({ job, onAdd, onPin }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const comments = job.comments || [];
  const newestFirst = [...comments].reverse();
  const shown = [
    ...newestFirst.filter(c => c.pinnedAt).sort((a, b) => String(b.pinnedAt).localeCompare(String(a.pinnedAt))),
    ...newestFirst.filter(c => !c.pinnedAt),
  ];
  const add = (internal) => {
    const value = text.trim();
    if (!value) return;
    onAdd(value, internal);
    setText('');
  };
  return (
    <Card title="Comments" info={`${comments.length} entr${comments.length === 1 ? 'y' : 'ies'}`} bodyStyle={{ padding: 0 }}>
      {comments.length === 0 ? (
        <p style={{ margin: '12px 16px', fontSize: T.fsGrid, color: T.textMuted }}>No comments yet. The first note on a job is usually what the customer asked for.</p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: '4px 0', maxHeight: 280, overflowY: 'auto' }}>
          {shown.map((c, idx) => (
            <li key={c.id ?? idx} style={{
              display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, padding: '8px 16px',
              borderTop: idx ? `1px solid ${T.hairlineSoft}` : 'none',
              background: c.isInternal ? T.warnTint : 'transparent',
              boxShadow: c.pinnedAt ? `inset 2px 0 0 ${T.accent}` : 'none',
            }}>
              <span title={c.authorName} style={{
                width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: T.hairlineSoft, color: T.textMuted, fontSize: 10, fontWeight: 600, fontFamily: T.fontMono,
              }}>{(c.initials || '?').slice(0, 3)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: T.fsSmall, color: T.textMuted }}>
                  <span style={{ color: T.text, fontWeight: 500 }}>{c.authorName || c.initials}</span>
                  <span>{c.date} {c.time}</span>
                  {c.status && <span style={{ padding: '1px 6px', borderRadius: T.radiusSm, background: T.hairlineSoft }}>{c.status}</span>}
                  {c.isInternal && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: T.warn, fontWeight: 600 }}><Lock size={10} aria-hidden />Internal</span>}
                </div>
                <div style={{ fontSize: T.fsGrid, color: T.text, marginTop: 2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.comment}</div>
              </div>
              <span style={{ alignSelf: 'start', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {c.inc ? <span title="Included on customer documents"><Check size={13} color={T.ok} aria-label="Included on documents" /></span> : null}
                {onPin && c.id != null && (
                  <button
                    type="button"
                    aria-label={c.pinnedAt ? 'Unpin comment' : 'Pin comment'}
                    title={c.pinnedAt ? 'Unpin: back into the trail by date' : 'Pin to the top of the comments'}
                    onClick={() => onPin(c, !c.pinnedAt)}
                    style={{ border: 'none', background: 'transparent', padding: 2, cursor: 'pointer', color: c.pinnedAt ? T.accent : T.textFaint, display: 'inline-flex' }}
                  >
                    {c.pinnedAt ? <PinOff size={13} aria-hidden /> : <Pin size={13} aria-hidden />}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px 14px', borderTop: `1px solid ${T.hairlineSoft}` }}>
        <input
          aria-label="Add a comment"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(false); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Add a comment… (Enter to add)"
          style={{ ...fieldChrome({ focused }), flex: 1, padding: '0 10px', minWidth: 0 }}
        />
        <Button onClick={() => add(true)} title="Add as an internal note (not on customer documents)"><Lock size={13} aria-hidden />Internal</Button>
        <Button onClick={() => add(false)}>Add</Button>
      </div>
    </Card>
  );
}

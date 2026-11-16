/**
 * Racking marked for a company: the list of sections (left of the 3D view)
 * and the form that marks one (right of it).
 *
 * A section is two boxes — opposite corners on one rack face. They can be
 * clicked in the view or typed here; the form is the control, the view the
 * picture, so everything works from the keyboard.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Trash2, X } from 'lucide-react';
import * as api from '../../api';
import { notify } from '../../lib/notify';
import { T } from '../../ui/tokens';
import Button from '../../ui/Button';
import BinField from './BinField';
import { suggestBins } from './binSuggest';
import { boxCount, overlaps, sectionShape, sectionWords } from './sections';

const field = {
  width: '100%', height: 28, padding: '0 8px', fontFamily: T.font, fontSize: T.fsBase,
  border: `1px solid ${T.textMuted}`, borderRadius: T.radiusField, background: T.panel, color: T.text,
};
const label = { display: 'block', fontSize: T.fsSmall, color: T.textMuted, marginBottom: 4 };
const note = { margin: 0, fontSize: T.fsSmall, color: T.textMuted };
const plain = { border: 'none', margin: 0, padding: 0, minWidth: 0 };
const choice = { display: 'flex', alignItems: 'center', gap: 6, fontSize: T.fsBase, color: T.text, cursor: 'pointer' };
const sectionTitle = { fontSize: T.fsSmall, fontWeight: 700, color: T.textMuted, margin: 0 };
const quiet = { border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: T.font, color: T.text, padding: 0 };

/**
 * The sections marked at this branch, by company. Choosing one walks to it;
 * an admin or manager can remove one or mark another.
 */
export function SectionList({ layout, sections, colors, canEdit, marking, onShow, onMark, branch }) {
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState(null);
  const region = useRef(null);
  const markButton = useRef(null);
  const asked = useRef(null);
  const wasMarking = useRef(false);

  // The buttons here come and go: asking to remove a row replaces its bin
  // button with Remove / Keep, and marking hides "Mark a section". Each time
  // the keyboard is handed on to what took the place of what it was on —
  // never left on the page, and never taken from somewhere else it has gone.
  const within = () => !document.activeElement || document.activeElement === document.body || region.current?.contains(document.activeElement);
  const row = (id) => region.current?.querySelector(`[data-section="${id}"]`);
  useEffect(() => {
    if (removing != null) {
      // On the answer that changes nothing.
      asked.current = removing;
      row(removing)?.querySelector('[data-keep]')?.focus();
    } else if (asked.current != null) {
      // Kept: back to the button that asked.
      const kept = row(asked.current)?.querySelector('[data-remove]');
      asked.current = null;
      if (within()) kept?.focus();
    }
  }, [removing]);
  useEffect(() => {
    const lost = !document.activeElement || document.activeElement === document.body;
    if (wasMarking.current && !marking && lost) markButton.current?.querySelector('button')?.focus();
    wasMarking.current = marking;
  }, [marking]);
  // Answered: the row is about to go (or to come back as it now is), so the
  // keyboard goes to the list itself.
  const answered = () => {
    asked.current = null;
    setRemoving(null);
    if (within()) region.current?.focus();
  };

  const remove = useMutation({
    networkMode: 'always',
    mutationFn: (section) => api.rackSections.remove(section.id),
    onSuccess: (_, section) => {
      answered();
      queryClient.invalidateQueries({ queryKey: ['rack-sections', branch] });
      notify(`${section.customer_name}'s section removed`, { type: 'success' });
    },
    onError: (error, section) => {
      answered();
      // Gone already (someone else removed it), or changed: show what is there now.
      queryClient.invalidateQueries({ queryKey: ['rack-sections', branch] });
      notify(`Couldn't remove ${section.customer_name}'s section: ${error?.message || String(error)}`, { type: 'error' });
    },
  });

  return (
    <section ref={region} tabIndex={-1} aria-label="Company sections" style={{ marginTop: 14, outline: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <h2 style={sectionTitle}>Company sections</h2>
        {canEdit && !marking && (
          <span ref={markButton}>
            <Button size="sm" onClick={onMark}><MapPin size={12} aria-hidden />Mark a section</Button>
          </span>
        )}
      </div>
      {sections.length === 0 && (
        <p style={note}>
          No racking is marked for a company at {branch}.{canEdit ? ' Mark a section to show whose stock a run of bays holds.' : ''}
        </p>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
        {sections.map((s) => {
          const onMap = !!sectionShape(layout, s);
          const asking = removing === s.id;
          return (
            <li key={s.id} data-section={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0', borderBottom: `1px solid ${T.hairlineSoft}` }}>
              <span aria-hidden style={{ width: 10, height: 10, marginTop: 4, flexShrink: 0, borderRadius: 2, background: colors.get(s.customer_id) }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {asking ? (
                  <div role="group" aria-label={`Remove ${s.customer_name}'s section?`} style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: T.fsSmall, color: T.text }}>Remove {s.customer_name}’s section? The stock in it is not touched.</span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(s)}>{remove.isPending ? 'Removing…' : 'Remove'}</Button>
                      <Button size="sm" variant="ghost" data-keep disabled={remove.isPending} onClick={() => setRemoving(null)}>Keep</Button>
                    </span>
                  </div>
                ) : (
                  <button type="button" disabled={!onMap} onClick={() => onShow(s)} title={onMap ? 'Walk to this section' : undefined}
                    style={{ ...quiet, textAlign: 'left', width: '100%', cursor: onMap ? 'pointer' : 'default' }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: T.fsBase }}>{s.customer_name}</span>
                    <span style={{ display: 'block', fontSize: T.fsSmall, color: T.textMuted }}>
                      {onMap ? sectionWords(layout, s) : `${s.from_bin} to ${s.to_bin} — not in this racking`}
                    </span>
                  </button>
                )}
              </div>
              {canEdit && !asking && (
                <button type="button" data-remove aria-label={`Remove ${s.customer_name}'s section, ${s.from_bin} to ${s.to_bin}`} onClick={() => setRemoving(s.id)}
                  style={{ ...quiet, color: T.textMuted, padding: 2 }}>
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const PROBLEMS = {
  format: 'is not an aisle.bay.level.box code, like B.3.A.1',
  aisle: 'is in an aisle this racking has not got',
  bay: 'is in a bay beyond the racking',
  level: 'is on a level higher than the racking',
  position: 'is a box number beyond the level',
};

/** Why the two corners do not make a section, in words — or null when they do, or nothing is entered yet. */
function problemWords(layout, draft, mark) {
  if (!draft || draft.ok) return null;
  if (draft.reason === 'aisles') return 'The two boxes are in different aisles. A section is on one rack face.';
  if (draft.reason === 'sides') return 'The two boxes are on opposite sides of the aisle: odd bays face even bays. Mark each side as its own section.';
  const typed = draft.corner === 'from' ? mark.from : mark.to;
  const which = draft.corner === 'from' ? 'The first box' : 'The second box';
  // The start of a real location is unfinished, not wrong.
  if (draft.reason === 'format' && suggestBins(layout, typed).length > 0) {
    return `${which} “${typed.trim()}” is not a whole location yet — finish it, or choose one from the list.`;
  }
  return `${which} “${typed.trim()}” ${PROBLEMS[draft.reason]}.`;
}

/**
 * Marks a section for a company. `mark` is what has been entered so far
 * (`{ from, to, wholeBays, allLevels }` — WarehouseModule keeps it, because
 * clicking a box in the view fills it in and the view draws it); `draft` is
 * the section that makes, from `sectionBetween`.
 */
export function MarkSectionForm({ layout, branch, customers, sections, mark, draft, onChange, onDone, onCancel }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [customerId, setCustomerId] = useState(null);
  const corners = useRef(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Choosing a company removes the list the keyboard was in; carry on to the
  // corners rather than dropping focus on the page.
  useEffect(() => {
    if (customerId) corners.current?.querySelector('input')?.focus();
  }, [customerId]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || customerId) return [];
    return (customers ?? [])
      .filter((c) => (c.name ?? '').toLowerCase().includes(q) || String(c.id ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [customers, query, customerId]);
  const customer = (customers ?? []).find((c) => c.id === customerId) ?? null;

  const clash = draft?.ok ? sections.find((s) => overlaps(draft, s)) ?? null : null;
  const problem = problemWords(layout, draft, mark);
  const ready = !!customer && !!draft?.ok && !clash;

  const save = useMutation({
    // Not queued while offline: it must not fire by itself, later.
    networkMode: 'always',
    mutationFn: ({ body }) => api.rackSections.create(body),
    onSuccess: (saved, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['rack-sections', branch] });
      onDone({ name, section: saved });
    },
    onError: (error, { name }) => {
      // Refused because someone marked those boxes since this screen loaded:
      // fetch the sections again so the form shows whose they are.
      if (error?.status === 409) queryClient.invalidateQueries({ queryKey: ['rack-sections', branch] });
      if (!mounted.current || error?.status === 401) notify(`Couldn't mark the section for ${name}: ${error?.message || String(error)}`, { type: 'error' });
    },
  });
  const submit = () => save.mutate({
    name: customer.name,
    body: { branch, customer_id: customer.id, from_bin: draft.from_bin, to_bin: draft.to_bin },
  });
  // A refusal was about the section as it was then. Whenever what is entered
  // changes — typed here, or a box clicked in the view — it is stale.
  const { reset } = save;
  useEffect(() => { reset(); }, [mark.from, mark.to, mark.wholeBays, mark.allLevels, reset]);

  return (
    <aside aria-label="Mark a section" style={{ width: 320, flexShrink: 0, borderLeft: `1px solid ${T.hairline}`, background: T.panel, overflowY: 'auto' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>Mark a section</h2>
          <p style={{ ...note, marginTop: 4 }}>Racking that holds one company’s stock at {branch}.</p>
        </div>
        <button type="button" aria-label="Close without marking" onClick={onCancel} disabled={save.isPending}
          style={{ ...quiet, color: T.textMuted, padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      <form
        aria-label="Mark a section for a company"
        onSubmit={(e) => { e.preventDefault(); if (ready && !save.isPending) submit(); }}
        style={{ display: 'grid', gap: 14, padding: '12px 16px' }}
      >
        <fieldset disabled={save.isPending} style={{ ...plain, display: 'grid', gap: 14 }}>
          <div>
            <label htmlFor="ms-company" style={label}>Company</label>
            {customer ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: T.text }}>{customer.name}</div>
                  <div style={{ fontFamily: T.fontMono, fontSize: T.fsSmall, color: T.textMuted }}>{customer.id}</div>
                </div>
                <Button variant="ghost" onClick={() => { setCustomerId(null); save.reset(); }}>Change</Button>
              </div>
            ) : (
              <>
                <input id="ms-company" type="search" autoFocus style={field} value={query}
                  onChange={(e) => setQuery(e.target.value)} placeholder="Customer name or number" autoComplete="off" />
                {matches.length > 0 && (
                  <ul aria-label="Matching customers" style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, border: `1px solid ${T.hairline}`, borderRadius: T.radiusField, background: T.panel, maxHeight: 220, overflowY: 'auto' }}>
                    {matches.map((m) => (
                      <li key={m.id}>
                        <button type="button" onClick={() => setCustomerId(m.id)}
                          style={{ ...quiet, width: '100%', textAlign: 'left', padding: '6px 8px' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = T.hairlineSoft; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                          <span style={{ fontWeight: 700, fontSize: T.fsSmall }}>{m.name}</span>
                          <span style={{ fontFamily: T.fontMono, color: T.textMuted, fontSize: T.fsSmall }}> · {m.id}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {query.trim() && matches.length === 0 && (
                  <p style={{ ...note, marginTop: 4 }}>No customer matches “{query.trim()}”.</p>
                )}
              </>
            )}
          </div>

          <fieldset ref={corners} style={{ ...plain, display: 'grid', gap: 8 }}>
            <legend style={label}>Two boxes at opposite corners</legend>
            <p style={note}>Click one box in the view, then the box at the other end — or type their codes.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label htmlFor="ms-from" style={label}>First box</label>
                <BinField id="ms-from" value={mark.from} onValue={(from) => onChange({ from })} layout={layout}
                  maxLength={50} placeholder="B.3.A.1" style={{ ...field, fontFamily: T.fontMono }} />
              </div>
              <div>
                <label htmlFor="ms-to" style={label}>Second box</label>
                <BinField id="ms-to" value={mark.to} onValue={(to) => onChange({ to })} layout={layout}
                  maxLength={50} placeholder="same box" style={{ ...field, fontFamily: T.fontMono }} />
              </div>
            </div>
            <label style={choice}>
              <input type="checkbox" checked={mark.wholeBays} onChange={(e) => onChange({ wholeBays: e.target.checked })} />
              Whole bays
            </label>
            <label style={choice}>
              <input type="checkbox" checked={mark.allLevels} onChange={(e) => onChange({ allLevels: e.target.checked })} />
              All levels, floor to top
            </label>
          </fieldset>
        </fieldset>

        {problem && <p role="alert" style={{ ...note, color: T.danger }}>{problem}</p>}
        {draft?.ok && (
          <p style={{ ...note, color: T.text }}>
            {sectionWords(layout, draft)} — {boxCount(layout, draft).toLocaleString('en-AU')} boxes.
          </p>
        )}
        {clash && (
          <p role="alert" style={{ ...note, color: T.danger }}>
            Some of these boxes are already {clash.customer_name}’s ({clash.from_bin} to {clash.to_bin}). Remove that section first, or mark around it.
          </p>
        )}
        {save.error && (
          <p role="alert" style={{ ...note, color: T.danger }}>
            Couldn't mark the section: {save.error.message || String(save.error)}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onCancel} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!ready || save.isPending}>
            {save.isPending ? 'Saving…' : customer ? `Mark for ${customer.name}` : 'Mark section'}
          </Button>
        </div>
      </form>
    </aside>
  );
}

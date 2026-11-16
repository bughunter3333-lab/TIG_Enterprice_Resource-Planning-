/**
 * Add stock to a box, from the warehouse map.
 *
 * Choose the product, say whether this box becomes its primary or overflow
 * bin, and what is going in. One request (POST /inventory/bin-map/put-away)
 * records the box and moves any stock through the ledger together. A
 * product's existing bin is never replaced without ticking "Replace".
 *
 * Stock is counted per branch, not per box, so the form asks what the stock
 * is rather than guessing from a quantity:
 *   already on hand — the usual case (it was received or counted before).
 *     Nothing is added. Only units with no location at all are recorded as
 *     being at this branch, and the total does not move.
 *   new stock — not in the on-hand figure yet. The quantity is added.
 * "Already on hand" is the default because the other mistake counts received
 * stock twice.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../api';
import { parseBin } from '../../lib/binLocation';
import { notify } from '../../lib/notify';
import { T } from '../../ui/tokens';
import Button from '../../ui/Button';

const field = {
  width: '100%', height: 28, padding: '0 8px', fontFamily: T.font, fontSize: T.fsBase,
  border: `1px solid ${T.textMuted}`, borderRadius: T.radiusField, background: T.panel, color: T.text,
};
const label = { display: 'block', fontSize: T.fsSmall, color: T.textMuted, marginBottom: 4 };
const note = { margin: 0, fontSize: T.fsSmall, color: T.textMuted };
const plain = { border: 'none', margin: 0, padding: 0, minWidth: 0 };
const choice = { display: 'flex', alignItems: 'center', gap: 6, fontSize: T.fsBase, color: T.text, cursor: 'pointer' };

// The server's bound on a quantity and on a box's capacity.
const MAX_QTY = 100_000;
const fmt = (n) => Number(n).toLocaleString('en-AU');
const wholeNumber = (text, min, max) => {
  const n = Number(text);
  return Number.isInteger(n) && n >= min && n <= max;
};

// One box, however its code was typed: `E.02.H.04` on file is the box the map
// draws as E.2.H.4. The server compares the same way.
function sameBox(a, b) {
  const pa = parseBin(a);
  const pb = parseBin(b);
  return !!pa && !!pb && pa.aisle === pb.aisle && pa.bay === pb.bay && pa.level === pb.level && pa.position === pb.position;
}

// Everything a put-away changes: the map, the item, its positions, its history.
const affected = (branch) => [
  ['bin-map', branch], ['inventory'], ['stock-locations'], ['stock-location-summary'],
  ['stock-history'], ['stock-transactions'], ['stockMovements'],
];

const usable = (el) => !!el && el.isConnected && !el.matches(':disabled');

export default function PutAwayForm({ code, branch, inventory, rows, onDone, onCancel }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [sku, setSku] = useState(null);
  const [slotChoice, setSlotChoice] = useState(null);
  // Which bin the person agreed to replace ("slot:code"), not just that they
  // agreed: a tick given for one box must not carry over to another.
  const [replaceFor, setReplaceFor] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [maxQty, setMaxQty] = useState('');
  const [reason, setReason] = useState('');
  const details = useRef(null);
  const replaceBox = useRef(null);
  const lastFocus = useRef(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Choosing a product removes the list the keyboard was in; carry on to the
  // choices below rather than dropping focus on the page. To the group, not
  // to a control in it: Enter still held from choosing would submit the form.
  useEffect(() => {
    if (sku) details.current?.focus();
  }, [sku]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || sku) return [];
    return (inventory ?? [])
      .filter((i) => i.sku.toLowerCase().includes(q) || (i.name ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [inventory, query, sku]);

  const item = (inventory ?? []).find((i) => i.sku === sku) ?? null;
  // Where this product already sits at the branch, from the bin map.
  const current = useMemo(() => {
    const mine = (rows ?? []).filter((r) => r.sku === sku);
    return {
      primary: mine.find((r) => r.slot === 'primary')?.bin ?? null,
      overflow: mine.find((r) => r.slot === 'overflow')?.bin ?? null,
    };
  }, [rows, sku]);
  const hereAs = sameBox(current.primary, code) ? 'primary' : sameBox(current.overflow, code) ? 'overflow' : null;
  // Default to a free slot; the person can still choose otherwise.
  const defaultSlot = !current.primary ? 'primary' : !current.overflow ? 'overflow' : 'primary';
  const slot = hereAs ?? slotChoice ?? defaultSlot;
  const occupiedBy = hereAs ? null : current[slot];
  const replaceKey = occupiedBy ? `${slot}:${occupiedBy}` : null;
  const replace = !!replaceKey && replaceFor === replaceKey;

  // What is on hand, and how much of it has no location at all: only that
  // part of on-hand stock is something a put-away records.
  const summary = useQuery({
    queryKey: ['stock-location-summary', sku],
    queryFn: () => api.stock.locationSummary(sku),
    enabled: !!sku,
  });
  const total = summary.data?.total_on_hand ?? 0;
  const unlocated = Math.max(0, summary.data?.unlocated ?? 0);

  // A quantity is asked for only where it means something: new stock, or
  // on-hand stock that has no location yet.
  const asksQuantity = isNew || unlocated > 0;
  const most = isNew ? MAX_QTY : Math.min(unlocated, MAX_QTY);
  const qtyValid = !asksQuantity || quantity === '' || wholeNumber(quantity, 0, most);
  const qty = asksQuantity && quantity !== '' && qtyValid ? Number(quantity) : 0;
  const maxValid = maxQty === '' || wholeNumber(maxQty, 1, MAX_QTY);
  const ready = !!sku && qtyValid && maxValid && (!occupiedBy || replace);

  // The quantity field can go while it is in use (the last unlocated units
  // were placed from elsewhere). Its number goes with it, and the keyboard is
  // not left on the page.
  useEffect(() => {
    if (asksQuantity) return;
    setQuantity('');
    if (document.activeElement === document.body) details.current?.querySelector('input[name="pa-source"]:checked')?.focus();
  }, [asksQuantity]);

  const save = useMutation({
    // Not queued while offline: a stock change must not fire by itself, later.
    networkMode: 'always',
    mutationFn: ({ body }) => api.stock.putAway(body),
    // Reported from what the server did — not from the form, which may have
    // moved on, and not from what was asked, which it may have capped.
    onSuccess: (saved, { body, name }) => {
      for (const key of affected(branch)) queryClient.invalidateQueries({ queryKey: key });
      onDone({ sku: body.sku, name, placed: saved?.placed_unlocated ?? 0, change: saved?.on_hand_change ?? 0 });
    },
    onError: (error, { body, name }) => {
      // Refused because the slot was taken since this screen loaded: fetch
      // the map again so the form can offer to replace it.
      if (error?.status === 409) queryClient.invalidateQueries({ queryKey: ['bin-map', branch] });
      // The form has gone (another box, the panel closed, another screen) or
      // is about to (signed out: the sign-in page replaces it before it can
      // show anything): say it where a success would have been said.
      if (!mounted.current || error?.status === 401) notify(`Couldn't add ${name || body.sku} to ${code}: ${error?.message || String(error)}`, { type: 'error' });
    },
  });

  // Saving disables the control that had focus, which drops the keyboard on
  // the page. After a refusal, put it back — on the Replace choice if that is
  // what the refusal brought — but never take it from where the person went.
  useEffect(() => {
    if (!save.isError) return;
    const at = document.activeElement;
    if (at && at !== document.body && !at.matches(':disabled')) return;
    [replaceBox.current, lastFocus.current].find(usable)?.focus();
  }, [save.isError, occupiedBy]);

  const submit = () => {
    lastFocus.current = document.activeElement;
    // The slot asked for is now a choice, even if it was only the default: if
    // the server refuses it as taken, the form must not drift to the other one.
    setSlotChoice(slot);
    save.mutate({
      name: item?.name,
      body: {
        branch, bin: code, sku, slot, quantity: qty, new_stock: isNew,
        // Which bin the tick was for, so the server can refuse if the slot
        // holds a different one by now.
        replace, replace_bin: replace ? occupiedBy : null,
        max_qty: maxQty === '' ? null : Number(maxQty),
        reason: reason.trim() || null,
      },
    });
  };
  const chooseSource = (next) => { setIsNew(next); setQuantity(''); };
  const changeProduct = () => {
    setSku(null);
    setSlotChoice(null);
    setReplaceFor(null);
    chooseSource(false);
    // A refusal was about the product that has just been put aside.
    save.reset();
  };

  return (
    <form
      aria-label={`Add stock to ${code}`}
      onSubmit={(e) => { e.preventDefault(); if (ready && !save.isPending) submit(); }}
      style={{ display: 'grid', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${T.hairline}`, background: T.panelAlt }}
    >
      <div style={{ fontWeight: 700, fontSize: T.fsBase, color: T.text }}>Add stock to {code}</div>

      {/* Nothing can be changed while the server is deciding: what it saves
          must be what the form shows. */}
      <fieldset disabled={save.isPending} style={{ ...plain, display: 'grid', gap: 12 }}>
        <div>
          <label htmlFor="pa-product" style={label}>Product</label>
          {sku ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: T.text }}>{item?.name || sku}</div>
                <div style={{ fontFamily: T.fontMono, fontSize: T.fsSmall, color: T.textMuted }}>{sku}</div>
              </div>
              <Button variant="ghost" onClick={changeProduct}>Change</Button>
            </div>
          ) : (
            <>
              <input id="pa-product" type="search" autoFocus style={field} value={query}
                onChange={(e) => setQuery(e.target.value)} placeholder="SKU or product name" autoComplete="off" />
              {matches.length > 0 && (
                <ul aria-label="Matching products" style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, border: `1px solid ${T.hairline}`, borderRadius: T.radiusField, background: T.panel, maxHeight: 220, overflowY: 'auto' }}>
                  {matches.map((m) => (
                    <li key={m.sku}>
                      <button type="button" onClick={() => setSku(m.sku)}
                        style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '6px 8px', cursor: 'pointer', fontFamily: T.font, color: T.text }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = T.hairlineSoft; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                        <span style={{ fontFamily: T.fontMono, fontWeight: 700, fontSize: T.fsSmall }}>{m.sku}</span>
                        <span style={{ color: T.textMuted, fontSize: T.fsSmall }}> · {m.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.trim() && matches.length === 0 && (
                <p style={{ ...note, marginTop: 4 }}>No product matches “{query.trim()}”.</p>
              )}
            </>
          )}
        </div>

        {sku && (
          <div ref={details} tabIndex={-1} role="group" aria-label={`${item?.name || sku} into ${code}`}
            style={{ display: 'grid', gap: 12, outline: 'none' }}>
            <p style={note}>
              At {branch}: primary bin {current.primary ?? '—'} · overflow bin {current.overflow ?? '—'}
            </p>
            {hereAs ? (
              <p style={{ ...note, color: T.text }}>Already in this box — its {hereAs} bin.</p>
            ) : (
              <fieldset style={plain}>
                <legend style={label}>This box becomes its</legend>
                <div style={{ display: 'flex', gap: 16 }}>
                  {['primary', 'overflow'].map((s) => (
                    <label key={s} style={choice}>
                      <input type="radio" name="pa-slot" value={s} checked={slot === s} onChange={() => { setSlotChoice(s); setReplaceFor(null); }} />
                      {s === 'primary' ? 'Primary bin' : 'Overflow bin'}
                    </label>
                  ))}
                </div>
                {/* Ticking it also fixes the slot, so the agreement cannot drift to the other one. */}
                {occupiedBy && (
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 8, fontSize: T.fsSmall, color: T.warn }}>
                    <input ref={replaceBox} type="checkbox" checked={replace} style={{ marginTop: 2 }}
                      onChange={(e) => { if (e.target.checked) setSlotChoice(slot); setReplaceFor(e.target.checked ? replaceKey : null); }} />
                    Its {slot} bin is {occupiedBy}. Replace it with {code}.
                  </label>
                )}
              </fieldset>
            )}

            <fieldset style={plain}>
              <legend style={label}>Stock going in</legend>
              <div style={{ display: 'grid', gap: 4 }}>
                <label style={choice}>
                  <input type="radio" name="pa-source" checked={!isNew} onChange={() => chooseSource(false)} />
                  Already on hand
                </label>
                <label style={choice}>
                  <input type="radio" name="pa-source" checked={isNew} onChange={() => chooseSource(true)} />
                  New stock, not counted yet
                </label>
              </div>
            </fieldset>

            {asksQuantity && (
              <div>
                <label htmlFor="pa-qty" style={label}>
                  {isNew ? 'New stock to add' : `How many of the ${fmt(unlocated)} with no location go in this box`}
                </label>
                <input id="pa-qty" type="number" min={0} max={most} step={1} style={{ ...field, maxWidth: 140 }}
                  value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
              </div>
            )}
            {!qtyValid && (
              <p role="alert" style={{ ...note, color: T.danger }}>
                {isNew && `New stock must be a whole number from 0 to ${fmt(MAX_QTY)}.`}
                {!isNew && unlocated <= MAX_QTY && `Only ${fmt(unlocated)} have no location: enter a whole number from 0 to ${fmt(unlocated)}.`}
                {!isNew && unlocated > MAX_QTY && `${fmt(unlocated)} have no location, and one put-away records up to ${fmt(MAX_QTY)}: enter a whole number from 0 to ${fmt(MAX_QTY)}.`}
              </p>
            )}
            {summary.isError && (
              <p style={note}>Couldn't load this product's on-hand figure; the confirmation will say what happened to the total.</p>
            )}
            {summary.data && qtyValid && (
              <p style={{ ...note, color: T.text }}>
                {isNew && qty > 0 && `Adds ${fmt(qty)} to the total on hand (${fmt(total)} → ${fmt(total + qty)}).`}
                {isNew && qty === 0 && 'Enter how many units are new. Stock that was received or counted before is already on hand.'}
                {!isNew && unlocated === 0 && `Stock on hand is counted per branch, not per box: this records the box, and the total on hand stays at ${fmt(total)}.`}
                {!isNew && unlocated > 0 && qty > 0 && `Records ${fmt(qty)} of them at ${branch}. Total on hand stays at ${fmt(total)}.`}
                {!isNew && unlocated > 0 && qty === 0 && `${fmt(unlocated)} on hand have no location yet. Leave this empty to only record the box.`}
              </p>
            )}

            <div style={{ maxWidth: 140 }}>
              <label htmlFor="pa-max" style={label}>Box holds up to (optional)</label>
              <input id="pa-max" type="number" min={1} max={MAX_QTY} step={1} style={field} value={maxQty} onChange={(e) => setMaxQty(e.target.value)} />
            </div>
            {!maxValid && <p role="alert" style={{ ...note, color: T.danger }}>“Box holds up to” must be a whole number from 1 to {fmt(MAX_QTY)}, or left empty.</p>}

            <div>
              <label htmlFor="pa-reason" style={label}>Note (optional)</label>
              <input id="pa-reason" style={field} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={`Put away into ${code}`} />
            </div>
          </div>
        )}
      </fieldset>

      {save.error && (
        <p role="alert" style={{ ...note, color: T.danger }}>
          Couldn't add the stock: {save.error.message || String(save.error)}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {/* Not while saving: the request is already on its way, and closing
            the form would only look like it had been called off. */}
        <Button variant="ghost" onClick={onCancel} disabled={save.isPending}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={!ready || save.isPending}>
          {save.isPending ? 'Saving…' : qty === 0 ? `Slot into ${code}` : isNew ? `Add ${fmt(qty)} to ${code}` : `Put ${fmt(qty)} into ${code}`}
        </Button>
      </div>
    </form>
  );
}

import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminSettings, stock } from '../../../api';
import { BRANCHES } from '../../../branches';
import Button from '../../../ui/Button';
import { T } from '../../../ui/tokens';
import { parseBin } from '../../../lib/binLocation';
import BinField from '../../warehouse/BinField';
import { validateLayout } from '../../warehouse/layout';
import { MAX_BIN_QTY, MAX_ZONE_LENGTH, rowProblems, storedBinProblems } from '../locationRules';
import StockHistoryPanel from './StockHistoryPanel';

/**
 * Every branch, every time — the way the live system shows it.
 *
 * The grid used to list only the branches that already had a record, so a SKU
 * with stock at one branch showed one row and there was no way to say where it
 * sits anywhere else. Jim2 lists all of them and you fill in the ones that
 * apply, which also means "no bin here" and "no record here" stop looking the
 * same.
 *
 * Editing is behind a mode rather than always-on. A stock position is what
 * every price and every pick reads from; a grid of live inputs invites a
 * mistyped bin from someone who only came to look.
 *
 * A bin is a real box in the branch's racking (locationRules.js; the server
 * holds the same rule). One that is not cannot be saved, and the grid says
 * exactly what is wrong with it. Bins already on file from before that was
 * checked are flagged, in both modes, until they are re-slotted.
 */

const CAN_EDIT = ['admin', 'manager'];

const HEAD = [
  { label: 'Line', width: 40, align: 'right' },
  { label: 'Branch', width: 110 },
  { label: 'Zone', width: 70 },
  { label: 'Primary Bin 1', width: 130 },
  { label: 'Max Qty 1', width: 80, align: 'right' },
  { label: 'Primary Bin 2', width: 130 },
  { label: 'Max Qty 2', width: 80, align: 'right' },
  { label: 'On Hand', width: 80, align: 'right' },
  { label: 'Available', width: 80, align: 'right' },
];

const num = (v) => Number(v || 0).toLocaleString('en-AU');
const blank = { zone: '', primary_bin_1: '', max_qty_bin_1: '', primary_bin_2: '', max_qty_bin_2: '' };
const asInt = (v) => (v === '' || v == null ? null : Number(v));
const text = (v) => (v == null ? '' : String(v));

/** One editable row's worth of the record, as strings the inputs can hold. */
const toDraft = (loc) =>
  loc
    ? {
        zone: text(loc.zone),
        primary_bin_1: text(loc.primary_bin_1),
        max_qty_bin_1: text(loc.max_qty_bin_1),
        primary_bin_2: text(loc.primary_bin_2),
        max_qty_bin_2: text(loc.max_qty_bin_2),
      }
    : { ...blank };

function Figure({ label, value, tone }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontSize: 10, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: T.fsGrid, fontWeight: 700, color: tone ?? T.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </span>
  );
}

const cell = (width, align) => ({
  width, flex: `0 0 ${width}px`, padding: '0 6px',
  display: 'flex', alignItems: 'center',
  justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
  fontSize: T.fsGrid, overflow: 'hidden', whiteSpace: 'nowrap',
});

const inputBox = (wrong) => ({
  width: '100%', height: 22, fontSize: T.fsGrid, padding: '0 5px', borderRadius: T.radius - 1,
  background: T.panel, color: T.text, border: `1px solid ${wrong ? T.danger : T.hairline}`, outline: 'none',
});

function BinInput({ value, onValue, layout, placeholder, name, problem }) {
  const parsed = parseBin(value.trim());
  return (
    // Offers the real boxes what is typed could become, and shows it in
    // capitals while it leads to one (BinField).
    <BinField
      value={value}
      onValue={onValue}
      layout={layout}
      placeholder={placeholder}
      aria-label={name}
      aria-invalid={problem ? true : undefined}
      maxLength={50}
      title={problem
        ?? (parsed ? `Aisle ${parsed.aisle} · Bay ${parsed.bay} · Level ${parsed.level} · Position ${parsed.position}` : undefined)}
      style={{ ...inputBox(problem), fontFamily: T.fontMono }}
    />
  );
}

function NumInput({ value, onChange, name, problem }) {
  return (
    <input
      type="number" min="0" max={MAX_BIN_QTY} step="1" value={value} onChange={onChange}
      aria-label={name}
      aria-invalid={problem ? true : undefined}
      title={problem ?? undefined}
      style={{ ...inputBox(problem), textAlign: 'right' }}
    />
  );
}

const layoutKey = (branch) => `warehouse_layout:${branch}`;

export default function StockLocationsTab({ sku, currentUser }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [showHistory, setShowHistory] = useState(false);

  const canEdit = CAN_EDIT.includes(currentUser?.role);

  const { data, error, refetch } = useQuery({
    queryKey: ['stock-locations', sku],
    queryFn: () => stock.locations(sku),
  });
  // Reconciliation against the item total. Stock received before location
  // tracking has no branch, so it shows as unlocated rather than being
  // quietly assigned somewhere it isn't.
  const { data: summary } = useQuery({
    queryKey: ['stock-location-summary', sku],
    queryFn: () => stock.locationSummary(sku),
  });

  const byBranch = Object.fromEntries((data || []).map((l) => [l.branch, l]));
  // Any branch holding stock under a name no longer in the list still has to
  // appear, or its stock becomes invisible rather than merely misfiled.
  const extra = (data || []).map((l) => l.branch).filter((b) => !BRANCHES.includes(b));
  const rows = [...BRANCHES, ...extra];

  // The racking each branch has: for every branch while editing (a bin field
  // offers the boxes that exist as soon as a letter is typed), otherwise for
  // the ones with a bin on file to judge. Until a branch's layout has arrived
  // only the shape of its codes is judged — the server has the last word.
  const judged = editing ? rows : rows.filter((b) => byBranch[b]?.primary_bin_1 || byBranch[b]?.primary_bin_2);
  const layouts = useQueries({
    queries: judged.map((branch) => ({
      queryKey: ['admin-setting', layoutKey(branch)],
      queryFn: () => adminSettings.get(layoutKey(branch)),
      staleTime: 300_000,
    })),
  });
  const layoutOf = (branch) => {
    const found = layouts[judged.indexOf(branch)];
    return found?.isSuccess ? validateLayout(found.data?.value).layout : null;
  };

  const save = useMutation({
    mutationFn: async (pending) => {
      // Sequential, not parallel: each branch is a separate record and a
      // partial failure should stop rather than leave an unknown subset saved.
      for (const [branch, draft] of pending) {
        const payload = {
          zone: draft.zone.trim() || null,
          primary_bin_1: draft.primary_bin_1.trim() || null,
          max_qty_bin_1: asInt(draft.max_qty_bin_1),
          primary_bin_2: draft.primary_bin_2.trim() || null,
          max_qty_bin_2: asInt(draft.max_qty_bin_2),
        };
        if (byBranch[branch]) await stock.updateLocation(sku, branch, payload);
        else await stock.addLocation(sku, { branch, ...payload });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-locations', sku] });
      qc.invalidateQueries({ queryKey: ['stock-location-summary', sku] });
      qc.invalidateQueries({ queryKey: ['stock-history', sku] });
      // The warehouse map draws these bins, and its Add stock form offers to
      // replace the ones it knows about.
      qc.invalidateQueries({ queryKey: ['bin-map'] });
      setEditing(false);
      setDrafts({});
    },
  });

  const startEditing = () => { save.reset(); setDrafts({}); setEditing(true); };

  const cancel = () => { setEditing(false); setDrafts({}); };

  // A row shows its stored values until somebody types into it. Snapshotting
  // every row when Edit was pressed meant a grid that had not finished loading
  // captured blanks, and saving then cleared every record it had not yet seen.
  const draftFor = (branch) => drafts[branch] ?? toDraft(byBranch[branch]);

  const setValue = (branch, field) => (value) => {
    setDrafts((d) => ({ ...d, [branch]: { ...(d[branch] ?? toDraft(byBranch[branch])), [field]: value } }));
  };
  const setField = (branch, field) => (e) => setValue(branch, field)(e.target.value);

  // Only rows that were typed into, and only those whose values actually
  // moved — typing a character and deleting it again is not an edit.
  const pending = Object.entries(drafts).filter(
    ([branch, draft]) => JSON.stringify(draft) !== JSON.stringify(toDraft(byBranch[branch])),
  );
  // What stops each of those being saved. Rows nobody changed are not judged:
  // an old bin on one of them is flagged below, not a reason to block others.
  const problems = Object.fromEntries(pending.map(([branch, draft]) => [branch, rowProblems(layoutOf(branch), draft, byBranch[branch])]));
  const blocked = Object.entries(problems).filter(([, list]) => list.length > 0);
  const wrong = (branch, field) => problems[branch]?.find((p) => p.field === field)?.text;
  // Bins on file that are not boxes in their branch's racking.
  const onFile = rows.flatMap((branch) => storedBinProblems(layoutOf(branch), byBranch[branch]).map((p) => ({ ...p, branch })));
  const flagged = (branch, field) => onFile.find((p) => p.branch === branch && p.field === field);

  const submit = () => {
    if (blocked.length) return;
    if (!pending.length) { cancel(); return; }
    save.mutate(pending);
  };

  const unlocated = summary ? summary.unlocated : 0;
  const short = unlocated > 0;
  const over = unlocated < 0;

  return (
    <div style={{ fontFamily: T.font }}>
      {summary && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          padding: '6px 10px', marginBottom: 8,
          border: `1px solid ${short || over ? T.accentStrong : T.hairline}`,
          borderLeft: `3px solid ${short ? T.accent : over ? T.danger : T.ok}`,
          borderRadius: T.radius, background: T.hairlineSoft,
        }}>
          <Figure label="On hand" value={num(summary.total_on_hand)} />
          <Figure label="In branches" value={num(summary.located)} />
          {short && (
            <Figure label="Not yet located" value={num(unlocated)} tone={T.accentStrong} />
          )}
          {over && (
            <Figure label="Over-allocated" value={num(Math.abs(unlocated))} tone={T.danger} />
          )}
          <span style={{ fontSize: 10.5, color: T.textMuted, marginLeft: 'auto' }}>
            {short
              ? 'Received before branch tracking — put it away to place it.'
              : over
                ? 'Branches hold more than the item total — needs a stocktake.'
                : 'Every unit is accounted for by branch.'}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? 'Hide history' : 'History'}
        </Button>
        {editing ? (
          <>
            <Button size="sm" variant="ghost" onClick={cancel} disabled={save.isPending}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={submit} disabled={save.isPending || blocked.length > 0}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </>
        ) : (
          // Absent rather than disabled: a control nobody in this role can ever
          // use is noise, and the tooltip on a disabled button is not read.
          // Not offered until the grid has loaded: there is nothing to edit
          // yet, and a save from an empty grid would be a save of blanks.
          canEdit && data && <Button size="sm" onClick={startEditing}>Edit</Button>
        )}
      </div>

      {!canEdit && !editing && (
        <div style={{ fontSize: 10.5, color: T.textFaint, marginBottom: 6 }}>
          Read-only — changing a stock position needs the admin or manager role.
        </div>
      )}

      {save.error && (
        <div role="alert" style={{ fontSize: T.fsSmall, color: T.danger, marginBottom: 6 }}>
          {save.error.message || 'Could not save locations'}
        </div>
      )}

      {editing && blocked.length > 0 && (
        <ul role="alert" aria-label="What has to be fixed before saving" style={{ listStyle: 'none', margin: '0 0 6px', padding: 0, fontSize: T.fsSmall, color: T.danger }}>
          {blocked.flatMap(([branch, list]) => list.map((p) => (
            <li key={`${branch}:${p.field}:${p.text}`}><strong>{branch}</strong> · {p.text}</li>
          )))}
        </ul>
      )}

      {onFile.length > 0 && (
        <p style={{ margin: '0 0 6px', fontSize: T.fsSmall, color: T.warn }}>
          {onFile.length === 1 ? 'One bin on file is' : `${onFile.length} bins on file are`} not a box in the racking:{' '}
          {onFile.map((p) => `${p.branch} ${p.value}`).join(', ')}.
          {canEdit ? ' Edit to re-slot or clear.' : ''}
        </p>
      )}

      {error ? (
        <div style={{ fontSize: T.fsSmall, color: T.danger, padding: 8 }}>
          {error.message || 'Failed to load locations'}{' '}
          <button type="button" onClick={refetch} style={{ textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: T.accentStrong }}>Retry</button>
        </div>
      ) : (
        <div role="table" style={{ border: `1px solid ${T.hairline}`, borderRadius: T.radius, overflowX: 'auto' }}>
          <div role="row" style={{ display: 'flex', height: 27, borderBottom: `1px solid ${T.hairline}`, background: T.hairlineSoft }}>
            {HEAD.map((h) => (
              <div role="columnheader" key={h.label} style={{
                ...cell(h.width, h.align), fontWeight: 700, fontSize: 11,
                color: T.headerText, textTransform: 'uppercase', letterSpacing: '0.03em',
              }}>{h.label}</div>
            ))}
          </div>
          {rows.map((branch, i) => {
            const loc = byBranch[branch];
            const draft = draftFor(branch);
            return (
              <div role="row" key={branch} style={{
                display: 'flex', height: editing ? 30 : 27,
                borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${T.hairlineSoft}`,
                background: loc ? undefined : T.hairlineSoft,
              }}>
                <div role="cell" style={{ ...cell(40, 'right'), color: T.textFaint }}>{i + 1}</div>
                <div role="cell" style={{ ...cell(110), fontWeight: loc ? 600 : 400, color: loc ? T.text : T.textMuted }}>{branch}</div>
                {editing && draft ? (
                  <>
                    <div role="cell" style={cell(70)}>
                      <input value={draft.zone} onChange={setField(branch, 'zone')} aria-label={`${branch} zone`} maxLength={MAX_ZONE_LENGTH}
                        style={inputBox(wrong(branch, 'zone'))} />
                    </div>
                    <div role="cell" style={cell(130)}>
                      <BinInput value={draft.primary_bin_1} onValue={setValue(branch, 'primary_bin_1')} layout={layoutOf(branch)} placeholder="B.3.H.1"
                        name={`${branch} primary bin 1`} problem={wrong(branch, 'primary_bin_1')} />
                    </div>
                    <div role="cell" style={cell(80, 'right')}>
                      <NumInput value={draft.max_qty_bin_1} onChange={setField(branch, 'max_qty_bin_1')}
                        name={`${branch} max qty 1`} problem={wrong(branch, 'max_qty_bin_1')} />
                    </div>
                    <div role="cell" style={cell(130)}>
                      <BinInput value={draft.primary_bin_2} onValue={setValue(branch, 'primary_bin_2')} layout={layoutOf(branch)} placeholder="Overflow"
                        name={`${branch} primary bin 2`} problem={wrong(branch, 'primary_bin_2')} />
                    </div>
                    <div role="cell" style={cell(80, 'right')}>
                      <NumInput value={draft.max_qty_bin_2} onChange={setField(branch, 'max_qty_bin_2')}
                        name={`${branch} max qty 2`} problem={wrong(branch, 'max_qty_bin_2')} />
                    </div>
                  </>
                ) : (
                  <>
                    <div role="cell" style={cell(70)}>{loc?.zone || ''}</div>
                    <div role="cell" title={flagged(branch, 'primary_bin_1')?.text ? `“${loc.primary_bin_1}” ${flagged(branch, 'primary_bin_1').text}` : undefined}
                      style={{ ...cell(130), fontFamily: T.fontMono, color: flagged(branch, 'primary_bin_1') ? T.warn : undefined }}>{loc?.primary_bin_1 || ''}</div>
                    <div role="cell" style={cell(80, 'right')}>{loc?.max_qty_bin_1 ?? ''}</div>
                    <div role="cell" title={flagged(branch, 'primary_bin_2')?.text ? `“${loc.primary_bin_2}” ${flagged(branch, 'primary_bin_2').text}` : undefined}
                      style={{ ...cell(130), fontFamily: T.fontMono, color: flagged(branch, 'primary_bin_2') ? T.warn : undefined }}>{loc?.primary_bin_2 || ''}</div>
                    <div role="cell" style={cell(80, 'right')}>{loc?.max_qty_bin_2 ?? ''}</div>
                  </>
                )}
                <div role="cell" style={{ ...cell(80, 'right'), fontVariantNumeric: 'tabular-nums' }}>{loc ? num(loc.qty_on_hand) : ''}</div>
                <div role="cell" style={{ ...cell(80, 'right'), fontVariantNumeric: 'tabular-nums' }}>{loc ? num(loc.available_qty) : ''}</div>
              </div>
            );
          })}
        </div>
      )}

      {showHistory && <StockHistoryPanel sku={sku} />}
    </div>
  );
}

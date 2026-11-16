/**
 * Warehouse — the racking in 3D, from the real bin data.
 *
 * Layout (aisles, bays, levels, boxes) is an admin setting per branch; what is
 * in each box comes from GET /inventory/bin-map. Bins whose codes do not fit
 * the racking are listed, never silently dropped. The 3D scene is loaded on
 * demand so three.js costs nothing until this screen opens.
 */
import { Suspense, lazy, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, RotateCcw, Settings2 } from 'lucide-react';
import { notify } from '../../lib/notify';
import * as api from '../../api';
import { BRANCHES, DEFAULT_BRANCH } from '../../branches';
import { T } from '../../ui/tokens';
import Button from '../../ui/Button';
import { LEVEL_LETTERS, binPlacement, frontView, levelCount, validateLayout } from './layout';
import { binStates, matchBins } from './occupancy';
import { SearchPanel, BinPanel } from './WarehousePanels';
import LayoutDialog from './LayoutDialog';
import WalkControls from './WalkControls';
import { MarkSectionForm, SectionList } from './SectionPanels';
import { sectionBetween, sectionColors, sectionFor, sectionShape, sectionSpot, sectionWords } from './sections';

const Warehouse3D = lazy(() => import('./Warehouse3D'));

const layoutKey = (branch) => `warehouse_layout:${branch}`;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

function Facet({ label, value, tone, active, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      style={{
        textAlign: 'left', border: `1px solid ${active ? T.accentStrong : T.hairline}`, borderRadius: T.radius,
        background: active ? T.accentTint : T.panel, padding: '6px 12px', cursor: 'pointer', minWidth: 120, fontFamily: T.font,
      }}>
      <div style={{ fontSize: T.fsSmall, color: T.textMuted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tone ?? T.text, fontVariantNumeric: 'tabular-nums' }}>{value.toLocaleString('en-AU')}</div>
    </button>
  );
}

// The keys that walk an aisle, while one is being walked.
const WALK_KEYS = { ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right', PageUp: 'up', PageDown: 'down' };

const HINTS = {
  map: {
    mouse: 'Drag to move · right-drag to turn · scroll to zoom · click a box to face it · click an aisle’s blue line to walk it',
    touch: 'Drag to move · two fingers to turn · pinch to zoom · tap a box to face it · tap an aisle’s blue line to walk it',
  },
  walk: {
    mouse: 'Drag to look round · scroll or ↑ ↓ to walk · ← → to turn · click a box to face it · Esc to leave',
    touch: 'Drag to look round · tap further along the line to walk · tap a box to face it',
  },
};

function Notice({ children, tone = T.textMuted }) {
  return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tone, fontSize: T.fsBase, padding: 24, textAlign: 'center' }}>{children}</div>;
}

// A section being marked starts as the usual one: whole bays, floor to top.
const NEW_MARK = { from: '', to: '', wholeBays: true, allLevels: true };

export default function WarehouseModule({ currentUser, onOpenSku, inventory, customers }) {
  const queryClient = useQueryClient();
  const [branch, setBranch] = useState(DEFAULT_BRANCH);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [pickCount, setPickCount] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [offMapOpen, setOffMapOpen] = useState(false);
  // An aisle being walked: where the walk was last sent, and the racking it
  // was sent in — a walk does not outlive the layout it started on.
  const [walking, setWalking] = useState(null);
  // The walk controls pressed, oldest first. A list, not "the last one": the
  // scene renders separately, and two presses before its next render would
  // otherwise reach it as one.
  const [nudges, setNudges] = useState([]);
  // Where the scene says the walk has got to: `{ aisleIndex, bays }`.
  const [walkAt, setWalkAt] = useState(null);
  // A section being marked for a company: the two corners entered so far.
  const [mark, setMark] = useState(null);
  const webgl = useMemo(hasWebGL, []);
  // Which gestures to name in the hint: a touch screen has no right-drag or scroll.
  const touchFirst = useMemo(() => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches, []);
  const isAdmin = currentUser?.role === 'admin';
  // Putting stock into a box edits the stock position, which is admin or
  // manager work (the same gate as the Locations tab).
  const canEdit = ['admin', 'manager'].includes(currentUser?.role);

  const layoutQuery = useQuery({
    queryKey: ['admin-setting', layoutKey(branch)],
    queryFn: () => api.adminSettings.get(layoutKey(branch)),
    staleTime: 300_000,
  });
  const binsQuery = useQuery({
    queryKey: ['bin-map', branch],
    queryFn: () => api.stock.binMap(branch),
    staleTime: 30_000,
  });
  // Racking marked for a company. An overlay on the map: if it cannot be
  // loaded the racking is still shown, and the list says so.
  const sectionsQuery = useQuery({
    queryKey: ['rack-sections', branch],
    queryFn: () => api.rackSections.list(branch),
    staleTime: 30_000,
  });
  const saveLayout = useMutation({
    mutationFn: (layout) => api.adminSettings.set(layoutKey(branch), JSON.stringify(layout)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-setting', layoutKey(branch)] }),
  });

  const { layout, errors: layoutErrors } = useMemo(() => validateLayout(layoutQuery.data?.value), [layoutQuery.data]);
  const rows = useMemo(() => binsQuery.data?.bins ?? [], [binsQuery.data]);
  const sections = useMemo(() => sectionsQuery.data?.sections ?? [], [sectionsQuery.data]);
  const colors = useMemo(() => sectionColors(sections), [sections]);
  // One corner is a section of that box (or its bay); the second stretches it.
  const draft = useMemo(() => (
    mark?.from.trim() ? sectionBetween(layout, mark.from, mark.to.trim() ? mark.to : mark.from, mark) : null
  ), [mark, layout]);

  const { onMap, offMap } = useMemo(() => {
    const on = [];
    const off = [];
    for (const r of rows) {
      const p = binPlacement(layout, r.bin);
      if (p.ok) on.push({ ...r, bin: p.code });
      else off.push({ ...r, reason: p.reason });
    }
    return { onMap: on, offMap: off };
  }, [rows, layout]);

  const bins = useMemo(() => binStates(onMap), [onMap]);
  const hits = useMemo(() => matchBins(onMap, query), [onMap, query]);
  const results = useMemo(() => [...hits].sort().map((code) => {
    const skus = bins.get(code)?.skus ?? [];
    return { code, label: skus.map((s) => s.name || s.sku).join(', ') };
  }), [hits, bins]);

  const counts = useMemo(() => {
    const c = { stocked: 0, empty: 0, over: 0 };
    for (const b of bins.values()) c[b.state] += 1;
    return c;
  }, [bins]);
  const totalBoxes = layout.aisles.length * layout.baysPerAisle * levelCount(layout) * layout.positions;

  // Stable between renders: a new object here re-ran the camera's fly-to on
  // every data refresh or keystroke, dragging the view back to the box.
  const placement = useMemo(() => (selected ? binPlacement(layout, selected) : null), [selected, layout]);
  const focus = useMemo(() => {
    // pickCount is part of the memo so picking the same box again, after the
    // view has been moved away, faces it again.
    void pickCount;
    return placement?.ok ? frontView(layout, placement) : null;
  }, [placement, layout, pickCount]);
  const pick = (code) => {
    // While a section is being marked, a box picked is one of its corners:
    // the first, then the opposite one (and again, to move that one).
    if (mark) setMark((m) => (m.from.trim() ? { ...m, to: code } : { ...m, from: code }));
    else { setSelected(code); setPickCount((n) => n + 1); }
  };
  const toggle = (f) => setFilter((cur) => (cur === f ? 'all' : f));

  const walk = walking?.layout === layout ? walking.at : null;
  // `z` is where on the line (without it, the line's receiving end); `side`
  // the rack to turn and face there.
  const startWalk = (aisleIndex, z, side) => {
    setWalking({ layout, at: { aisleIndex, z, side } });
    // Said at once for another aisle; the scene says which bays when it gets there.
    setWalkAt((at) => (at?.aisleIndex === aisleIndex ? at : { aisleIndex, bays: null }));
  };
  // A section is seen from its aisle, facing it — there is nowhere further back to stand.
  const showSection = (section) => {
    const shape = sectionShape(layout, section);
    if (!shape) return;
    const spot = sectionSpot(layout, shape);
    startWalk(spot.aisleIndex, spot.z, spot.side);
  };
  const leaveWalk = () => { setWalking(null); setWalkAt(null); };
  const press = (kind) => setNudges((list) => [...list.slice(-31), { kind, id: (list[list.length - 1]?.id ?? 0) + 1 }]);
  // The aisle the eye is in: a box picked in another aisle takes the walk there.
  const walkAisle = walk ? walkAt?.aisleIndex ?? walk.aisleIndex : null;
  const walkKeys = (e) => {
    if (!walk || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') leaveWalk();
    else if (WALK_KEYS[e.key]) press(WALK_KEYS[e.key]);
    else return;
    // An arrow that walks must not also scroll the page.
    e.preventDefault();
  };

  const boxSection = placement?.ok ? sectionFor(sections, placement) : null;

  const loading = layoutQuery.isLoading || binsQuery.isLoading;
  const failed = layoutQuery.error || binsQuery.error;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)', minHeight: 520, background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg, overflow: 'hidden', fontFamily: T.font }}>
      <header style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${T.hairline}`, boxShadow: T.shadowHeader }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Boxes size={20} aria-hidden style={{ color: T.accentStrong }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.text }}>Warehouse</h1>
            <p style={{ margin: 0, fontSize: T.fsSmall, color: T.textMuted }}>
              {layout.aisles.length} aisles · {layout.baysPerAisle} bays each · levels A–{LEVEL_LETTERS[levelCount(layout) - 1]} on {layout.beams.length} beams · {layout.positions} boxes per level
            </p>
          </div>
          <div style={{ flex: 1 }} />
          <label htmlFor="wh-branch" style={{ fontSize: T.fsSmall, color: T.textMuted }}>Branch</label>
          <select id="wh-branch" value={branch} onChange={(e) => { setBranch(e.target.value); setSelected(null); leaveWalk(); setMark(null); }}
            style={{ height: 28, border: `1px solid ${T.textMuted}`, borderRadius: T.radiusField, fontFamily: T.font, fontSize: T.fsBase, padding: '0 6px', background: T.panel, color: T.text }}>
            {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <Button variant="secondary" onClick={() => { setSelected(null); leaveWalk(); setResetKey((k) => k + 1); }}>
            <RotateCcw size={14} aria-hidden style={{ marginRight: 6, verticalAlign: '-2px' }} />Reset view
          </Button>
          {isAdmin && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Settings2 size={14} aria-hidden style={{ marginRight: 6, verticalAlign: '-2px' }} />Edit layout
            </Button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }} role="group" aria-label="Highlight bins">
          <Facet label="Boxes in the racking" value={totalBoxes} active={filter === 'all'} onClick={() => setFilter('all')} />
          <Facet label="Stock on hand" value={counts.stocked} tone={T.accentStrong} active={filter === 'stocked'} onClick={() => toggle('stocked')} />
          <Facet label="Slotted, none on hand" value={counts.empty} tone={counts.empty ? T.warn : T.text} active={filter === 'empty'} onClick={() => toggle('empty')} />
          <Facet label="Over capacity" value={counts.over} tone={counts.over ? T.danger : T.text} active={filter === 'over'} onClick={() => toggle('over')} />
          {offMap.length > 0 && <Facet label="Not on the map" value={offMap.length} tone={T.warn} active={false} onClick={() => setOffMapOpen(true)} />}
        </div>
        {layoutErrors.length > 0 && (
          <p role="alert" style={{ margin: '8px 0 0', fontSize: T.fsSmall, color: T.warn }}>
            The saved layout for {branch} is invalid ({layoutErrors.join('; ')}), so the default racking is shown.
          </p>
        )}
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <SearchPanel query={query} onQuery={setQuery} results={results} selected={selected} onPick={pick} offMap={offMap} offMapOpen={offMapOpen} onOffMapToggle={setOffMapOpen}>
          {sectionsQuery.isError ? (
            <p role="alert" style={{ fontSize: T.fsSmall, color: T.warn, margin: '14px 0 0' }}>
              Couldn't load the company sections: {sectionsQuery.error?.message || String(sectionsQuery.error)}.{' '}
              <button type="button" onClick={() => sectionsQuery.refetch()} style={{ color: T.accentStrong, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>Try again</button>
            </p>
          ) : sectionsQuery.data && (
            <SectionList layout={layout} sections={sections} colors={colors} branch={branch} canEdit={canEdit} marking={!!mark}
              onShow={showSection} onMark={() => setMark(NEW_MARK)} />
          )}
        </SearchPanel>
        {/* Focusable by a click, not by Tab: a click in the view is what sends the walk keys here. */}
        <main tabIndex={-1} onKeyDown={walkKeys} style={{ flex: 1, minWidth: 0, display: 'flex', position: 'relative', outline: 'none' }}>
          {failed ? (
            <Notice tone={T.danger}>
              Couldn't load the warehouse: {(failed.message || String(failed))}.{' '}
              <button type="button" onClick={() => { layoutQuery.refetch(); binsQuery.refetch(); }} style={{ color: T.accentStrong, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit' }}>Try again</button>
            </Notice>
          ) : loading ? (
            <Notice>Loading the racking…</Notice>
          ) : !webgl ? (
            <Notice>This browser can't draw 3D (WebGL is off). Search and bin details on the left still work.</Notice>
          ) : (
            <>
              <Suspense fallback={<Notice>Loading the 3D view…</Notice>}>
                <Warehouse3D layout={layout} bins={bins} hits={hits} filter={filter} selected={selected} focus={focus} resetKey={resetKey} onSelect={pick}
                  walk={walk} walkAisle={walkAisle} nudges={nudges} onWalk={startWalk} onWalkAt={setWalkAt}
                  sections={sections} sectionColors={colors} draft={draft?.ok ? draft : null} />
              </Suspense>
              <WalkControls layout={layout} walking={!!walk} aisleIndex={walkAisle} bays={walkAt?.bays ?? null} sections={sections}
                onWalk={startWalk} onNudge={press} onLeave={leaveWalk} />
              <p style={{
                position: 'absolute', left: 12, bottom: 12, margin: 0, padding: '4px 10px', pointerEvents: 'none',
                fontSize: T.fsSmall, color: T.textMuted, background: T.panel, border: `1px solid ${T.hairline}`,
                borderRadius: T.radiusField, boxShadow: T.shadowSm,
              }}>
                {HINTS[walk ? 'walk' : 'map'][touchFirst ? 'touch' : 'mouse']}
              </p>
            </>
          )}
        </main>
        {mark ? (
          <MarkSectionForm
            layout={layout} branch={branch} customers={customers} sections={sections} mark={mark} draft={draft}
            onChange={(patch) => setMark((m) => ({ ...m, ...patch }))}
            onCancel={() => setMark(null)}
            onDone={({ name, section }) => {
              setMark(null);
              notify(`Marked for ${name}: ${sectionWords(layout, section)}`, { type: 'success' });
            }}
          />
        ) : placement?.ok && (
          <BinPanel key={placement.code} placement={placement} entry={bins.get(placement.code)} branch={branch} onClose={() => setSelected(null)} onOpenSku={onOpenSku} canEdit={canEdit} inventory={inventory} rows={rows}
            section={boxSection} sectionColor={colors.get(boxSection?.customer_id)} />
        )}
      </div>

      {editing && (
        <LayoutDialog layout={layout} branch={branch} onClose={() => setEditing(false)} onSave={(l) => saveLayout.mutateAsync(l)} />
      )}
    </div>
  );
}

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
import * as api from '../../api';
import { BRANCHES, DEFAULT_BRANCH } from '../../branches';
import { T } from '../../ui/tokens';
import Button from '../../ui/Button';
import { LEVEL_LETTERS, binPlacement, levelCount, validateLayout } from './layout';
import { binStates, matchBins } from './occupancy';
import { SearchPanel, BinPanel } from './WarehousePanels';
import LayoutDialog from './LayoutDialog';

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

function Notice({ children, tone = T.textMuted }) {
  return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tone, fontSize: T.fsBase, padding: 24, textAlign: 'center' }}>{children}</div>;
}

export default function WarehouseModule({ currentUser, onOpenSku }) {
  const queryClient = useQueryClient();
  const [branch, setBranch] = useState(DEFAULT_BRANCH);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [offMapOpen, setOffMapOpen] = useState(false);
  const webgl = useMemo(hasWebGL, []);
  const isAdmin = currentUser?.role === 'admin';

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
  const saveLayout = useMutation({
    mutationFn: (layout) => api.adminSettings.set(layoutKey(branch), JSON.stringify(layout)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-setting', layoutKey(branch)] }),
  });

  const { layout, errors: layoutErrors } = useMemo(() => validateLayout(layoutQuery.data?.value), [layoutQuery.data]);
  const rows = useMemo(() => binsQuery.data?.bins ?? [], [binsQuery.data]);

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

  const placement = selected ? binPlacement(layout, selected) : null;
  const focus = placement?.ok ? { ...placement, layout } : null;
  const pick = (code) => setSelected(code);
  const toggle = (f) => setFilter((cur) => (cur === f ? 'all' : f));

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
          <select id="wh-branch" value={branch} onChange={(e) => { setBranch(e.target.value); setSelected(null); }}
            style={{ height: 28, border: `1px solid ${T.textMuted}`, borderRadius: T.radiusField, fontFamily: T.font, fontSize: T.fsBase, padding: '0 6px', background: T.panel, color: T.text }}>
            {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <Button variant="secondary" onClick={() => { setSelected(null); setResetKey((k) => k + 1); }}>
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
        <SearchPanel query={query} onQuery={setQuery} results={results} selected={selected} onPick={pick} offMap={offMap} offMapOpen={offMapOpen} onOffMapToggle={setOffMapOpen} />
        <main style={{ flex: 1, minWidth: 0, display: 'flex', position: 'relative' }}>
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
            <Suspense fallback={<Notice>Loading the 3D view…</Notice>}>
              <Warehouse3D layout={layout} bins={bins} hits={hits} filter={filter} selected={selected} focus={focus} resetKey={resetKey} onSelect={pick} />
            </Suspense>
          )}
        </main>
        {placement?.ok && (
          <BinPanel placement={placement} entry={bins.get(placement.code)} branch={branch} onClose={() => setSelected(null)} onOpenSku={onOpenSku} />
        )}
      </div>

      {editing && (
        <LayoutDialog layout={layout} branch={branch} onClose={() => setEditing(false)} onSave={(l) => saveLayout.mutateAsync(l)} />
      )}
    </div>
  );
}

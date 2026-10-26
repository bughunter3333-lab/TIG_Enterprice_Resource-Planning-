import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Inbox } from 'lucide-react';
import { T } from './tokens';
import Button from './Button';
import { useDensity } from '../lib/useDensity';

const ROW_HEIGHTS = { compact: T.rowHeight, comfortable: T.rowHeightComfortable };

const cellBase = {
  padding: '0 10px',
  fontSize: T.fsGrid,
  display: 'flex',
  alignItems: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
};

// Loading rows are the grid's own shape, greyed: the page does not jump when
// the data arrives, and nobody watches a spinner in the middle of a table.
function SkeletonRows({ columns, height }) {
  return Array.from({ length: 6 }, (_, r) => (
    <div key={r} role="row" aria-hidden style={{ display: 'flex', borderBottom: `1px solid ${T.hairlineSoft}`, height }}>
      {columns.map((c, i) => (
        <div key={c.key} style={{ ...cellBase, height, width: c.width, flex: c.width ? `0 0 ${c.width}px` : 1 }}>
          <span style={{
            display: 'block', height: 8, borderRadius: 4, background: T.hairlineSoft,
            width: `${40 + ((r * 7 + i * 13) % 45)}%`,
          }} />
        </div>
      ))}
    </div>
  ));
}

export default function DataGrid({
  columns,            // [{ key, label, width?, align?, render?(row), sortValue?(row) }]
  rows,               // array | null/undefined = loading
  rowKey = 'id',
  onRowClick,
  onRowDoubleClick,
  selectedKey,
  error,              // string — shown as a strip above rows
  onRetry,
  emptyText = 'No records',
  emptyHint,          // what to do about it, e.g. "Clear a filter or add a job"
  initialSort,        // { key, dir }
  groupBy,            // column key — rows are banded under a header per value
  maxHeight,
  density: densityProp, // 'compact' | 'comfortable'; defaults to the person's choice
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [chosenDensity] = useDensity();
  const rowHeight = ROW_HEIGHTS[densityProp ?? chosenDensity] ?? T.rowHeight;
  const loading = rows == null;

  const sorted = useMemo(() => {
    if (!rows || !sort) return rows ?? [];
    const { key, dir } = sort;
    // A column may sort by something other than its raw field: a date stored
    // in two shapes sorts by its day, a derived figure by its value.
    const col = columns.find((c) => c.key === key);
    const valueOf = col?.sortValue ?? ((row) => row[key]);
    return [...rows].sort((a, b) => {
      const av = valueOf(a), bv = valueOf(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = (typeof av === 'number' && typeof bv === 'number')
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  // Jim2's job list groups by any column, and the despatch screen is that list
  // grouped by Ship#: fifteen jobs become four consignments. A column showing
  // the code tells you which site a row is for; grouping tells you the shape of
  // the whole order.
  const groups = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map();
    for (const row of sorted) {
      // Falsy, not nullish. Normalised rows carry '' for an absent value, and
      // `?? ` lets an empty string through — the band then has a blank heading
      // that reads as a rendering fault rather than as "these have no site".
      const value = row[groupBy] || '—';
      if (!map.has(value)) map.set(value, []);
      map.get(value).push(row);
    }
    return [...map.entries()].sort((a, b) =>
      String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }));
  }, [sorted, groupBy]);

  const toggleSort = (key) =>
    setSort(s => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));

  return (
    <div style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg, fontFamily: T.font, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight, boxShadow: T.shadowSm }}>
      {error && (
        <div role="alert" style={{ background: T.dangerTint, color: T.danger, padding: '8px 12px', fontSize: T.fsGrid, display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${T.hairline}` }}>
          <span style={{ flex: 1 }}>{error}</span>
          {onRetry && <Button size="sm" variant="danger" onClick={onRetry}>Retry</Button>}
        </div>
      )}
      <div role="table" aria-busy={loading || undefined} style={{ overflowY: 'auto', flex: 1 }}>
        {/* The header sits on the alt ground with a hairline; rows read as
            passing under it. */}
        <div role="row" style={{ display: 'flex', background: T.panelAlt, position: 'sticky', top: 0, zIndex: 1, boxShadow: T.shadowHeader }}>
          {columns.map(c => (
            <div
              key={c.key}
              role="columnheader"
              onClick={() => toggleSort(c.key)}
              aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              // Headers are clickable, so they get a real hover state; the
              // active sort column stays emphasised.
              onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
              onMouseLeave={e => { e.currentTarget.style.color = sort?.key === c.key ? T.text : T.textMuted; }}
              style={{
                ...cellBase,
                // Read once and scanned past: a step shorter than a row.
                height: 32,
                width: c.width,
                flex: c.width ? `0 0 ${c.width}px` : 1,
                justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start',
                fontSize: 11,
                fontWeight: 500,
                color: sort?.key === c.key ? T.text : T.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                userSelect: 'none',
                gap: 3,
                transition: `color ${T.transition}`,
              }}
            >
              {c.label}
              {sort?.key === c.key && (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
            </div>
          ))}
        </div>

        {loading && (
          <>
            {/* The skeleton is for the eye; a screen reader hears this. */}
            <span role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Loading…</span>
            <SkeletonRows columns={columns} height={rowHeight} />
          </>
        )}
        {!loading && !error && sorted.length === 0 && (
          <div style={{ padding: '36px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
            <Inbox size={22} color={T.textFaint} aria-hidden />
            <div style={{ fontSize: T.fsGrid, fontWeight: 500, color: T.text }}>{emptyText}</div>
            {emptyHint && <div style={{ fontSize: T.fsSmall, color: T.textMuted }}>{emptyHint}</div>}
          </div>
        )}
        {!loading && groups && groups.map(([value, groupRows]) => (
          <div key={`g-${value}`} role="rowgroup">
            <div
              role="row"
              style={{
                ...cellBase,
                height: rowHeight,
                background: T.panelAlt,
                borderBottom: `1px solid ${T.hairline}`,
                borderTop: `1px solid ${T.hairline}`,
                color: T.headerText,
                fontWeight: 600,
                fontSize: T.fsGrid,
                gap: 8,
              }}
            >
              <span style={{ fontFamily: T.fontMono, color: T.text }}>{String(value)}</span>
              <span style={{ color: T.textMuted, fontWeight: 400 }}>
                {groupRows.length} job{groupRows.length === 1 ? '' : 's'}
              </span>
            </div>
            {groupRows.map(renderRow)}
          </div>
        ))}
        {!loading && !groups && sorted.map(renderRow)}
      </div>
    </div>
  );

  function renderRow(row) {
    const key = row[rowKey];
    const selected = selectedKey != null && key === selectedKey;
    return (
      // Hover uses direct style writes to avoid per-row re-renders; a sort
      // re-render clears hover until re-enter (accepted trade-off). No
      // virtualization yet — fine for current data sizes.
      <div
        key={key}
        role="row"
        aria-selected={selected || undefined}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
        style={{
          display: 'flex',
          borderBottom: `1px solid ${T.hairlineSoft}`,
          background: selected ? T.accentTint : 'transparent',
          cursor: onRowClick ? 'pointer' : 'default',
          // Inset shadow, not border-left: a border would shift every cell on
          // select and make the grid jump.
          boxShadow: selected ? `inset 2px 0 0 ${T.accent}` : 'none',
          transition: `background ${T.transition}`,
        }}
        onMouseEnter={e => { if (!selected) e.currentTarget.style.background = T.panelAlt; }}
        onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
      >
        {columns.map(c => (
          <div key={c.key} role="cell" style={{
            ...cellBase,
            height: rowHeight,
            width: c.width,
            flex: c.width ? `0 0 ${c.width}px` : 1,
            justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start',
            color: T.text,
          }}>
            {c.render ? c.render(row) : row[c.key]}
          </div>
        ))}
      </div>
    );
  }
}

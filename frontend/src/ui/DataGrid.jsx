import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { T } from './tokens';
import Button from './Button';

const cellBase = {
  padding: '0 8px',
  fontSize: T.fsGrid,
  height: T.rowHeight,
  display: 'flex',
  alignItems: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
};

export default function DataGrid({
  columns,            // [{ key, label, width?, align?, render?(row) }]
  rows,               // array | null/undefined = loading
  rowKey = 'id',
  onRowClick,
  onRowDoubleClick,
  selectedKey,
  error,              // string — shown as a strip above rows
  onRetry,
  emptyText = 'No records',
  initialSort,        // { key, dir }
  groupBy,            // column key — rows are banded under a header per value
  maxHeight,
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const loading = rows == null;

  const sorted = useMemo(() => {
    if (!rows || !sort) return rows ?? [];
    const { key, dir } = sort;
    return [...rows].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = (typeof av === 'number' && typeof bv === 'number')
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort]);

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
        <div style={{ background: T.dangerTint, color: T.danger, padding: '6px 10px', fontSize: T.fsGrid, display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${T.hairline}` }}>
          <span style={{ flex: 1 }}>{error}</span>
          {onRetry && <Button size="sm" variant="danger" onClick={onRetry}>Retry</Button>}
        </div>
      )}
      <div role="table" style={{ overflowY: 'auto', flex: 1 }}>
        {/* Sticky header casts a shadow so rows read as passing *under* it. */}
        <div role="row" style={{ display: 'flex', background: T.hairlineSoft, borderBottom: `1px solid ${T.hairline}`, position: 'sticky', top: 0, zIndex: 1, boxShadow: T.shadowHeader }}>
          {columns.map(c => (
            <div
              key={c.key}
              role="columnheader"
              onClick={() => toggleSort(c.key)}
              aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              // Headers are clickable, so they get a real hover state; the
              // active sort column stays emphasised.
              onMouseEnter={e => { e.currentTarget.style.color = T.accentStrong; }}
              onMouseLeave={e => { e.currentTarget.style.color = sort?.key === c.key ? T.accentStrong : T.headerText; }}
              style={{
                ...cellBase,
                // The header sits a step tighter than a data row: it is read
                // once and then scanned past, so it should not cost a row's
                // worth of height. Derived from the token so it moves with it.
                height: T.rowHeight - 6,
                width: c.width,
                flex: c.width ? `0 0 ${c.width}px` : 1,
                justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start',
                fontSize: T.fsHeader,
                fontWeight: 700,
                color: sort?.key === c.key ? T.accentStrong : T.headerText,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                cursor: 'pointer',
                userSelect: 'none',
                gap: 3,
                transition: `color ${T.transition}`,
              }}
            >
              {c.label}
              {sort?.key === c.key && (sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
            </div>
          ))}
        </div>

        {loading && (
          <div style={{ ...cellBase, color: T.textMuted, justifyContent: 'center', height: 60 }}>Loading…</div>
        )}
        {!loading && !error && sorted.length === 0 && (
          <div style={{ ...cellBase, color: T.textFaint, justifyContent: 'center', height: 60 }}>{emptyText}</div>
        )}
        {!loading && groups && groups.map(([value, groupRows]) => (
          <div key={`g-${value}`} role="rowgroup">
            <div
              role="row"
              style={{
                ...cellBase,
                background: T.panelAlt,
                borderBottom: `1px solid ${T.hairline}`,
                borderTop: `1px solid ${T.hairline}`,
                color: T.headerText,
                fontWeight: 700,
                fontSize: T.fsGrid,
                gap: 8,
              }}
            >
              <span style={{ fontFamily: T.fontMono, color: T.accentStrong }}>{String(value)}</span>
              <span style={{ color: T.textFaint, fontWeight: 500 }}>
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
            // Hover uses direct style writes to avoid per-row re-renders; a sort re-render clears hover until re-enter (accepted trade-off). No virtualization yet — fine for current data sizes.
            <div
              key={key}
              role="row"
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
              style={{
                display: 'flex',
                borderBottom: `1px solid ${T.hairlineSoft}`,
                background: selected ? T.accentTint : 'transparent',
                cursor: onRowClick ? 'pointer' : 'default',
                // Inset shadow, not border-left: a border would shift every
                // cell 3px on select and make the grid jump.
                boxShadow: selected ? `inset 3px 0 0 ${T.accentStrong}` : 'none',
                transition: `background ${T.transition}`,
              }}
              onMouseEnter={e => { if (!selected) e.currentTarget.style.background = T.hairlineSoft; }}
              onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
            >
              {columns.map(c => (
                <div key={c.key} role="cell" style={{
                  ...cellBase,
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

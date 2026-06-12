import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { T } from './tokens';
import Button from './Button';

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

  const toggleSort = (key) =>
    setSort(s => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));

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

  return (
    <div style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, fontFamily: T.font, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight }}>
      {error && (
        <div style={{ background: T.dangerTint, color: T.danger, padding: '6px 10px', fontSize: T.fsGrid, display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${T.hairline}` }}>
          <span style={{ flex: 1 }}>{error}</span>
          {onRetry && <Button size="sm" variant="danger" onClick={onRetry}>Retry</Button>}
        </div>
      )}
      <div role="table" style={{ overflowY: 'auto', flex: 1 }}>
        <div role="row" style={{ display: 'flex', background: T.hairlineSoft, borderBottom: `1px solid ${T.hairline}`, position: 'sticky', top: 0, zIndex: 1 }}>
          {columns.map(c => (
            <div
              key={c.key}
              role="columnheader"
              onClick={() => toggleSort(c.key)}
              style={{
                ...cellBase,
                height: 26,
                width: c.width,
                flex: c.width ? `0 0 ${c.width}px` : 1,
                justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start',
                fontSize: T.fsHeader,
                fontWeight: 700,
                color: T.headerText,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                cursor: 'pointer',
                userSelect: 'none',
                gap: 3,
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
        {!loading && sorted.map(row => {
          const key = row[rowKey];
          const selected = selectedKey != null && key === selectedKey;
          return (
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
        })}
      </div>
    </div>
  );
}

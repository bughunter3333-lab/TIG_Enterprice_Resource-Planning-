import { useMemo } from 'react';
import { Search, Plus, Download } from 'lucide-react';
import KpiTile from '../../ui/KpiTile';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import POList from './POList';
import { filterPOs, poCounts, PO_STATUSES } from './poFilters';

export default function POModule({
  purchaseOrders = [], filters, onFilterChange,
  selectedId, onSelectPO, onNewPO, onExport,
}) {
  const filtered = useMemo(() => filterPOs(purchaseOrders, filters), [purchaseOrders, filters]);
  const counts = useMemo(() => poCounts(purchaseOrders), [purchaseOrders]);

  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 10, border: `1px solid ${T.hairline}`, borderRadius: T.radius, overflow: 'hidden', width: 'fit-content' }}>
        <KpiTile label="TOTAL POs" value={counts.total} />
        <KpiTile label="DRAFT" value={counts.draft} tone="accent" />
        <KpiTile label="AWAITING RECEIPT" value={counts.awaitingReceipt} tone="accent" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <Button size="sm" variant={filters.status === 'all' ? 'primary' : 'secondary'} onClick={() => onFilterChange('status', 'all')}>All</Button>
        {PO_STATUSES.map(s => (
          <Button key={s} size="sm" variant={filters.status === s ? 'primary' : 'secondary'} onClick={() => onFilterChange('status', s)}>{s}</Button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: '4px 8px', width: 180 }}>
          <Search size={12} color={T.textFaint} />
          <input
            value={filters.search}
            onChange={e => onFilterChange('search', e.target.value)}
            placeholder="Search POs…"
            style={{ border: 'none', outline: 'none', fontSize: T.fsGrid, width: '100%', fontFamily: T.font, color: T.text }}
          />
        </div>
        <Button size="sm" variant="secondary" onClick={onExport}><Download size={12} /> Export</Button>
        <Button size="sm" variant="primary" onClick={onNewPO}><Plus size={12} /> New PO</Button>
      </div>

      <POList pos={filtered} selectedId={selectedId} onSelect={onSelectPO} />
    </div>
  );
}

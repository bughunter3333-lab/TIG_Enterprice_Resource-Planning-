import { useState, useMemo } from 'react';
import { T } from '../../ui/tokens';
import StockList from './StockList';
import StockDetailPanel from './StockDetailPanel';

export default function StockModule({ inventory = [], onNavigateJob, onNavigatePO }) {
  const [selectedSku, setSelectedSku] = useState(null);
  const selectedItem = useMemo(
    () => inventory.find(i => i.sku === selectedSku) || null,
    [inventory, selectedSku],
  );

  return (
    <div style={{ display: 'flex', gap: 14, height: 'calc(100vh - 120px)', fontFamily: T.font }}>
      <div style={{ flexBasis: '42%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <StockList items={inventory} selectedSku={selectedSku} onSelect={setSelectedSku} />
      </div>
      <div style={{ flex: 1, minWidth: 0, background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: 12, overflow: 'hidden' }}>
        <StockDetailPanel item={selectedItem} onNavigateJob={onNavigateJob} onNavigatePO={onNavigatePO} />
      </div>
    </div>
  );
}

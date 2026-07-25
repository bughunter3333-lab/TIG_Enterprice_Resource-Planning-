import { useState, useEffect } from 'react';
import Tabs from '../../ui/Tabs';
import { T } from '../../ui/tokens';
import StockDetailsTab from './tabs/StockDetailsTab';
import StockLocationsTab from './tabs/StockLocationsTab';
import StockPricingTab from './tabs/StockPricingTab';
import StockStatsTab from './tabs/StockStatsTab';
import StockTransactionsTab from './tabs/StockTransactionsTab';
import StockCommittedTab from './tabs/StockCommittedTab';

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'locations', label: 'Locations' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'stats', label: 'Stats' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'committed', label: 'Committed' },
];

export default function StockDetailPanel({ item, onNavigateJob, onNavigatePO }) {
  const [tab, setTab] = useState('details');
  // Reset to Details whenever the selected item changes.
  useEffect(() => { setTab('details'); }, [item?.sku]);

  if (!item) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: T.textFaint, fontFamily: T.font, fontSize: T.fsBase }}>
        Select a stock item to view details
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: T.font }}>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{item.sku}</div>
        <div style={{ fontSize: T.fsGrid, color: T.textMuted }}>{item.name}{item.gl_group ? ` · ${item.gl_group}` : ''}</div>
      </div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 10 }}>
        {tab === 'details' && <StockDetailsTab item={item} />}
        {tab === 'locations' && <StockLocationsTab sku={item.sku} />}
        {tab === 'pricing' && <StockPricingTab sku={item.sku} />}
        {tab === 'stats' && <StockStatsTab sku={item.sku} />}
        {tab === 'transactions' && <StockTransactionsTab sku={item.sku} onNavigateJob={onNavigateJob} onNavigatePO={onNavigatePO} />}
        {tab === 'committed' && <StockCommittedTab sku={item.sku} onNavigateJob={onNavigateJob} />}
      </div>
    </div>
  );
}

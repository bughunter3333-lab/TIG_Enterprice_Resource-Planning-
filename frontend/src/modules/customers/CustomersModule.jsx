import { useMemo } from 'react';
import { Search, Plus, Download } from 'lucide-react';
import KpiTile from '../../ui/KpiTile';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import CustomerList from './CustomerList';
import { filterCustomers, customerKpis } from './customerAggregates';

const money0 = (v) => `$${Math.round(Number(v) || 0).toLocaleString('en-AU')}`;

export default function CustomersModule({
  customers = [], jobs = [], search, onSearchChange,
  selectedId, onSelectCustomer, onNewCustomer, onExport,
}) {
  const kpis = useMemo(() => customerKpis(customers, jobs), [customers, jobs]);
  const filtered = useMemo(() => filterCustomers(customers, search), [customers, search]);

  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 10, border: `1px solid ${T.hairline}`, borderRadius: T.radius, overflow: 'hidden', width: 'fit-content' }}>
        <KpiTile label="CUSTOMERS" value={kpis.total} sub={`${kpis.active} active`} />
        <KpiTile label="REVENUE" value={money0(kpis.revenue)} tone="ok" />
        <KpiTile label="OUTSTANDING AR" value={money0(kpis.outstanding)} tone="danger" />
        <KpiTile label="OVER CREDIT" value={kpis.overCredit} tone="accent" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: '4px 8px', flex: 1, maxWidth: 280 }}>
          <Search size={12} color={T.textFaint} />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search customers…"
            style={{ border: 'none', outline: 'none', fontSize: T.fsGrid, width: '100%', fontFamily: T.font, color: T.text }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="secondary" onClick={onExport}><Download size={12} /> Export</Button>
        <Button size="sm" variant="primary" onClick={onNewCustomer}><Plus size={12} /> New Customer</Button>
      </div>

      <CustomerList customers={filtered} jobs={jobs} selectedId={selectedId} onSelect={onSelectCustomer} />
    </div>
  );
}

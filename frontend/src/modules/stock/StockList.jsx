import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import DataGrid from '../../ui/DataGrid';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import { qtyTone, availableQty } from './stockFormat';

const CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'low', label: 'Low' },
  { id: 'out', label: 'Out' },
];

const matchesChip = (item, chip) => {
  const stock = Number(item.stock) || 0;
  const reorder = Number(item.reorderLevel) || 0;
  if (chip === 'out') return stock <= 0;
  if (chip === 'low') return stock > 0 && stock < reorder;
  return true;
};

export default function StockList({ items = [], selectedSku, onSelect }) {
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState('all');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i =>
      matchesChip(i, chip) && (!q ||
        (i.sku || '').toLowerCase().includes(q) ||
        (i.name || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q) ||
        (i.supplier || '').toLowerCase().includes(q))
    );
  }, [items, search, chip]);

  const columns = [
    { key: 'sku', label: 'SKU', width: 130, render: (i) => <span style={{ fontWeight: 700, color: T.accentStrong }}>{i.sku}</span> },
    { key: 'name', label: 'Description' },
    { key: 'stock', label: 'Qty', width: 70, align: 'right', render: (i) => {
        const t = qtyTone(i);
        return <span style={{ color: t.color, fontWeight: 600 }}>{Number(i.stock) || 0}</span>;
      } },
    { key: 'avail', label: 'Avail', width: 60, align: 'right', render: (i) => availableQty(i) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: T.font }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: '4px 8px', flex: 1 }}>
          <Search size={12} color={T.textFaint} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search stock…"
            style={{ border: 'none', outline: 'none', fontSize: T.fsGrid, width: '100%', fontFamily: T.font, color: T.text }}
          />
        </div>
        {CHIPS.map(c => (
          <Button key={c.id} size="sm" variant={chip === c.id ? 'primary' : 'secondary'} onClick={() => setChip(c.id)}>
            {c.label}
          </Button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DataGrid
          columns={columns}
          rows={filtered}
          rowKey="sku"
          selectedKey={selectedSku}
          onRowClick={(row) => onSelect(row.sku)}
          emptyText="No stock items match"
          maxHeight="100%"
        />
      </div>
    </div>
  );
}

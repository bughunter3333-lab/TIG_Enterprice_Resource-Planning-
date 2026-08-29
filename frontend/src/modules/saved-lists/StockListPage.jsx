import { notify } from '../../lib/notify';
import StockListBuilder from '../../modules/stock/StockListBuilder';
import { matchStockList } from '../../modules/stock/stockListFilters';

export default function StockListPage({ deleteJobList, inventory, openModal, savedJobLists, setActiveModule, setStockFocusSku, setStockListModal, stockListModal, updateListFilter }) {
  if (!stockListModal.open) return null;
  const d = stockListModal.draft;
  const inv = inventory || [];
  const uniq = (sel) => [...new Set(inv.map(sel).filter(Boolean))].sort();
  const options = {
    categories: uniq(i => i.category),
    suppliers: uniq(i => i.supplier),
    glGroups: uniq(i => i.gl_group),
    locations: uniq(i => i.location),
    itemTypes: uniq(i => i.item_type),
  };
  const results = inv.filter(i => matchStockList(i, d));
  const editingId = stockListModal.editingId;
  const editingList = savedJobLists.find(l => l.id === editingId);
  const close = () => setStockListModal(m => ({ ...m, open: false, editingId: null }));
  const openStock = (item) => { close(); setStockFocusSku(item.sku); setActiveModule('inventory'); };
  const run = () => {
    if (editingId) updateListFilter(editingId, { ...d });
    notify(`Ran "${editingList ? editingList.name : 'list'}" — ${results.length} item${results.length === 1 ? '' : 's'}`, { type: 'success' });
    close();
  };
  const cancel = () => {
    if (editingId && editingList && editingList.filter == null) deleteJobList(editingId);
    close();
  };
  return (
    <StockListBuilder
      draft={d}
      listName={editingList ? editingList.name : 'Stock List'}
      onChange={(patch) => setStockListModal(m => ({ ...m, draft: { ...m.draft, ...patch } }))}
      options={options}
      results={results}
      onRun={run}
      onCancel={cancel}
      onAddItem={() => { close(); openModal('inventory'); }}
      onEditItem={(item) => { close(); openModal('inventory', item); }}
      onViewItem={openStock}
    />
  );
}

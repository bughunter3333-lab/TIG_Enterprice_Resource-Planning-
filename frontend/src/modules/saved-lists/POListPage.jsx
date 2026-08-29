import { notify } from '../../lib/notify';
import POListBuilder from '../../modules/purchase-orders/POListBuilder';
import { matchPOList } from '../../modules/purchase-orders/poListFilters';

export default function POListPage({ deleteJobList, openModal, poListModal, purchaseOrders, savedJobLists, setActiveModule, setPoListModal, setSelectedPO, updateListFilter }) {
  if (!poListModal.open) return null;
  const d = poListModal.draft;
  const posArr = purchaseOrders || [];
  const uniq = (sel) => [...new Set(posArr.map(sel).filter(Boolean))].sort();
  const options = { suppliers: uniq(p => p.supplier), statuses: uniq(p => p.status) };
  const results = posArr.filter(p => matchPOList(p, d));
  const editingId = poListModal.editingId;
  const editingList = savedJobLists.find(l => l.id === editingId);
  const close = () => setPoListModal(m => ({ ...m, open: false, editingId: null }));
  const openPO = (po) => { close(); setSelectedPO(po); setActiveModule('purchase-orders'); };
  const run = () => {
    if (editingId) updateListFilter(editingId, { ...d });
    notify(`Ran "${editingList ? editingList.name : 'list'}" — ${results.length} order${results.length === 1 ? '' : 's'}`, { type: 'success' });
    close();
  };
  const cancel = () => {
    if (editingId && editingList && editingList.filter == null) deleteJobList(editingId);
    close();
  };
  return (
    <POListBuilder
      draft={d}
      listName={editingList ? editingList.name : 'Purchase List'}
      onChange={(patch) => setPoListModal(m => ({ ...m, draft: { ...m.draft, ...patch } }))}
      options={options}
      results={results}
      onRun={run}
      onCancel={cancel}
      onAddPO={() => { close(); openModal('po'); }}
      onEditPO={(po) => { close(); openModal('po', po); }}
      onViewPO={openPO}
    />
  );
}

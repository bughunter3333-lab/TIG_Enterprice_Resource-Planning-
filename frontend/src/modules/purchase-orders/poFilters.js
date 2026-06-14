export const PO_STATUSES = ['Draft', 'Sent', 'Partial', 'Received', 'Cancelled'];

export const EMPTY_PO_FILTERS = { search: '', status: 'all' };

export function filterPOs(pos, f) {
  const q = (f.search || '').toLowerCase();
  return (pos || []).filter(po => {
    const matchSearch = !q ||
      String(po.id).toLowerCase().includes(q) ||
      (po.supplier || '').toLowerCase().includes(q) ||
      (po.supplierCode || '').toLowerCase().includes(q);
    const matchStatus = f.status === 'all' || po.status === f.status;
    return matchSearch && matchStatus;
  });
}

export function poCounts(pos) {
  const list = pos || [];
  return {
    total: list.length,
    draft: list.filter(p => p.status === 'Draft').length,
    awaitingReceipt: list.filter(p => ['Sent', 'Partial'].includes(p.status)).length,
  };
}

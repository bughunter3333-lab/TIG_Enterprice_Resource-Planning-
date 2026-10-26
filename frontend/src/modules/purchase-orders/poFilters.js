import { dayKey, todayKey } from '../../lib/dates';

export const PO_STATUSES = ['Draft', 'Sent', 'Partial', 'Received', 'Cancelled'];

export const EMPTY_PO_FILTERS = { search: '', status: 'all' };

/**
 * The supplier is late: the PO is out with them (Sent, or Partial — part of it
 * received) and the day it was expected is before today. Compared as day keys,
 * so 'DD/MM/YYYY' and ISO dates both count and today is the viewer's own day.
 */
export function isLatePO(po, today = todayKey()) {
  if (!['Sent', 'Partial'].includes(po?.status)) return false;
  const expected = dayKey(po.expectedDate);
  return !!expected && expected < today;
}

/** `status` is a PO status, 'all', or 'late' (isLatePO). */
export function filterPOs(pos, f, today = todayKey()) {
  const q = (f.search || '').toLowerCase();
  return (pos || []).filter(po => {
    const matchSearch = !q ||
      String(po.id).toLowerCase().includes(q) ||
      (po.supplier || '').toLowerCase().includes(q) ||
      (po.supplierCode || '').toLowerCase().includes(q);
    const matchStatus = f.status === 'all'
      || (f.status === 'late' ? isLatePO(po, today) : po.status === f.status);
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

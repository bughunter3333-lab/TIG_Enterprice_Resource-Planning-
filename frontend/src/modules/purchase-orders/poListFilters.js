// Jim2 "Purchases" list filter — the per-node list predicate over purchase
// orders. Every field optional; empty object / null matches everything.

export const EMPTY_PO_LIST = {
  poNo: '', supplier: '', status: '', stockCode: '',
  dateFrom: '', dateTo: '', expectedFrom: '', expectedTo: '',
  outstanding: false,
};

const _contains = (val, q) => !q || String(val || '').toLowerCase().includes(String(q).toLowerCase());

// Accepts ISO (YYYY-MM-DD) or DD/MM/YYYY, matching the mixed date strings in use.
const _parseDate = (raw) => {
  if (!raw) return null;
  const s = String(raw).split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s);
  const p = s.split('/');
  if (p.length === 3) return new Date(`${p[2]}-${p[1]}-${p[0]}`);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const _inRange = (raw, from, to) => {
  if (!from && !to) return true;
  const d = _parseDate(raw);
  if (!d) return false;
  if (from && d < new Date(from)) return false;
  if (to && d > new Date(to + 'T23:59:59')) return false;
  return true;
};

// A PO is outstanding when goods are still owed and it isn't cancelled/closed.
export const poOutstanding = (po) => {
  if (['Cancelled', 'Received', 'Closed'].includes(po.status)) return false;
  const items = po.items || [];
  const ordered = items.reduce((s, i) => s + Number(i.qtyOrdered || 0), 0);
  const received = items.reduce((s, i) => s + Number(i.qtyReceived || 0), 0);
  return items.length === 0 ? true : received < ordered;
};

export function matchPOList(po, f) {
  if (!f) return true;
  if (!_contains(po.id, f.poNo)) return false;
  if (f.supplier && po.supplier !== f.supplier) return false;
  if (f.status && po.status !== f.status) return false;
  if (f.stockCode) {
    const q = f.stockCode.toLowerCase();
    const hit = (po.items || []).some(
      (it) => String(it.sku || '').toLowerCase().includes(q) || String(it.description || '').toLowerCase().includes(q)
    );
    if (!hit) return false;
  }
  if (!_inRange(po.date, f.dateFrom, f.dateTo)) return false;
  if (!_inRange(po.expectedDate, f.expectedFrom, f.expectedTo)) return false;
  if (f.outstanding && !poOutstanding(po)) return false;
  return true;
}

// Jim2 "Stock List" filter — mirrors the Job List predicate but over inventory
// items. Every field is optional (empty object / null matches everything); only
// populated fields constrain the result. Members are computed live like job lists.

export const EMPTY_STOCK_LIST = {
  code: '', description: '', category: '', supplier: '', glGroup: '', location: '',
  itemType: '', status: '',
  lowStock: false, onPO: false, committed: false, outOfStock: false,
};

const _contains = (val, q) => !q || String(val || '').toLowerCase().includes(String(q).toLowerCase());

export function matchStockList(item, f) {
  if (!f) return true;
  if (!_contains(item.sku, f.code)) return false;
  if (!_contains(item.name, f.description)) return false;
  if (f.category && item.category !== f.category) return false;
  if (f.supplier && item.supplier !== f.supplier) return false;
  if (f.glGroup && (item.gl_group || '') !== f.glGroup) return false;
  if (f.location && item.location !== f.location) return false;
  if (f.itemType && (item.item_type || '') !== f.itemType) return false;
  if (f.status && (item.status || 'Active') !== f.status) return false;
  const onHand = Number(item.stock || 0);
  const min = Number(item.min_stock || item.reorderLevel || 0);
  if (f.lowStock && !(onHand <= min)) return false;
  if (f.onPO && !(Number(item.on_order_qty || 0) > 0)) return false;
  if (f.committed && !(Number(item.committed_qty || 0) > 0)) return false;
  if (f.outOfStock && !(onHand <= 0)) return false;
  return true;
}

// available = on-hand minus committed (never negative), matching the Stock module.
export const stockAvailable = (item) => Math.max(0, Number(item.stock || 0) - Number(item.committed_qty || 0));

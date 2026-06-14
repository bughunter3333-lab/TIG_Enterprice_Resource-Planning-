import { T } from '../../ui/tokens';

export const money = (v) => `$${(Number(v) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Aggregate available = on-hand minus committed, floored at 0.
export const availableQty = (item) => Math.max(0, (Number(item.stock) || 0) - (Number(item.committed_qty) || 0));

// Stock health → token colour. out: stock<=0; low: stock<reorder; else ok.
export function qtyTone(item) {
  const stock = Number(item.stock) || 0;
  const reorder = Number(item.reorderLevel) || 0;
  if (stock <= 0) return { label: 'OUT', color: T.danger };
  if (stock < reorder) return { label: 'LOW', color: T.accentStrong };
  return { label: 'OK', color: T.ok };
}

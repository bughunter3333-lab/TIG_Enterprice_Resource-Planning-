/**
 * Whether an item needs buying.
 *
 * The rule lived in four places on this side alone, two using `<` and two `<=`,
 * so the same SKU could be flagged on the dashboard and not in Reports. The
 * server settles it now — `backend/app/core/replenishment.py` — and this is the
 * client's copy of the same arithmetic, for counts computed off an already
 * loaded list rather than fetched.
 *
 * It counts what is already coming. An item below its minimum but covered by a
 * purchase order placed a fortnight ago is not short; blanks on four to six week
 * lead times spend ordinary weeks in that state.
 */

export function projectedStock(item) {
  if (!item) return 0;
  const onHand = item.stock ?? 0;
  const onOrder = item.on_order_qty ?? item.onOrderQty ?? 0;
  const committed = item.committed_qty ?? item.committedQty ?? 0;
  return onHand + onOrder - committed;
}

export function needsReorder(item) {
  if (!item) return false;
  // A minimum of zero means nobody has set one, not that any stock is enough.
  const minimum = item.min_stock ?? item.reorderLevel ?? 0;
  if (minimum <= 0) return false;
  return projectedStock(item) <= minimum;
}

export function countNeedingReorder(items) {
  return (items || []).filter(needsReorder).length;
}

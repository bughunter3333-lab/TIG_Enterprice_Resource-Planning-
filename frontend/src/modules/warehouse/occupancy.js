/**
 * What is in each bin, from GET /inventory/bin-map.
 *
 * The stock record keeps one count per SKU per branch, not one per bin, so a
 * bin's state is read from the SKUs slotted into it:
 *
 *   stocked  at least one of its SKUs has stock on hand in the branch
 *   empty    SKUs are slotted here but none has any on hand
 *   over     a SKU holds more than all of its bins' capacities add up to —
 *            judged only when every bin it uses has a capacity set
 *
 * A bin with nothing slotted into it has no entry at all.
 */

export function binStates(rows) {
  const bySku = new Map();
  for (const r of rows ?? []) {
    if (!bySku.has(r.sku)) bySku.set(r.sku, []);
    bySku.get(r.sku).push(r);
  }
  const overSkus = new Set();
  for (const [sku, slots] of bySku) {
    if (slots.every((s) => Number.isFinite(s.max_qty) && s.max_qty > 0)) {
      const capacity = slots.reduce((sum, s) => sum + s.max_qty, 0);
      if ((slots[0].qty_on_hand ?? 0) > capacity) overSkus.add(sku);
    }
  }

  const bins = new Map();
  for (const r of rows ?? []) {
    if (!bins.has(r.bin)) bins.set(r.bin, { code: r.bin, skus: [] });
    bins.get(r.bin).skus.push({ ...r, over: overSkus.has(r.sku) });
  }
  for (const entry of bins.values()) {
    entry.skus.sort((a, b) => a.sku.localeCompare(b.sku));
    if (entry.skus.some((s) => s.over)) entry.state = 'over';
    else if (entry.skus.some((s) => (s.qty_on_hand ?? 0) > 0)) entry.state = 'stocked';
    else entry.state = 'empty';
  }
  return bins;
}

/** Bin codes matching a search: by SKU, by product name, or by the start of a bin code. */
export function matchBins(rows, query) {
  const q = String(query ?? '').trim().toLowerCase();
  const hits = new Set();
  if (!q) return hits;
  for (const r of rows ?? []) {
    if (
      r.bin.toLowerCase().startsWith(q) ||
      r.sku.toLowerCase().includes(q) ||
      (r.name ?? '').toLowerCase().includes(q)
    ) hits.add(r.bin);
  }
  return hits;
}

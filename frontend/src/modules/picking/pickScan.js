/**
 * Picking at the shelf, pure (docs/superpowers/specs/2026-11-09-phone-picking.md):
 * what a scanned code is, and the order to walk the shelves in.
 */
import { compareBins } from '../../lib/binLocation';
import { pickTarget } from '../jobs/jobPicking';

const same = (a, b) => String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase();

/** The stock item for each code, for its bin and barcode. */
export const bySku = (inventory) => new Map((inventory ?? []).map((item) => [String(item.sku).toUpperCase(), item]));

/**
 * The line a scanned code is for: its stock code, or its stock item's barcode.
 * Of two lines for one code, the first not yet picked in full.
 */
export function lineForScan(lines, code, stock, pickedOf) {
  const scanned = String(code ?? '').trim();
  if (!scanned) return null;
  const matches = lines.filter((line) => {
    if (same(line.stockCode, scanned)) return true;
    const item = stock.get(String(line.stockCode ?? '').toUpperCase());
    return !!item?.barcode && same(item.barcode, scanned);
  });
  return matches.find((line) => pickedOf(line) < pickTarget(line)) ?? matches[0] ?? null;
}

/** The lines in the order the shelves are walked: by bin, a line with none last. */
export function walkOrder(lines, stock) {
  const bin = (line) => stock.get(String(line.stockCode ?? '').toUpperCase())?.location ?? '';
  return [...lines].sort((a, b) => compareBins(bin(a), bin(b)));
}

/** A job number as typed or scanned from its label: spaces and a leading # gone. */
export const jobNumber = (text) => String(text ?? '').trim().replace(/^#/, '');

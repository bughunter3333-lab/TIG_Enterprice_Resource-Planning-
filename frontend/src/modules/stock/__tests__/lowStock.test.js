import { describe, expect, test } from 'vitest';
import { countNeedingReorder, needsReorder, projectedStock } from '../lowStock';

describe('whether an item needs buying', () => {
  test('below its minimum with nothing coming', () => {
    expect(needsReorder({ stock: 8, min_stock: 50 })).toBe(true);
  });

  test('below its minimum but covered by an order is not short', () => {
    expect(needsReorder({ stock: 8, min_stock: 50, on_order_qty: 100 })).toBe(false);
  });

  test('stock reserved for a job does not cover the minimum', () => {
    expect(needsReorder({ stock: 60, min_stock: 50, committed_qty: 40 })).toBe(true);
  });

  test('no minimum means nobody manages this item', () => {
    expect(needsReorder({ stock: 0, min_stock: 0 })).toBe(false);
    expect(needsReorder({ stock: 0, reorderLevel: 0 })).toBe(false);
  });

  test('exactly at the minimum counts as needing attention', () => {
    // Four of the six original sites used <=; this settles the split.
    expect(needsReorder({ stock: 20, min_stock: 20 })).toBe(true);
  });

  test('the legacy reorderLevel field still works', () => {
    expect(needsReorder({ stock: 2, reorderLevel: 10 })).toBe(true);
  });

  test('projected nets both directions', () => {
    expect(projectedStock({ stock: 10, on_order_qty: 5, committed_qty: 3 })).toBe(12);
  });

  test('counting a list', () => {
    const items = [
      { stock: 1, min_stock: 10 },
      { stock: 1, min_stock: 10, on_order_qty: 50 },
      { stock: 0, min_stock: 0 },
    ];
    expect(countNeedingReorder(items)).toBe(1);
  });

  test('nothing at all is not short', () => {
    expect(needsReorder(null)).toBe(false);
    expect(countNeedingReorder(null)).toBe(0);
  });
});

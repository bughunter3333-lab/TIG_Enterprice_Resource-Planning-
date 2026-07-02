import { matchStockList, stockAvailable, EMPTY_STOCK_LIST } from '../stockListFilters';

const items = [
  { sku: 'TW1823.BLA.8', name: 'Hi Vis Polo Navy', category: 'Apparel', supplier: 'Corinthian', gl_group: 'TIG - Apparel', location: 'HQ', item_type: 'Depleting', status: 'Active', stock: 50, committed_qty: 20, on_order_qty: 0, min_stock: 10 },
  { sku: 'AS5026.WHT', name: 'Staple Tee White', category: 'Apparel', supplier: 'AS Colour', gl_group: 'TIG - Apparel', location: 'HQ', item_type: 'Depleting', status: 'Active', stock: 4, committed_qty: 0, on_order_qty: 12, min_stock: 10 },
  { sku: 'CAP.001', name: 'Trucker Cap', category: 'Headwear', supplier: 'Legend', gl_group: 'TIG - Headwear', location: 'MELB', item_type: 'Non-Depleting', status: 'Inactive', stock: 0, committed_qty: 0, on_order_qty: 0, min_stock: 5 },
];

test('empty/null filter matches everything', () => {
  expect(items.every(i => matchStockList(i, null))).toBe(true);
  expect(items.filter(i => matchStockList(i, EMPTY_STOCK_LIST))).toHaveLength(3);
});

test('code and description are case-insensitive contains', () => {
  expect(items.filter(i => matchStockList(i, { code: 'tw1823' })).map(i => i.sku)).toEqual(['TW1823.BLA.8']);
  expect(items.filter(i => matchStockList(i, { description: 'tee' })).map(i => i.sku)).toEqual(['AS5026.WHT']);
});

test('exact selects: category, supplier, gl group, location, status', () => {
  expect(items.filter(i => matchStockList(i, { category: 'Apparel' }))).toHaveLength(2);
  expect(items.filter(i => matchStockList(i, { supplier: 'Legend' })).map(i => i.sku)).toEqual(['CAP.001']);
  expect(items.filter(i => matchStockList(i, { status: 'Inactive' })).map(i => i.sku)).toEqual(['CAP.001']);
});

test('toggles: low stock, on PO, committed, out of stock', () => {
  // low stock: on-hand <= min → AS5026 (4<=10) and CAP.001 (0<=5)
  expect(items.filter(i => matchStockList(i, { lowStock: true })).map(i => i.sku)).toEqual(['AS5026.WHT', 'CAP.001']);
  expect(items.filter(i => matchStockList(i, { onPO: true })).map(i => i.sku)).toEqual(['AS5026.WHT']);
  expect(items.filter(i => matchStockList(i, { committed: true })).map(i => i.sku)).toEqual(['TW1823.BLA.8']);
  expect(items.filter(i => matchStockList(i, { outOfStock: true })).map(i => i.sku)).toEqual(['CAP.001']);
});

test('stockAvailable = on-hand minus committed, floored at 0', () => {
  expect(stockAvailable(items[0])).toBe(30);
  expect(stockAvailable(items[2])).toBe(0);
});

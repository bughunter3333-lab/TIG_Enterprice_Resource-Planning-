import { render, screen, fireEvent } from '@testing-library/react';
import StockList from '../StockList';

const items = [
  { sku: 'MR.PS60.NAV', name: 'Navy Polo', category: 'Apparel', stock: 50, committed_qty: 10, reorderLevel: 20, unitPrice: 25 },
  { sku: 'CAP.BLK', name: 'Black Cap', category: 'Headwear', stock: 0, committed_qty: 0, reorderLevel: 15, unitPrice: 12 },
  { sku: 'TEE.WHT', name: 'White Tee', category: 'Apparel', stock: 8, committed_qty: 2, reorderLevel: 20, unitPrice: 9 },
];

test('renders all items and fires onSelect with the sku', () => {
  const onSelect = vi.fn();
  render(<StockList items={items} selectedSku={null} onSelect={onSelect} />);
  expect(screen.getByText('MR.PS60.NAV')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Navy Polo'));
  expect(onSelect).toHaveBeenCalledWith('MR.PS60.NAV');
});

test('search filters by sku/name/category', () => {
  render(<StockList items={items} selectedSku={null} onSelect={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText('Search stock…'), { target: { value: 'cap' } });
  expect(screen.getByText('Black Cap')).toBeInTheDocument();
  expect(screen.queryByText('Navy Polo')).not.toBeInTheDocument();
});

test('Needs reorder chip is the shared rule: at or below minimum, counting orders and commitments', () => {
  const stocked = [
    ...items,
    // Short on hand, but an order covers it.
    { sku: 'HOOD.GRY', name: 'Grey Hood', stock: 2, on_order_qty: 40, reorderLevel: 20 },
  ];
  render(<StockList items={stocked} selectedSku={null} onSelect={() => {}} initialChip="reorder" />);
  expect(screen.getByRole('button', { name: 'Needs reorder' })).toBeInTheDocument();
  // Navy Polo: 50 - 10 committed = 40 > 20. Black Cap: 0 <= 15. White Tee: 8 - 2 = 6 <= 20.
  expect(screen.getByText('Black Cap')).toBeInTheDocument();
  expect(screen.getByText('White Tee')).toBeInTheDocument();
  expect(screen.queryByText('Navy Polo')).not.toBeInTheDocument();
  expect(screen.queryByText('Grey Hood')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  expect(screen.getByText('Grey Hood')).toBeInTheDocument();
});

test('Out chip shows only zero-stock; Low chip shows below-reorder in-stock', () => {
  render(<StockList items={items} selectedSku={null} onSelect={() => {}} />);
  fireEvent.click(screen.getByText(/Out/));
  expect(screen.getByText('Black Cap')).toBeInTheDocument();
  expect(screen.queryByText('Navy Polo')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText(/Low/));
  expect(screen.getByText('White Tee')).toBeInTheDocument();  // 8 < 20, in stock
  expect(screen.queryByText('Black Cap')).not.toBeInTheDocument(); // 0 stock = Out, not Low
});

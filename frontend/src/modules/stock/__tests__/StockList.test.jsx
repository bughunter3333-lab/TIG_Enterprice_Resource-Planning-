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

test('Out chip shows only zero-stock; Low chip shows below-reorder in-stock', () => {
  render(<StockList items={items} selectedSku={null} onSelect={() => {}} />);
  fireEvent.click(screen.getByText(/Out/));
  expect(screen.getByText('Black Cap')).toBeInTheDocument();
  expect(screen.queryByText('Navy Polo')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText(/Low/));
  expect(screen.getByText('White Tee')).toBeInTheDocument();  // 8 < 20, in stock
  expect(screen.queryByText('Black Cap')).not.toBeInTheDocument(); // 0 stock = Out, not Low
});

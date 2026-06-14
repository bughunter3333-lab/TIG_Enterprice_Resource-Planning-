import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockModule from '../StockModule';

vi.mock('../../../api', () => ({ stock: { locations: vi.fn().mockResolvedValue([]), pricing: vi.fn().mockResolvedValue({ levels: [] }), transactions: vi.fn().mockResolvedValue([]), committed: vi.fn().mockResolvedValue([]) } }));

const wrap = (ui) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};
const inventory = [
  { sku: 'MR.PS60.NAV', name: 'Navy Polo', category: 'Apparel', stock: 50, committed_qty: 10, reorderLevel: 20 },
  { sku: 'CAP.BLK', name: 'Black Cap', category: 'Headwear', stock: 0, committed_qty: 0, reorderLevel: 15 },
];

test('shows the empty detail prompt until a row is selected, then the item', () => {
  wrap(<StockModule inventory={inventory} onNavigateJob={() => {}} onNavigatePO={() => {}} />);
  expect(screen.getByText(/Select a stock item/i)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Navy Polo'));
  expect(screen.getAllByText('MR.PS60.NAV').length).toBeGreaterThan(0); // appears in list + panel header
  expect(screen.queryByText(/Select a stock item/i)).not.toBeInTheDocument();
});

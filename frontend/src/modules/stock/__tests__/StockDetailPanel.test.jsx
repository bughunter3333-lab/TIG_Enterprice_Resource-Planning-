import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockDetailPanel from '../StockDetailPanel';

vi.mock('../../../api', () => ({ stock: { locations: vi.fn().mockResolvedValue([]), pricing: vi.fn().mockResolvedValue({ levels: [] }), transactions: vi.fn().mockResolvedValue([]), committed: vi.fn().mockResolvedValue([]) } }));

const wrap = (ui) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};
const item = { sku: 'MR.PS60.NAV', name: 'Navy Polo', stock: 50, committed_qty: 10, item_type: 'Depleting' };

test('shows header and Details tab by default; switches tabs', () => {
  wrap(<StockDetailPanel item={item} onNavigateJob={() => {}} onNavigatePO={() => {}} />);
  expect(screen.getAllByText('MR.PS60.NAV').length).toBeGreaterThan(0);
  expect(screen.getByText('Depleting')).toBeInTheDocument(); // Details tab content
  fireEvent.click(screen.getByText('Locations'));
  expect(screen.getByText('Branch')).toBeInTheDocument(); // Locations grid header
});

test('renders an empty-state prompt when no item selected', () => {
  wrap(<StockDetailPanel item={null} onNavigateJob={() => {}} onNavigatePO={() => {}} />);
  expect(screen.getByText(/Select a stock item/i)).toBeInTheDocument();
});

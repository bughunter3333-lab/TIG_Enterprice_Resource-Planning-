import { screen, fireEvent } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import StockDetailPanel from '../StockDetailPanel';

vi.mock('../../../api', () => ({ stock: { locations: vi.fn().mockResolvedValue([]), pricing: vi.fn().mockResolvedValue({ levels: [] }), transactions: vi.fn().mockResolvedValue([]), committed: vi.fn().mockResolvedValue([]), locationSummary: vi.fn().mockResolvedValue({ total_on_hand: 50, located: 50, unlocated: 0, in_sync: true }) } }));

const wrap = renderWithQuery;
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

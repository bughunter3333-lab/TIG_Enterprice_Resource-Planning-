import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockDetailsTab from '../tabs/StockDetailsTab';
import StockLocationsTab from '../tabs/StockLocationsTab';

vi.mock('../../../api', () => ({
  stock: { locations: vi.fn(), pricing: vi.fn(), transactions: vi.fn(), committed: vi.fn() },
}));
import { stock } from '../../../api';

const wrap = (ui) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

const item = { sku: 'MR.PS60.NAV', name: 'Navy Polo', item_type: 'Depleting', gl_group: 'Apparel', barcode: '123', buy_unit: 'UNIT', sell_unit: 'UNIT', stock: 50, committed_qty: 10, on_order_qty: 5 };

test('StockDetailsTab shows item fields and qty summary (available = 40)', () => {
  wrap(<StockDetailsTab item={item} />);
  expect(screen.getByText('Navy Polo')).toBeInTheDocument();
  expect(screen.getByText('Depleting')).toBeInTheDocument();
  expect(screen.getByText('40')).toBeInTheDocument(); // available = 50 - 10
});

test('StockLocationsTab fetches and renders branch rows', async () => {
  stock.locations.mockResolvedValue([
    { id: 1, branch: 'HQ', zone: 'A', qty_on_hand: 30, committed_qty: 5, available_qty: 25, backorder_qty: 0, on_po_qty: 10, primary_bin_1: 'A-03' },
  ]);
  wrap(<StockLocationsTab sku="MR.PS60.NAV" />);
  await waitFor(() => expect(screen.getByText('HQ')).toBeInTheDocument());
  expect(screen.getByText('A-03')).toBeInTheDocument();
  expect(stock.locations).toHaveBeenCalledWith('MR.PS60.NAV');
});

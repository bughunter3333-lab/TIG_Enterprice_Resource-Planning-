import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockDetailsTab from '../tabs/StockDetailsTab';
import StockLocationsTab from '../tabs/StockLocationsTab';
import StockPricingTab from '../tabs/StockPricingTab';
import StockTransactionsTab from '../tabs/StockTransactionsTab';
import StockCommittedTab from '../tabs/StockCommittedTab';

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

test('StockPricingTab shows cost fields and a price level breakpoint', async () => {
  stock.pricing.mockResolvedValue({
    last_cost: 5.5, avg_cost: 5.0, price_template: 'Std',
    price_levels: [{ id: 1, price_level: '1-Price A', currency: 'AUD', tax_code: 'G', breakpoints: [{ id: 9, min_qty: 1, price_ex: 10, price_inc: 11, pont_pct: 50 }] }],
  });
  wrap(<StockPricingTab sku="X" />);
  await waitFor(() => expect(screen.getByText('1-Price A')).toBeInTheDocument());
  expect(screen.getByText(/Std/)).toBeInTheDocument();
});

test('StockTransactionsTab renders movements and fires onNavigateJob on Job# click', async () => {
  stock.transactions.mockResolvedValue([
    { id: 7, date: '05/06/2026', type: 'Sale', reference: '1201766', location_branch: 'HQ', quantity: -5, qty_bal: 0, job_id: '1201766', po_id: null },
  ]);
  const onNavigateJob = vi.fn();
  wrap(<StockTransactionsTab sku="X" onNavigateJob={onNavigateJob} onNavigatePO={() => {}} />);
  await waitFor(() => expect(screen.getByText('Sale')).toBeInTheDocument());
  fireEvent.click(screen.getAllByText('1201766')[1]); // Job# link is the second occurrence
  expect(onNavigateJob).toHaveBeenCalledWith('1201766');
});

test('StockCommittedTab renders committed rows with customer + qty', async () => {
  stock.committed.mockResolvedValue([
    { card_code: 'ONSIT', customer_name: 'Onsite Rental', job_id: '1207747', job_ref: '1207747', date: '10/06/2026', location_branch: 'HQ', qty: 5, unit: 'UNIT', price_ex: 58, price_inc: 63.8, currency: 'AUD', total_aud: 319 },
  ]);
  wrap(<StockCommittedTab sku="X" onNavigateJob={() => {}} />);
  await waitFor(() => expect(screen.getByText('Onsite Rental')).toBeInTheDocument());
  expect(screen.getByText('ONSIT')).toBeInTheDocument();
});

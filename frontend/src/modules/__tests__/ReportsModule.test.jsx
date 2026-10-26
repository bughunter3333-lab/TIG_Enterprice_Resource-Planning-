/**
 * Reports as a role sees it: only the reports it may read, opened on the one
 * it was sent to, and Aged Receivables bucketed by days past the customer's
 * payment terms.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithQuery } from '../../test/renderWithQuery';
import { reports, users } from '../../api';
import ReportsModule from '../ReportsModule';

vi.mock('../../api', () => ({
  users: { myAccess: vi.fn() },
  reports: { agedReceivables: vi.fn(), agedPayables: vi.fn(), onTimeDelivery: vi.fn() },
}));

const EVERY_REPORT = [
  'sales-summary', 'gst', 'aged-receivables', 'aged-payables', 'inventory-valuation',
  'job-profitability', 'on-time-delivery', 'back-orders', 'decoration-performance',
].map((r) => `GET /reports/${r}`);
const STAFF = { role: 'staff', areas: [], allowed: EVERY_REPORT };
// Overseas staff keep only the reports that count jobs and days (2026-10-19).
const OVERSEAS = { role: 'overseas_staff', areas: [], allowed: ['GET /jobs', 'GET /reports/on-time-delivery'] };

const REPORT = {
  rows: [{
    customer_id: 'C1', customer_name: 'Outback Mining', oldest_due: '2026-07-01',
    current: 100, days_1_30: 200, days_31_60: 300, days_61_90: 400, over_90: 500, total: 1500,
    lines: [],
  }],
  totals: { current: 100, days_1_30: 200, days_31_60: 300, days_61_90: 400, over_90: 500, total: 1500 },
  as_at: '2026-10-19',
};

const tabNames = () => screen.getAllByRole('button')
  .map((b) => b.textContent)
  .filter((t) => !['CSV', 'Refresh'].includes(t));

beforeEach(() => {
  vi.clearAllMocks();
  reports.agedReceivables.mockResolvedValue(REPORT);
  reports.onTimeDelivery.mockResolvedValue({ summary: {}, by_customer: [] });
});

test('opens on the report it is given, with every report a staff member may read', async () => {
  users.myAccess.mockResolvedValue(STAFF);
  renderWithQuery(<ReportsModule initialTab="aged" />);
  expect(await screen.findByText('Outback Mining')).toBeInTheDocument();
  expect(tabNames()).toEqual([
    'Overview', 'Sales Summary', 'GST Report', 'Aged Receivables', 'Aged Payables', 'Inventory Valuation',
    'Job Profitability', 'On-Time Delivery', 'Back Orders', 'Decoration Mix',
  ]);
});

test('aged receivables are bucketed by days overdue: Current, then 1–30 to over 90', async () => {
  users.myAccess.mockResolvedValue(STAFF);
  renderWithQuery(<ReportsModule initialTab="aged" />);
  const table = within((await screen.findByText('Outback Mining')).closest('table'));
  expect(table.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
    'Customer', 'Current', '1–30 days', '31–60 days', '61–90 days', 'Over 90 days', 'Total', 'Oldest Due',
  ]);
  const row = within(table.getByText('Outback Mining').closest('tr')).getAllByRole('cell').map((c) => c.textContent);
  expect(row).toEqual(['Outback Mining', '$100.00', '$200.00', '$300.00', '$400.00', '$500.00', '$1,500.00', '2026-07-01']);
});

test('aged payables use the same buckets, so 1–30 days overdue is its own column', async () => {
  users.myAccess.mockResolvedValue(STAFF);
  reports.agedPayables.mockResolvedValue({
    rows: [{ supplier_id: 'S1', supplier_name: 'Workwear Wholesale', current: 0, days_1_30: 75, days_31_60: 0, days_61_90: 0, over_90: 0, total: 75, lines: [] }],
    totals: { current: 0, days_1_30: 75, days_31_60: 0, days_61_90: 0, over_90: 0, total: 75 },
    as_at: '2026-10-24',
  });
  renderWithQuery(<ReportsModule initialTab="agedpay" />);
  const table = within((await screen.findByText('Workwear Wholesale')).closest('table'));
  expect(table.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
    'Supplier', 'Current', '1–30 days', '31–60 days', '61–90 days', 'Over 90 days', 'Total',
  ]);
  const row = within(table.getByText('Workwear Wholesale').closest('tr')).getAllByRole('cell').map((c) => c.textContent);
  expect(row).toEqual(['Workwear Wholesale', '$0.00', '$75.00', '$0.00', '$0.00', '$0.00', '$75.00']);
});

test('open purchase orders are shown as committed spend, apart from what is owed', async () => {
  users.myAccess.mockResolvedValue(STAFF);
  reports.agedPayables.mockResolvedValue({
    rows: [],
    committed: [{ po_id: 'PO-0001', supplier_name: 'Fly Apparel', order_date: '2026-10-01', status: 'Sent', unbilled: 171.05 }],
    totals: { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total: 0, committed: 171.05 },
    as_at: '2026-10-24',
  });
  renderWithQuery(<ReportsModule initialTab="agedpay" />);
  expect(await screen.findByText('No unpaid supplier bills.')).toBeInTheDocument();
  const committed = within(screen.getByText('PO-0001').closest('table'));
  expect(committed.getByText('Fly Apparel')).toBeInTheDocument();
  expect(screen.getByText(/on order, not yet billed/)).toBeInTheDocument();
});

test('overseas staff are shown no money report, and are not sent to one', async () => {
  users.myAccess.mockResolvedValue(OVERSEAS);
  const { client } = renderWithQuery(<ReportsModule initialTab="aged" />);
  await waitFor(() => expect(client.getQueryState(['my-access'])?.status).toBe('success'));
  expect(tabNames()).toEqual(['Overview', 'On-Time Delivery']);
  // The tab it was sent to is not theirs: Overview stands in, and nothing is asked of the server.
  expect(screen.getByText('Total Revenue')).toBeInTheDocument();
  expect(reports.agedReceivables).not.toHaveBeenCalled();
});

test('while access loads, only Overview is drawn and no report is asked for', () => {
  users.myAccess.mockReturnValue(new Promise(() => {}));
  renderWithQuery(<ReportsModule initialTab="aged" />);
  expect(tabNames()).toEqual(['Overview']);
  expect(reports.agedReceivables).not.toHaveBeenCalled();
});

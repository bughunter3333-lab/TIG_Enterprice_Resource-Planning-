/**
 * The customer statement: its PDF is money, so the download is offered only to
 * a role that may fetch it (overseas staff may not, from 2026-10-19).
 *
 * Aged AR: the server's aged receivables for this customer, aged by payment
 * terms from the invoice date (owner decision 2026-10-19) — not worked out on
 * the screen from the job's delivery date.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { reports, users } from '../../../api';
import CustomersDetail from '../CustomersDetail';

vi.mock('../../../api', () => ({ users: { myAccess: vi.fn() }, reports: { agedReceivables: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

const customers = [{ id: 'ACME', name: 'Acme Co', email: 'a@acme.com', contact: 'Al', creditLimit: 0, status: 'Active' }];
const jobs = [{ id: 'J1', customerId: 'ACME', status: 'INVOICE', dateIn: '01/10/2026', total: 110, balanceDue: 110, due: '' }];

const openStatement = async (allowed) => {
  users.myAccess.mockResolvedValue({ role: 'staff', areas: [], allowed });
  const rendered = renderWithQuery(
    <CustomersDetail customers={customers} jobs={jobs} searchTerm="" setSearchTerm={vi.fn()} openModal={vi.fn()}
      deleteCustomer={vi.fn()} exportToCSV={vi.fn()} pinJob={vi.fn()} setActiveModule={vi.fn()} setFilterCustomer={vi.fn()} />,
  );
  fireEvent.click(screen.getByText('Acme Co'));
  fireEvent.click(screen.getByRole('button', { name: 'statement' }));
  await waitFor(() => expect(rendered.client.getQueryState(['my-access'])?.status).toBe('success'));
};

test('a role that may fetch the statement PDF is offered it', async () => {
  await openStatement(['GET /customers/{customer_id}/statement.pdf']);
  expect(screen.getByRole('link', { name: /Download PDF/ })).toHaveAttribute('href', '/api/customers/ACME/statement.pdf');
});

test('a role that may not is not, and the statement itself still shows', async () => {
  await openStatement(['GET /jobs']);
  expect(screen.queryByRole('link', { name: /Download PDF/ })).not.toBeInTheDocument();
  expect(screen.getByText('Account statement — all transactions')).toBeInTheDocument();
});

const AGED = {
  as_at: '2026-10-24',
  totals: {},
  rows: [
    { customer_id: 'OTHER', current: 999, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total: 999 },
    { customer_id: 'ACME', current: 60, days_1_30: 50, days_31_60: 0, days_61_90: 0, over_90: 0, total: 110 },
  ],
};

const renderDetail = (allowed, options) => {
  users.myAccess.mockResolvedValue({ role: 'staff', areas: [], allowed });
  const rendered = renderWithQuery(
    <CustomersDetail customers={customers} jobs={jobs} searchTerm="" setSearchTerm={vi.fn()} openModal={vi.fn()}
      deleteCustomer={vi.fn()} exportToCSV={vi.fn()} pinJob={vi.fn()} setActiveModule={vi.fn()} setFilterCustomer={vi.fn()} />,
    options,
  );
  fireEvent.click(screen.getByText('Acme Co'));
  return rendered;
};

test("Aged AR shows the server's figures for this customer, by days overdue", async () => {
  reports.agedReceivables.mockResolvedValue(AGED);
  renderDetail(['GET /reports/aged-receivables']);

  fireEvent.click(await screen.findByRole('button', { name: 'Aged AR' }));

  const oneTo30 = await screen.findByText('1–30 days');
  expect(oneTo30.parentElement).toHaveTextContent('$50');
  expect(screen.getByText('Current').parentElement).toHaveTextContent('$60');
  expect(screen.getByText('Total outstanding:').parentElement).toHaveTextContent('$110.00');
  expect(screen.queryByText('$999')).not.toBeInTheDocument();
});

test('Aged AR is not offered to a role that may not read aged receivables', async () => {
  const rendered = renderDetail(['GET /jobs']);
  await waitFor(() => expect(rendered.client.getQueryState(['my-access'])?.status).toBe('success'));

  expect(screen.queryByRole('button', { name: 'Aged AR' })).not.toBeInTheDocument();
  expect(reports.agedReceivables).not.toHaveBeenCalled();
});

test("a failed report reads as couldn't load, never as $0 owed", async () => {
  reports.agedReceivables.mockRejectedValue(new Error('boom'));
  renderDetail(['GET /reports/aged-receivables'], { allowQueryErrors: true });

  fireEvent.click(await screen.findByRole('button', { name: 'Aged AR' }));

  expect(await screen.findByText(/Couldn't load/)).toBeInTheDocument();
  expect(screen.queryByText('Total outstanding:')).not.toBeInTheDocument();
});

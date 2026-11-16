/** The statement on screen is the server's: credit notes as credits, as the PDF has them. */
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as api from '../../../api';
import { renderWithQuery } from '../../../test/renderWithQuery';
import CustomerStatement from '../CustomerStatement';

const STATEMENT = {
  lines: [
    { job_id: '200', invoice_no: 'INV-200', date: '2026-10-01', status: 'INVOICE', description: '', total_inc: 61.6, paid: 20, credited: 8.8, balance: 32.8 },
    { job_id: '200', invoice_no: 'CN-0001', date: '2026-10-05', status: 'CREDIT', description: 'Credit note — Wrong size', total_inc: -50, paid: -8.8, credited: 0, balance: -41.2 },
  ],
  totals: { invoiced: 61.6, paid: 20, credited: 50, outstanding: -8.4 },
};

beforeEach(() => {
  vi.spyOn(api.users, 'myAccess').mockResolvedValue({ role: 'staff', areas: [], allowed: ['GET /reports/customers/{customer_id}/statement'] });
  vi.spyOn(api.reports, 'customerStatement').mockResolvedValue(STATEMENT);
});
afterEach(() => vi.restoreAllMocks());

test('credit notes are credits, and the running balance agrees with the total', async () => {
  renderWithQuery(<CustomerStatement customer={{ id: 'C1' }} />);
  expect(await screen.findByText('CN-0001')).toBeInTheDocument();
  expect(screen.getByText('Credit note — Wrong size')).toBeInTheDocument();
  expect(screen.getAllByText('-$8.40')).toHaveLength(2);
  expect(screen.getByText(/credited \$50\.00/)).toBeInTheDocument();
});

test('a role that may not read money says so', async () => {
  api.users.myAccess.mockResolvedValue({ role: 'overseas_staff', areas: [], allowed: [] });
  renderWithQuery(<CustomerStatement customer={{ id: 'C1' }} />);
  expect(await screen.findByText('Statements are for staff and above.')).toBeInTheDocument();
  expect(api.reports.customerStatement).not.toHaveBeenCalled();
});

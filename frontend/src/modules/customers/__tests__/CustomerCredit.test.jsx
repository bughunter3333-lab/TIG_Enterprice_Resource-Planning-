/** A customer's credit on account, applied to one of their open invoices. */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as api from '../../../api';
import { renderWithQuery } from '../../../test/renderWithQuery';
import CustomerCredit from '../CustomerCredit';

const CUSTOMER = { id: 'C1', name: 'Ricoh' };
const NOTE = { id: 'CN-0003', job_id: '100', credit_date: '2026-11-09', total_inc: 50, unapplied: 30, lines: [] };
// The customer's statement, as the server keeps it: every invoice, not the newest 500 jobs.
const STATEMENT = {
  lines: [
    { job_id: '200', invoice_no: 'INV-200', status: 'INVOICE', balance: 12.5 },
    { job_id: '201', invoice_no: 'INV-201', status: 'PAID', balance: 0 },
    { job_id: '100', invoice_no: 'CN-0003', status: 'CREDIT', balance: -30 },
  ],
  totals: {},
};

beforeEach(() => {
  vi.spyOn(api.users, 'myAccess').mockResolvedValue({ role: 'manager', areas: [], allowed: ['GET /credit-notes', 'POST /credit-notes/{note_id}/apply'] });
  vi.spyOn(api.creditNotes, 'list').mockResolvedValue([NOTE]);
  vi.spyOn(api.reports, 'customerStatement').mockResolvedValue(STATEMENT);
});
afterEach(() => vi.restoreAllMocks());

test('credit left is shown and applied, at most what the invoice owes', async () => {
  const apply = vi.spyOn(api.creditNotes, 'apply').mockResolvedValue({});
  renderWithQuery(<CustomerCredit customer={CUSTOMER} />);
  expect(await screen.findByText('$30.00 left')).toBeInTheDocument();
  const invoices = await screen.findByLabelText('Apply CN-0003 to invoice');
  // Only their invoices that still owe.
  expect([...invoices.options].map((o) => o.value)).toEqual(['200']);
  expect(screen.getByLabelText('Amount of CN-0003 to apply')).toHaveValue(12.5);
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(() => expect(apply).toHaveBeenCalledWith('CN-0003', '200', 12.5));
  expect(api.creditNotes.list).toHaveBeenCalledWith({ customerId: 'C1', withCredit: true });
});

test('more than may be applied is not offered', async () => {
  renderWithQuery(<CustomerCredit customer={CUSTOMER} />);
  fireEvent.change(await screen.findByLabelText('Amount of CN-0003 to apply'), { target: { value: '20' } });
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
});

test('with no credit left, nothing shows', async () => {
  api.creditNotes.list.mockResolvedValue([]);
  renderWithQuery(<CustomerCredit customer={CUSTOMER} />);
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole('region', { name: 'Credit on account' })).not.toBeInTheDocument();
});

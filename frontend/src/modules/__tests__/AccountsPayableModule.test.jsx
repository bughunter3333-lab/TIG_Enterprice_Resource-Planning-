/**
 * Paying supplier bills in more than one run (simulation finding F07): each
 * payment is added to what is already paid, the dialog shows the payments so
 * far, and a payment recorded in error can be taken back.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../test/renderWithQuery';
import { accounting, supplierBills } from '../../api';
import AccountsPayableModule from '../AccountsPayableModule';

vi.mock('../../api', () => ({
  supplierBills: {
    list: vi.fn(), summary: vi.fn(), get: vi.fn(), pay: vi.fn(), deletePayment: vi.fn(), update: vi.fn(),
  },
  accounting: { accountOptions: vi.fn() },
}));

const FIRST_RUN = { id: 7, amount: 100, paidDate: '2026-10-20', reference: 'EFT-1', paidBy: 'Sam' };

const bill = (over = {}) => ({
  id: 7, supplierName: 'Western Workwear', billNumber: 'WWS-INV-44120', billDate: '2026-10-01',
  dueDate: '2099-01-01', description: '', amountEx: 167.5, tax: 16.75, amountInc: 184.25,
  status: 'pending', paidAmount: 100, outstanding: 84.25, payments: [], ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  supplierBills.summary.mockResolvedValue({
    total_open_count: 1, total_open_amount: 84.25, overdue_count: 0, overdue_amount: 0,
    due_this_week_count: 0, due_this_week_amount: 0,
  });
});

test('a part-paid bill offers its balance, and shows what has been paid', async () => {
  supplierBills.list.mockResolvedValue([bill()]);
  supplierBills.get.mockResolvedValue(bill({ payments: [FIRST_RUN] }));
  supplierBills.pay.mockResolvedValue(bill({ status: 'paid', paidAmount: 184.25, outstanding: 0 }));
  renderWithQuery(<AccountsPayableModule />);

  fireEvent.click(await screen.findByRole('button', { name: /pay/i }));
  expect(await screen.findByText(/2026-10-20 · \$100\.00 · EFT-1/)).toBeInTheDocument();
  expect(screen.getByLabelText('This payment')).toHaveValue(84.25);

  fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'EFT-2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
  await waitFor(() => expect(supplierBills.pay).toHaveBeenCalledWith(7, 84.25, expect.any(String), 'EFT-2'));
});

test('a payment larger than the balance is stopped before it is sent', async () => {
  supplierBills.list.mockResolvedValue([bill()]);
  supplierBills.get.mockResolvedValue(bill({ payments: [FIRST_RUN] }));
  renderWithQuery(<AccountsPayableModule />);

  fireEvent.click(await screen.findByRole('button', { name: /pay/i }));
  fireEvent.change(await screen.findByLabelText('This payment'), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
  expect(await screen.findByText(/only \$84\.25 is outstanding/i)).toBeInTheDocument();
  expect(supplierBills.pay).not.toHaveBeenCalled();
});

test('a bill against a PO says whether it charges for what arrived', async () => {
  supplierBills.list.mockResolvedValue([
    bill({ poId: 'PO-M1', poMatch: { receivedInc: 184.25, billedInc: 200, difference: 15.75, matches: false } }),
    bill({ id: 8, billNumber: 'B-OK', poId: 'PO-M2', poMatch: { receivedInc: 50, billedInc: 50, difference: 0, matches: true } }),
  ]);
  renderWithQuery(<AccountsPayableModule />);
  expect(await screen.findByText('PO-M1: billed $15.75 more than received')).toBeInTheDocument();
  expect(screen.getByText(/PO-M2 ✓ matches received/)).toBeInTheDocument();
});

test('editing a bill sends its status only when it was changed', async () => {
  // A paid bill whose total is corrected upward: the server reopens it from
  // its payments. Sending back the 'paid' it was opened with was refused.
  supplierBills.list.mockResolvedValue([bill({ status: 'paid', paidAmount: 184.25, outstanding: 0 })]);
  supplierBills.update.mockResolvedValue(bill());
  accounting.accountOptions.mockResolvedValue([]);
  renderWithQuery(<AccountsPayableModule />);

  fireEvent.click(await screen.findByRole('button', { name: 'Edit bill WWS-INV-44120' }));
  fireEvent.change(screen.getByDisplayValue('184.25'), { target: { value: '200' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(supplierBills.update).toHaveBeenCalled());
  const [, sent] = supplierBills.update.mock.calls[0];
  expect(sent.amountInc).toBe(200);
  expect(sent.status).toBeUndefined();
});

test('a paid bill lists its payments and one can be taken back', async () => {
  const paid = bill({ status: 'paid', paidAmount: 184.25, outstanding: 0 });
  supplierBills.list.mockResolvedValue([paid]);
  supplierBills.get.mockResolvedValue({ ...paid, payments: [FIRST_RUN, { ...FIRST_RUN, id: 8, amount: 84.25, reference: '' }] });
  supplierBills.deletePayment.mockResolvedValue(bill());
  renderWithQuery(<AccountsPayableModule />);

  fireEvent.click(await screen.findByRole('button', { name: 'Payments' }));
  expect(screen.queryByRole('button', { name: 'Record Payment' })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: /take back the payment of \$84\.25/i }));
  await waitFor(() => expect(supplierBills.deletePayment).toHaveBeenCalledWith(7, 8));
});

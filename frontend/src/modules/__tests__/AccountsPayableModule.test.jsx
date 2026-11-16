/**
 * Paying supplier bills in more than one run (simulation finding F07): each
 * payment is added to what is already paid, the dialog shows the payments so
 * far, and a payment recorded in error can be taken back.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithQuery } from '../../test/renderWithQuery';
import { accounting, supplierBills } from '../../api';
import AccountsPayableModule from '../AccountsPayableModule';

vi.mock('../../api', () => ({
  supplierBills: {
    list: vi.fn(), summary: vi.fn(), get: vi.fn(), pay: vi.fn(), deletePayment: vi.fn(), update: vi.fn(),
    applyCredit: vi.fn(),
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

test('a bill against a PO shows what was ordered, received and billed on it (F36)', async () => {
  supplierBills.list.mockResolvedValue([
    bill({ poId: 'PO-M1', poMatch: { orderedInc: 220, receivedInc: 184.25, billedInc: 200, difference: 15.75, matches: false } }),
  ]);
  renderWithQuery(<AccountsPayableModule />);
  expect(await screen.findByText('Ordered $220.00 · received $184.25 · billed $200.00')).toBeInTheDocument();
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

// ── S2-09: a supplier's credit note comes off one of its bills ───────────────

const PRINTCO = { supplierId: 'PRINTCO', supplierName: 'Print Co' };
const printBill = bill({ id: 1, ...PRINTCO, billNumber: 'PRT-INV-55', amountInc: 554.4, outstanding: 554.4, paidAmount: 0 });
const smallBill = bill({ id: 3, ...PRINTCO, billNumber: 'PRT-INV-56', amountInc: 50, outstanding: 50, paidAmount: 0 });
const credit = bill({ id: 2, ...PRINTCO, billNumber: 'PRT-CN-55', amountEx: -100, tax: -10, amountInc: -110, outstanding: -110, paidAmount: 0 });

test('a credit note is applied, not paid, to one of the supplier\'s open bills', async () => {
  supplierBills.list.mockResolvedValue([printBill, smallBill, credit]);
  supplierBills.applyCredit.mockResolvedValue({ ...printBill, outstanding: 444.4 });
  renderWithQuery(<AccountsPayableModule />);

  fireEvent.click(await screen.findByRole('button', { name: 'Apply credit note PRT-CN-55' }));
  const dialog = await screen.findByRole('dialog', { name: 'Apply credit note' });
  // One owing less than the $110 credit cannot take it.
  expect(await within(dialog).findByRole('radio', { name: /PRT-INV-56/ })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('radio', { name: /PRT-INV-55/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Apply Credit' }));
  await waitFor(() => expect(supplierBills.applyCredit).toHaveBeenCalledWith(2, 1));
  expect(supplierBills.pay).not.toHaveBeenCalled();
  // The supplier's open bills, asked of the server — not the first page of all
  // their bills, which is the oldest and paid.
  expect(supplierBills.list).toHaveBeenCalledWith({ supplier_id: 'PRINTCO', open_only: true });
});

test('an applied credit names its bill even when that bill is not listed', async () => {
  // Filtered to Paid: the bill it came off still owes, so it is not here.
  supplierBills.list.mockResolvedValue([
    { ...credit, status: 'paid', outstanding: 0, appliedToBillId: 1, appliedToBillNumber: 'PRT-INV-55' },
  ]);
  renderWithQuery(<AccountsPayableModule />);
  expect(await screen.findByText('Applied to PRT-INV-55')).toBeInTheDocument();
});

test('an applied credit note names the bill it came off', async () => {
  supplierBills.list.mockResolvedValue([
    { ...printBill, outstanding: 444.4 },
    { ...credit, status: 'paid', outstanding: 0, appliedToBillId: 1 },
  ]);
  renderWithQuery(<AccountsPayableModule />);
  expect(await screen.findByText('Applied to PRT-INV-55')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /apply credit note/i })).not.toBeInTheDocument();
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

/**
 * One remittance, paying the customer's oldest invoices first.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { customers } from '../../../api';
import RemittanceForm, { remittanceProblems } from '../RemittanceForm';

vi.mock('../../../api', () => ({
  customers: { recordRemittance: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

test('a remittance is recorded once and the invoices it paid are listed', async () => {
  customers.recordRemittance.mockResolvedValue({
    amount: 400, payments: [{ job_id: 'R-1', amount: 110, payment_id: 1 }, { job_id: 'R-2', amount: 290, payment_id: 2 }],
  });
  renderWithQuery(<RemittanceForm customerId="CFG" owed={660} />);
  fireEvent.change(screen.getByLabelText('Amount received'), { target: { value: '400' } });
  fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'CFG-REMIT-0042' } });
  fireEvent.click(screen.getByRole('button', { name: /pay oldest invoices first/i }));
  await waitFor(() => expect(customers.recordRemittance).toHaveBeenCalledWith(
    'CFG', expect.objectContaining({ amount: 400, reference: 'CFG-REMIT-0042', method: 'EFT' }),
  ));
  expect(await screen.findByText('#R-2 — $290.00')).toBeInTheDocument();
});

test('more than is owed is stopped before it is sent', () => {
  renderWithQuery(<RemittanceForm customerId="CFG" owed={660} />);
  fireEvent.change(screen.getByLabelText('Amount received'), { target: { value: '700' } });
  fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'X' } });
  fireEvent.click(screen.getByRole('button', { name: /pay oldest invoices first/i }));
  expect(screen.getByRole('alert')).toHaveTextContent('They owe $660.00');
  expect(customers.recordRemittance).not.toHaveBeenCalled();
});

test('what a remittance needs', () => {
  expect(remittanceProblems({ amount: '10', reference: 'R' }, 20)).toEqual({});
  expect(Object.keys(remittanceProblems({ amount: '', reference: 'R' }, 20))).toEqual(['amount']);
  expect(Object.keys(remittanceProblems({ amount: '5', reference: ' ' }, 20))).toEqual(['reference']);
});

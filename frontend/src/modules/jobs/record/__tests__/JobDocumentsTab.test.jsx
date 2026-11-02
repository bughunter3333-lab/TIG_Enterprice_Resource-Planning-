/**
 * The job record's Documents tab (F23): its tax invoice card is built in the
 * browser from job data every role can read, so it is offered only where the
 * sales register is — the same rule as the Print menu. Overseas staff could
 * open a full-price tax invoice from this tab after the menu was gated.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import JobDocumentsTab from '../JobDocumentsTab';

const job = { id: '110000' };
const noSalesRegister = (method, path) => !(method === 'GET' && path === '/jobs/sales-register');
const cards = () => screen.getAllByRole('button').map((b) => b.querySelector('p').textContent);

test('without the sales register, the tax invoice card is not offered', () => {
  render(<JobDocumentsTab job={job} offer={noSalesRegister} onInvoice={() => {}} onDocument={() => {}} />);
  expect(cards()).toEqual(['TIG Picking Slip', 'TIG Delivery Note', 'TIG Job Sheet', 'Ship Label']);
});

test('with it, the tax invoice card opens the invoice and the rest print their document', () => {
  const onInvoice = vi.fn();
  const onDocument = vi.fn();
  render(<JobDocumentsTab job={job} offer={() => true} onInvoice={onInvoice} onDocument={onDocument} />);
  expect(cards()).toEqual(['TIG TAX Invoice', 'TIG Picking Slip', 'TIG Delivery Note', 'TIG Job Sheet', 'Ship Label']);
  fireEvent.click(screen.getByRole('button', { name: /TIG TAX Invoice/ }));
  expect(onInvoice).toHaveBeenCalledWith(job);
  fireEvent.click(screen.getByRole('button', { name: /TIG Picking Slip/ }));
  expect(onDocument).toHaveBeenCalledWith('pickingSlip', job);
});

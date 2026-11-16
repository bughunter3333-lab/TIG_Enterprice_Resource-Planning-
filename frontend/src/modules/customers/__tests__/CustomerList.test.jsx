import { render, screen, fireEvent } from '@testing-library/react';
import CustomerList from '../CustomerList';
import { custOutstanding, custRevenue, filterCustomers, customerKpis } from '../customerAggregates';

const customers = [
  { id: 'ACME', name: 'Acme Co', email: 'a@acme.com', contact: 'Al', creditLimit: 1000, balance: 200, status: 'Active' },
  { id: 'BHP', name: 'BHP Group', email: 'b@bhp.com', contact: 'Bo', creditLimit: 1000, balance: 1500, status: 'Active' },
];
// Only invoiced jobs (INVOICE, PAID) are money owed or sales made — the same
// basis as the ledger's receivables, the customer statement and aged
// receivables. A quote owes nothing; an open order is not yet a sale.
const jobs = [
  { customerId: 'ACME', status: 'INVOICE', total: 550, subtotal: 500, balanceDue: 200 },
  { customerId: 'ACME', status: 'PAID', total: 330, subtotal: 300, balanceDue: 0 },
  { customerId: 'ACME', status: 'QUOTE', total: 2200, subtotal: 2000, balanceDue: 2200 },
  { customerId: 'ACME', status: 'ORDER', total: 1100, subtotal: 1000, balanceDue: 1100 },
  { customerId: 'ACME', status: 'CANCEL', total: 440, subtotal: 400, balanceDue: 440 },
  { customerId: 'BHP', status: 'INVOICE', total: 990, subtotal: 900, balanceDue: 990 },
];

test('outstanding is the balance the server holds, not a sum over the loaded jobs (F06)', () => {
  // The list holds the newest 500 jobs only, so an unpaid invoice older than
  // them was missing from the sum; the server's balance is what aged
  // receivables and the credit check read.
  expect(custOutstanding(customers[0], jobs)).toBe(200);
  expect(custOutstanding(customers[1], jobs)).toBe(1500);
  expect(custOutstanding({ id: 'NEW' }, jobs)).toBe(0);
});

test('revenue is invoiced sales excluding GST', () => {
  expect(custRevenue(customers[0], jobs)).toBe(800);
});

test('customerKpis: count, revenue, outstanding, overCredit on the same basis', () => {
  const k = customerKpis(customers, jobs);
  expect(k.total).toBe(2);
  expect(k.revenue).toBe(1700);
  expect(k.outstanding).toBe(1700);
  // ACME owes 200 against 1000 — the 1,100 order does not push it over. BHP's
  // balance is 1,500 against 1,000, though only 990 of it is in the loaded jobs.
  expect(k.overCredit).toBe(1);
});

test('filterCustomers matches name/email/id/contact', () => {
  expect(filterCustomers(customers, 'acme')).toHaveLength(1);
  expect(filterCustomers(customers, 'bo')).toHaveLength(1);     // contact
  expect(filterCustomers(customers, '')).toHaveLength(2);
});

test('CustomerList renders rows with balance and fires onSelect', () => {
  const onSelect = vi.fn();
  render(<CustomerList customers={customers} jobs={jobs} selectedId={null} onSelect={onSelect} />);
  expect(screen.getByText('Acme Co')).toBeInTheDocument();
  expect(screen.getByText('$200')).toBeInTheDocument();   // ACME outstanding
  expect(screen.getByText('$1,500')).toBeInTheDocument(); // BHP: the server's balance
  fireEvent.click(screen.getByText('BHP Group'));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'BHP' }));
});

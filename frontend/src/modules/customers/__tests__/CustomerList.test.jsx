import { render, screen, fireEvent } from '@testing-library/react';
import CustomerList from '../CustomerList';
import { custOutstanding, custRevenue, filterCustomers, customerKpis } from '../customerAggregates';

const customers = [
  { id: 'ACME', name: 'Acme Co', email: 'a@acme.com', contact: 'Al', creditLimit: 1000, status: 'Active' },
  { id: 'BHP', name: 'BHP Group', email: 'b@bhp.com', contact: 'Bo', creditLimit: 0, status: 'Active' },
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

test('outstanding is what invoiced jobs still owe; quotes, orders and cancelled jobs owe nothing', () => {
  expect(custOutstanding(customers[0], jobs)).toBe(200);
  expect(custOutstanding(customers[1], jobs)).toBe(990);
});

test('revenue is invoiced sales excluding GST', () => {
  expect(custRevenue(customers[0], jobs)).toBe(800);
});

test('customerKpis: count, revenue, outstanding, overCredit on the same basis', () => {
  const k = customerKpis(customers, jobs);
  expect(k.total).toBe(2);
  expect(k.revenue).toBe(1700);
  expect(k.outstanding).toBe(1190);
  // ACME owes 200 against 1000 — the 1,100 order no longer pushes it over.
  expect(k.overCredit).toBe(0);
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
  fireEvent.click(screen.getByText('BHP Group'));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'BHP' }));
});

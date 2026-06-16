import { render, screen, fireEvent } from '@testing-library/react';
import CustomerList from '../CustomerList';
import { custOutstanding, custRevenue, filterCustomers, customerKpis } from '../customerAggregates';

const customers = [
  { id: 'ACME', name: 'Acme Co', email: 'a@acme.com', contact: 'Al', creditLimit: 1000, status: 'Active' },
  { id: 'BHP', name: 'BHP Group', email: 'b@bhp.com', contact: 'Bo', creditLimit: 0, status: 'Active' },
];
const jobs = [
  { customerId: 'ACME', total: 500, balanceDue: 200 },
  { customerId: 'ACME', total: 300, balanceDue: 0 },
  { customerId: 'BHP', total: 900, balanceDue: 900 },
];

test('aggregates: outstanding sums balanceDue, revenue sums total, per customer', () => {
  expect(custOutstanding(customers[0], jobs)).toBe(200);
  expect(custRevenue(customers[0], jobs)).toBe(800);
  expect(custOutstanding(customers[1], jobs)).toBe(900);
});

test('customerKpis: count, revenue, outstanding, overCredit', () => {
  const k = customerKpis(customers, jobs);
  expect(k.total).toBe(2);
  expect(k.revenue).toBe(1700);
  expect(k.outstanding).toBe(1100);
  expect(k.overCredit).toBe(0); // ACME 200 < 1000; BHP creditLimit 0 → excluded
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

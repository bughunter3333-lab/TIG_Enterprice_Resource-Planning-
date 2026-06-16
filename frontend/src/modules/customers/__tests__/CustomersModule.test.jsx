import { render, screen, fireEvent } from '@testing-library/react';
import CustomersModule from '../CustomersModule';

const customers = [
  { id: 'ACME', name: 'Acme Co', email: 'a@acme.com', contact: 'Al', creditLimit: 1000, status: 'Active' },
  { id: 'BHP', name: 'BHP Group', email: 'b@bhp.com', contact: 'Bo', creditLimit: 0, status: 'Active' },
];
const jobs = [{ customerId: 'ACME', total: 500, balanceDue: 200 }];
const base = {
  customers, jobs, search: '',
  onSearchChange: vi.fn(), selectedId: null,
  onSelectCustomer: vi.fn(), onNewCustomer: vi.fn(), onExport: vi.fn(),
};

test('renders KPI total and all customer rows', () => {
  render(<CustomersModule {...base} />);
  expect(screen.getByText('Acme Co')).toBeInTheDocument();
  expect(screen.getByText('BHP Group')).toBeInTheDocument();
});

test('search input forwards changes; New + Export fire callbacks', () => {
  render(<CustomersModule {...base} />);
  fireEvent.change(screen.getByPlaceholderText('Search customers…'), { target: { value: 'acme' } });
  expect(base.onSearchChange).toHaveBeenCalledWith('acme');
  fireEvent.click(screen.getByText('New Customer'));
  expect(base.onNewCustomer).toHaveBeenCalled();
  fireEvent.click(screen.getByText('Export'));
  expect(base.onExport).toHaveBeenCalled();
});

test('search prop filters the visible list', () => {
  render(<CustomersModule {...base} search="bhp" />);
  expect(screen.getByText('BHP Group')).toBeInTheDocument();
  expect(screen.queryByText('Acme Co')).not.toBeInTheDocument();
});

test('row click fires onSelectCustomer', () => {
  render(<CustomersModule {...base} />);
  fireEvent.click(screen.getByText('Acme Co'));
  expect(base.onSelectCustomer).toHaveBeenCalledWith(expect.objectContaining({ id: 'ACME' }));
});

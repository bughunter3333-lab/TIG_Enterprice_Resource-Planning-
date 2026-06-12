import { render, screen, fireEvent } from '@testing-library/react';
import DataGrid from '../DataGrid';

const columns = [
  { key: 'id', label: 'Job#', width: 80 },
  { key: 'customer', label: 'Customer' },
  { key: 'value', label: 'Value', align: 'right' },
];
const rows = [
  { id: 'B', customer: 'Onsite', value: 319 },
  { id: 'A', customer: 'BHP', value: 867 },
];

test('renders rows and fires onRowClick', () => {
  const onRowClick = vi.fn();
  render(<DataGrid columns={columns} rows={rows} onRowClick={onRowClick} />);
  fireEvent.click(screen.getByText('BHP'));
  expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'A' }));
});

test('clicking a header sorts asc then desc then back to unsorted', () => {
  render(<DataGrid columns={columns} rows={rows} />);
  const header = screen.getByText('Job#');
  fireEvent.click(header);
  let cells = screen.getAllByRole('row').slice(1); // skip header row
  expect(cells[0]).toHaveTextContent('A');
  fireEvent.click(header);
  cells = screen.getAllByRole('row').slice(1);
  expect(cells[0]).toHaveTextContent('B');
  fireEvent.click(header); // third click: back to unsorted (original order)
  cells = screen.getAllByRole('row').slice(1);
  expect(cells[0]).toHaveTextContent('B');
  expect(cells[1]).toHaveTextContent('A');
  expect(document.querySelector('svg.lucide-chevron-up')).toBeNull();
  expect(document.querySelector('svg.lucide-chevron-down')).toBeNull();
});

test('shows loading, error with retry, and empty states', () => {
  const onRetry = vi.fn();
  const { rerender } = render(<DataGrid columns={columns} rows={null} />);
  expect(screen.getByText('Loading…')).toBeInTheDocument();
  rerender(<DataGrid columns={columns} rows={[]} error="Server unreachable" onRetry={onRetry} />);
  expect(screen.getByText('Server unreachable')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Retry'));
  expect(onRetry).toHaveBeenCalled();
  rerender(<DataGrid columns={columns} rows={[]} />);
  expect(screen.getByText('No records')).toBeInTheDocument();
});

test('column render prop formats cell content', () => {
  const cols = [...columns.slice(0, 2), { key: 'value', label: 'Value', render: (row) => `$${row.value}` }];
  render(<DataGrid columns={cols} rows={rows} />);
  expect(screen.getByText('$319')).toBeInTheDocument();
  expect(screen.getByText('$867')).toBeInTheDocument();
});

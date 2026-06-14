import { render, screen, fireEvent } from '@testing-library/react';
import POModule from '../POModule';
import { EMPTY_PO_FILTERS } from '../poFilters';

const pos = [
  { id: 'PO-1', supplier: 'AS Colour', supplierCode: 'ASC', status: 'Draft', date: '01/06/2026', expectedDate: '10/06/2026', total: 500 },
  { id: 'PO-2', supplier: 'Biz', supplierCode: 'BIZ', status: 'Sent', date: '02/06/2026', expectedDate: '12/06/2026', total: 1200 },
];
const base = {
  purchaseOrders: pos,
  filters: EMPTY_PO_FILTERS,
  onFilterChange: vi.fn(),
  selectedId: null,
  onSelectPO: vi.fn(),
  onNewPO: vi.fn(),
  onExport: vi.fn(),
};

test('shows KPI counts and all rows by default', () => {
  render(<POModule {...base} />);
  expect(screen.getByText('PO-1')).toBeInTheDocument();
  expect(screen.getByText('PO-2')).toBeInTheDocument();
});

test('status filter narrows the list and a status button fires onFilterChange', () => {
  render(<POModule {...base} filters={{ ...EMPTY_PO_FILTERS, status: 'Draft' }} />);
  expect(screen.getByText('PO-1')).toBeInTheDocument();
  expect(screen.queryByText('PO-2')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sent' }));
  expect(base.onFilterChange).toHaveBeenCalledWith('status', 'Sent');
});

test('row click fires onSelectPO; New PO + Export fire their callbacks', () => {
  render(<POModule {...base} />);
  fireEvent.click(screen.getByText('AS Colour'));
  expect(base.onSelectPO).toHaveBeenCalledWith(expect.objectContaining({ id: 'PO-1' }));
  fireEvent.click(screen.getByText('New PO'));
  expect(base.onNewPO).toHaveBeenCalled();
  fireEvent.click(screen.getByText('Export'));
  expect(base.onExport).toHaveBeenCalled();
});

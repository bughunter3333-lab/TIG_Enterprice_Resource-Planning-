import { render, screen, fireEvent } from '@testing-library/react';
import POList from '../POList';
import { filterPOs, poCounts, EMPTY_PO_FILTERS } from '../poFilters';

const pos = [
  { id: 'PO-1001', supplier: 'AS Colour', supplierCode: 'ASC', status: 'Draft', date: '01/06/2026', expectedDate: '10/06/2026', total: 500 },
  { id: 'PO-1002', supplier: 'Biz Collection', supplierCode: 'BIZ', status: 'Sent', date: '02/06/2026', expectedDate: '12/06/2026', total: 1200 },
  { id: 'PO-1003', supplier: 'AS Colour', supplierCode: 'ASC', status: 'Received', date: '03/06/2026', expectedDate: '09/06/2026', total: 900 },
];

test('filterPOs: search matches id/supplier/code; status narrows', () => {
  expect(filterPOs(pos, { ...EMPTY_PO_FILTERS, search: 'as colour' })).toHaveLength(2);
  expect(filterPOs(pos, { ...EMPTY_PO_FILTERS, search: 'PO-1002' })).toHaveLength(1);
  expect(filterPOs(pos, { ...EMPTY_PO_FILTERS, status: 'Draft' })).toHaveLength(1);
});

test('poCounts: total, draft, awaitingReceipt (Sent+Partial)', () => {
  const c = poCounts(pos);
  expect(c.total).toBe(3);
  expect(c.draft).toBe(1);
  expect(c.awaitingReceipt).toBe(1); // only the Sent one
});

test('POList renders rows, money, and fires onSelect', () => {
  const onSelect = vi.fn();
  render(<POList pos={pos} selectedId={null} onSelect={onSelect} />);
  expect(screen.getByText('PO-1001')).toBeInTheDocument();
  expect(screen.getByText('$1,200.00')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Biz Collection'));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'PO-1002' }));
});

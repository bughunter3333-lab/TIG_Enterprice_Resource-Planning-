import { render, screen, fireEvent } from '@testing-library/react';
import POList from '../POList';
import { filterPOs, isLatePO, poCounts, EMPTY_PO_FILTERS } from '../poFilters';

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

test('isLatePO: out with the supplier (Sent or Partial) and expected before today', () => {
  const today = '2026-06-12';
  expect(isLatePO({ status: 'Sent', expectedDate: '11/06/2026' }, today)).toBe(true);
  expect(isLatePO({ status: 'Partial', expectedDate: '2026-06-01' }, today)).toBe(true);
  // Due today is not late yet.
  expect(isLatePO({ status: 'Sent', expectedDate: '12/06/2026' }, today)).toBe(false);
  expect(isLatePO({ status: 'Draft', expectedDate: '01/06/2026' }, today)).toBe(false);
  expect(isLatePO({ status: 'Received', expectedDate: '01/06/2026' }, today)).toBe(false);
  expect(isLatePO({ status: 'Sent', expectedDate: '' }, today)).toBe(false);
  expect(isLatePO(null, today)).toBe(false);
});

test('filterPOs: status "late" is the late set, with the search still applied', () => {
  expect(filterPOs(pos, { ...EMPTY_PO_FILTERS, status: 'late' }, '2026-06-13').map((p) => p.id)).toEqual(['PO-1002']);
  expect(filterPOs(pos, { ...EMPTY_PO_FILTERS, status: 'late' }, '2026-06-12')).toEqual([]);
  expect(filterPOs(pos, { search: 'as colour', status: 'late' }, '2026-06-13')).toEqual([]);
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

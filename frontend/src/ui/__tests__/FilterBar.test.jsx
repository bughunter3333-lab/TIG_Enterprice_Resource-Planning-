import { render, screen, fireEvent, within } from '@testing-library/react';
import FilterBar from '../FilterBar';

const available = [
  { key: 'status', label: 'Status', options: [{ value: 'FINISH', label: 'Finish' }, { value: 'PRINT', label: 'Print' }] },
  { key: 'accMgr', label: 'Acc Mgr', options: [{ value: 'SM', label: 'SM' }] },
];

test('renders active filter chips and removes on ✕', () => {
  const onRemove = vi.fn();
  render(<FilterBar filters={[{ key: 'status', label: 'Status', value: 'FINISH', display: 'Finish' }]} available={available} onAdd={() => {}} onRemove={onRemove} />);
  const remove = screen.getByLabelText('Remove Status filter');
  // The pill names the filter and what it is set to.
  expect(remove.parentElement).toHaveTextContent('Status');
  expect(remove.parentElement).toHaveTextContent('Finish');
  fireEvent.click(remove);
  expect(onRemove).toHaveBeenCalledWith('status');
});

test('adds a filter via the + Filter menu', () => {
  const onAdd = vi.fn();
  render(<FilterBar filters={[]} available={available} onAdd={onAdd} onRemove={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
  fireEvent.click(screen.getByText('Acc Mgr'));
  fireEvent.click(screen.getByText('SM'));
  expect(onAdd).toHaveBeenCalledWith('accMgr', 'SM');
});

test('closes menu on outside mousedown', () => {
  render(<FilterBar filters={[]} available={available} onAdd={() => {}} onRemove={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
  expect(screen.getByText('Status')).toBeInTheDocument();
  fireEvent.mouseDown(document.body);
  expect(screen.queryByText('Status')).not.toBeInTheDocument();
});

test('already-active filter fields are excluded from the add menu', () => {
  render(<FilterBar filters={[{ key: 'status', label: 'Status', value: 'FINISH', display: 'Finish' }]} available={available} onAdd={() => {}} onRemove={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
  const menu = screen.getByRole('menu');
  expect(within(menu).getByText('Acc Mgr')).toBeInTheDocument();
  expect(within(menu).queryByText('Status')).not.toBeInTheDocument(); // the pill shows Status; the menu must not offer it again
});

import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar from '../FilterBar';

const available = [
  { key: 'status', label: 'Status', options: [{ value: 'FINISH', label: 'Finish' }, { value: 'PRINT', label: 'Print' }] },
  { key: 'accMgr', label: 'Acc Mgr', options: [{ value: 'SM', label: 'SM' }] },
];

test('renders active filter chips and removes on ✕', () => {
  const onRemove = vi.fn();
  render(<FilterBar filters={[{ key: 'status', label: 'Status', value: 'FINISH', display: 'Finish' }]} available={available} onAdd={() => {}} onRemove={onRemove} />);
  expect(screen.getByText(/Status: Finish/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Remove Status filter'));
  expect(onRemove).toHaveBeenCalledWith('status');
});

test('adds a filter via the + Filter menu', () => {
  const onAdd = vi.fn();
  render(<FilterBar filters={[]} available={available} onAdd={onAdd} onRemove={() => {}} />);
  fireEvent.click(screen.getByText('+ Filter'));
  fireEvent.click(screen.getByText('Acc Mgr'));
  fireEvent.click(screen.getByText('SM'));
  expect(onAdd).toHaveBeenCalledWith('accMgr', 'SM');
});

test('closes menu on outside mousedown', () => {
  render(<FilterBar filters={[]} available={available} onAdd={() => {}} onRemove={() => {}} />);
  fireEvent.click(screen.getByText('+ Filter'));
  expect(screen.getByText('Status')).toBeInTheDocument();
  fireEvent.mouseDown(document.body);
  expect(screen.queryByText('Status')).not.toBeInTheDocument();
});

test('already-active filter fields are excluded from the add menu', () => {
  render(<FilterBar filters={[{ key: 'status', label: 'Status', value: 'FINISH', display: 'Finish' }]} available={available} onAdd={() => {}} onRemove={() => {}} />);
  fireEvent.click(screen.getByText('+ Filter'));
  expect(screen.getByText('Acc Mgr')).toBeInTheDocument();
  expect(screen.queryByText(/^Status$/)).not.toBeInTheDocument(); // chip says "Status: Finish", menu must not list bare "Status"
});

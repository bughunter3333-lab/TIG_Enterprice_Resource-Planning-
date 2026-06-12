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

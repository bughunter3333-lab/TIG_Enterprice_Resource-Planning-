import { render, screen, fireEvent } from '@testing-library/react';
import JobsList from '../JobsList';
import JobsModule from '../JobsModule';
import { EMPTY_JOBS_FILTERS } from '../jobsFilters';

const jobs = [
  { id: '1001', customer: 'BHP Group', status: 'PRINT', priority: 'Urgent', accMgr: 'SM', total: 1500, due: '12/06/2026', items: [{ decorationType: 'Embroidery' }] },
  { id: '1002', customer: 'Onsite Rental', status: 'QUOTE', priority: 'Normal', accMgr: 'JC', total: 300, due: '15/06/2026', items: [] },
];

test('renders job rows with status badge and money formatting, fires onJobClick', () => {
  const onJobClick = vi.fn();
  render(<JobsList jobs={jobs} onJobClick={onJobClick} />);
  expect(screen.getByText('1001')).toBeInTheDocument();
  expect(screen.getByText('PRINT')).toBeInTheDocument();      // StatusBadge text
  expect(screen.getByText('$1,500')).toBeInTheDocument();      // money, no decimals
  expect(screen.getByText('Embroidery')).toBeInTheDocument();  // decoration column
  fireEvent.click(screen.getByText('BHP Group'));
  expect(onJobClick).toHaveBeenCalledWith(expect.objectContaining({ id: '1001' }));
});

const moduleJobs = [
  { id: '2001', customer: 'Ventia', customerId: 'VENT', status: 'PRINT', priority: 'Normal', assignedTo: 'Emon', due: '12/06/2026', total: 100, items: [], shipTo: 'SYD' },
  { id: '2002', customer: 'CPB', customerId: 'CPB', status: 'QUOTE', priority: 'Urgent', assignedTo: 'Sam', due: '15/06/2026', total: 200, items: [], shipTo: 'MEL' },
];

const base = {
  jobs: moduleJobs,
  filters: EMPTY_JOBS_FILTERS,
  onFilterChange: vi.fn(),
  onClearFilters: vi.fn(),
  viewMode: 'table',
  onViewModeChange: vi.fn(),
  currentUser: { username: 'Emon' },
  onJobClick: vi.fn(),
};

test('table mode shows filtered rows; active filter renders a removable chip', () => {
  render(<JobsModule {...base} filters={{ ...EMPTY_JOBS_FILTERS, status: 'PRINT' }} />);
  expect(screen.getByText('2001')).toBeInTheDocument();
  expect(screen.queryByText('2002')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Remove Status filter'));
  expect(base.onFilterChange).toHaveBeenCalledWith('status', 'all');
});

test('board mode renders kanban columns instead of the grid', () => {
  render(<JobsModule {...base} viewMode="board" />);
  expect(screen.getByText('QUOTE')).toBeInTheDocument();   // column header
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('view toggle fires onViewModeChange', () => {
  render(<JobsModule {...base} />);
  fireEvent.click(screen.getByLabelText('Board view'));
  expect(base.onViewModeChange).toHaveBeenCalledWith('board');
});

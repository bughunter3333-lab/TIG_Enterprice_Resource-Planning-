import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { jobs as jobsApi } from '../../../api';
import JobsList from '../JobsList';
import JobsModule from '../JobsModule';
import { EMPTY_JOBS_FILTERS } from '../jobsFilters';

// The module asks the server too once a search is typed (F01).
// And the person's access, which decides whether the selection bar offers
// Raise POs.
vi.mock('../../../api', () => ({
  jobs: { list: vi.fn() },
  users: { myAccess: vi.fn(() => Promise.resolve({ role: 'staff', areas: [], allowed: [] })) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  jobsApi.list.mockResolvedValue([]);
});

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

test('the ship-to code is a column, because it is what tells one site from another', () => {
  // ORD6/JIM15. On a multi-site order every row is the same customer, status,
  // decoration and date; the ship code is the only thing that distinguishes
  // Noosa from Malvern East. It already drove the filter bar and the search and
  // was never drawn, so an operator could narrow to one site but never see the
  // shape of the whole order.
  render(
    <JobsList
      jobs={[
        { ...jobs[0], shipTo: 'RICO.2201' },
        { ...jobs[1], shipTo: 'RICO.2202' },
      ]}
      onJobClick={() => {}}
    />,
  );
  expect(screen.getByText('RICO.2201')).toBeInTheDocument();
  expect(screen.getByText('RICO.2202')).toBeInTheDocument();
});

test('a job with no ship-to shows a dash rather than an empty cell', () => {
  render(<JobsList jobs={[jobs[0]]} onJobClick={() => {}} />);
  expect(screen.getByText('—')).toBeInTheDocument();
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
  renderWithQuery(<JobsModule {...base} filters={{ ...EMPTY_JOBS_FILTERS, status: 'PRINT' }} />);
  expect(screen.getByText('2001')).toBeInTheDocument();
  expect(screen.queryByText('2002')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Remove Status filter'));
  expect(base.onFilterChange).toHaveBeenCalledWith('status', 'all');
});

test('a search asks the server too, and shows a job outside the loaded list (F01)', async () => {
  // The list loads the newest 500 jobs; an older portal order is found by its
  // order number only on the server.
  jobsApi.list.mockResolvedValue([
    { id: '0999', customer: 'Old Co', customerId: 'OLD', status: 'FINISH', priority: 'Normal', due: '', total: 10, items: [], serialNo: 'WEB-77' },
  ]);
  renderWithQuery(<JobsModule {...base} filters={{ ...EMPTY_JOBS_FILTERS, searchTerm: 'web-77' }} />);
  expect(await screen.findByText('0999')).toBeInTheDocument();
  expect(jobsApi.list).toHaveBeenCalledWith({ search: 'web-77' });
  expect(screen.queryByText('2001')).not.toBeInTheDocument();
});

test('one character typed does not ask the server', async () => {
  renderWithQuery(<JobsModule {...base} filters={{ ...EMPTY_JOBS_FILTERS, searchTerm: '2' }} />);
  expect(screen.getByText('2001')).toBeInTheDocument();
  await new Promise(r => setTimeout(r, 400));
  expect(jobsApi.list).not.toHaveBeenCalled();
});

test('board mode renders kanban columns instead of the grid', () => {
  renderWithQuery(<JobsModule {...base} viewMode="board" />);
  expect(screen.getByText('QUOTE')).toBeInTheDocument();   // column header
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('view toggle fires onViewModeChange', () => {
  renderWithQuery(<JobsModule {...base} />);
  fireEvent.click(screen.getByLabelText('Board view'));
  expect(base.onViewModeChange).toHaveBeenCalledWith('board');
});

test('lockedStatus shows only matching jobs regardless of filters.status', () => {
  renderWithQuery(<JobsModule {...base} lockedStatus="QUOTE" jobs={[
    { id: '3001', customer: 'A', customerId: 'A', status: 'QUOTE', priority: 'Normal', assignedTo: 'Emon', due: '12/06/2026', total: 10, items: [], shipTo: 'SYD' },
    { id: '3002', customer: 'B', customerId: 'B', status: 'PRINT', priority: 'Normal', assignedTo: 'Sam', due: '12/06/2026', total: 20, items: [], shipTo: 'MEL' },
  ]} filters={{ ...EMPTY_JOBS_FILTERS, status: 'PRINT' }} />);
  // status:'PRINT' in filters is overridden by lockedStatus:'QUOTE'
  expect(screen.getByText('3001')).toBeInTheDocument();
  expect(screen.queryByText('3002')).not.toBeInTheDocument();
});

test('lockedStatus hides Status chip, Status column, and Status from the add menu', () => {
  const { unmount } = renderWithQuery(<JobsModule {...base} filters={{ ...EMPTY_JOBS_FILTERS }} />);
  // Baseline (not locked): the Status column header IS present. Addressed as a
  // column header rather than by text — "Status" also appears in the group-by
  // selector, and this assertion is about the column.
  expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
  unmount();

  renderWithQuery(<JobsModule {...base} lockedStatus="QUOTE" filters={{ ...EMPTY_JOBS_FILTERS, status: 'QUOTE' }} />);
  // (a) no removable Status chip
  expect(screen.queryByLabelText('Remove Status filter')).not.toBeInTheDocument();
  // (b) Status column header hidden (redundant when every row is QUOTE)
  expect(screen.queryByText('Status')).not.toBeInTheDocument();
  // (c) opening the add menu offers other fields but not Status
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
  // After menu opens, verify Priority is offered (shows the menu is working)
  const priorityOptions = screen.getAllByText('Priority');
  expect(priorityOptions.length).toBeGreaterThan(1); // column header + menu item
  // Status is not offered in the menu
  const statusOptions = screen.queryAllByText('Status');
  expect(statusOptions.length).toBe(0); // no Status anywhere (column hidden, not in menu)
});

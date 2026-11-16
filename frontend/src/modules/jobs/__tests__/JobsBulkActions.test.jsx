/**
 * Acting on the jobs a person selects in the list, as Jim2's job list does
 * (JIM24): change their status, or move their due date, in one go. The list
 * lost its row selection in the redesign, so neither could be reached.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as api from '../../../api';
import { renderWithQuery } from '../../../test/renderWithQuery';
import JobsModule from '../JobsModule';
import { EMPTY_JOBS_FILTERS } from '../jobsFilters';

const jobs = [
  { id: '1001', customer: 'BHP Group', status: 'ORDER', priority: 'Normal', total: 100, due: '2026-11-10', items: [] },
  { id: '1002', customer: 'Onsite Rental', status: 'ORDER', priority: 'Normal', total: 200, due: '2026-11-12', items: [] },
  { id: '1003', customer: 'Arcare', status: 'PRINT', priority: 'Normal', total: 300, due: '2026-11-14', items: [] },
];

const onJobClick = vi.fn();

const open = () => renderWithQuery(
  <JobsModule
    jobs={jobs}
    filters={EMPTY_JOBS_FILTERS}
    onFilterChange={() => {}}
    onClearFilters={() => {}}
    viewMode="table"
    onViewModeChange={() => {}}
    currentUser={null}
    onJobClick={onJobClick}
  />,
);

const bar = () => screen.queryByRole('region', { name: 'Selected jobs' });

const access = (allowed) => ({ role: 'staff', areas: [], allowed });

beforeEach(() => {
  vi.spyOn(api.users, 'myAccess').mockResolvedValue(access(['POST /purchase-orders/from-jobs']));
  vi.spyOn(api.purchaseOrders, 'fromJobs').mockResolvedValue({
    created: [{ id: 'PO-20261107-1', supplier_name: 'King Gee Workwear', items: [] }],
    skipped: [],
  });
  vi.spyOn(api.jobs, 'list').mockResolvedValue([]);
  vi.spyOn(api.jobs, 'bulkStatus').mockResolvedValue({ moved: 2, failed: [] });
  vi.spyOn(api.jobs, 'bulkDue').mockResolvedValue({ changed: 2, failed: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
  onJobClick.mockClear();
});

test('no bar until a job is selected; ticking a row does not open the job', () => {
  open();
  expect(bar()).toBeNull();
  fireEvent.click(screen.getByLabelText('Select job 1001'));
  expect(within(bar()).getByText('1 selected')).toBeInTheDocument();
  expect(onJobClick).not.toHaveBeenCalled();
});

test('the header box selects every job shown, and clears them again', () => {
  open();
  fireEvent.click(screen.getByLabelText('Select all jobs shown'));
  expect(within(bar()).getByText('3 selected')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Select all jobs shown'));
  expect(bar()).toBeNull();
});

test('the selected jobs move to one status in one request', async () => {
  open();
  fireEvent.click(screen.getByLabelText('Select job 1001'));
  fireEvent.click(screen.getByLabelText('Select job 1002'));
  fireEvent.change(within(bar()).getByLabelText('New status'), { target: { value: 'In Progress' } });
  fireEvent.click(within(bar()).getByRole('button', { name: 'Change status' }));
  await waitFor(() => expect(api.jobs.bulkStatus).toHaveBeenCalledWith(['1001', '1002'], 'In Progress'));
  await waitFor(() => expect(bar()).toBeNull());
});

test('the selected jobs get one new due date', async () => {
  open();
  fireEvent.click(screen.getByLabelText('Select job 1002'));
  fireEvent.click(screen.getByLabelText('Select job 1003'));
  fireEvent.change(within(bar()).getByLabelText('New due date'), { target: { value: '2026-11-20' } });
  fireEvent.click(within(bar()).getByRole('button', { name: 'Move due date' }));
  await waitFor(() => expect(api.jobs.bulkDue).toHaveBeenCalledWith(['1002', '1003'], '2026-11-20'));
});

test('nothing is sent without a status or a date chosen', () => {
  open();
  fireEvent.click(screen.getByLabelText('Select job 1001'));
  expect(within(bar()).getByRole('button', { name: 'Change status' })).toBeDisabled();
  expect(within(bar()).getByRole('button', { name: 'Move due date' })).toBeDisabled();
});

test('jobs the server would not change stay selected, and say why', async () => {
  api.jobs.bulkStatus.mockResolvedValue({ moved: 1, failed: [{ job_id: '1002', reason: 'Credit hold' }] });
  open();
  fireEvent.click(screen.getByLabelText('Select job 1001'));
  fireEvent.click(screen.getByLabelText('Select job 1002'));
  fireEvent.change(within(bar()).getByLabelText('New status'), { target: { value: 'PRINT' } });
  fireEvent.click(within(bar()).getByRole('button', { name: 'Change status' }));
  expect(await within(bar()).findByText(/1002: Credit hold/)).toBeInTheDocument();
  expect(within(bar()).getByText('1 selected')).toBeInTheDocument();
});

describe('raising purchase orders for the selected jobs', () => {
  test('one request for the selection; the POs raised are named', async () => {
    open();
    fireEvent.click(screen.getByLabelText('Select job 1001'));
    fireEvent.click(screen.getByLabelText('Select job 1003'));
    fireEvent.click(await within(bar()).findByRole('button', { name: 'Raise POs' }));
    await waitFor(() => expect(api.purchaseOrders.fromJobs).toHaveBeenCalledWith(['1001', '1003']));
    await waitFor(() => expect(bar()).toBeNull());
  });

  test('a line that could not be bought keeps its job selected, with why', async () => {
    api.purchaseOrders.fromJobs.mockResolvedValue({
      created: [],
      skipped: [{ job_id: '1002', sku: 'ORPHAN', reason: 'ORPHAN has no supplier on its stock record' }],
    });
    open();
    fireEvent.click(screen.getByLabelText('Select job 1002'));
    fireEvent.click(await within(bar()).findByRole('button', { name: 'Raise POs' }));
    expect(await within(bar()).findByText(/1002: ORPHAN has no supplier/)).toBeInTheDocument();
    expect(within(bar()).getByText('1 selected')).toBeInTheDocument();
  });

  test('not offered to a role that may not raise them', async () => {
    api.users.myAccess.mockResolvedValue(access([]));
    open();
    fireEvent.click(screen.getByLabelText('Select job 1001'));
    await waitFor(() => expect(api.users.myAccess).toHaveBeenCalled());
    expect(within(bar()).queryByRole('button', { name: 'Raise POs' })).toBeNull();
  });
});

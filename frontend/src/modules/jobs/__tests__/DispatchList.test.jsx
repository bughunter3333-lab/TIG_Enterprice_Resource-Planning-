/**
 * The despatch list: despatching does not invoice unless asked to, a packed
 * job is on it and a job in production is not, Auto Pick picks the selected
 * jobs in one request, and the paperwork prints across the selection.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { dispatchSessions, jobs } from '../../../api';
import DispatchList from '../DispatchList';

vi.mock('../../../api', () => ({
  dispatchSessions: { list: vi.fn(), get: vi.fn() },
  jobs: { autoPick: vi.fn() },
  documents: { jobsUrl: (type, ids) => `/api/job-documents?type=${type}&job_id=${ids.join('&job_id=')}` },
}));

const JOBS = [{ id: '110002', status: 'FINISH', customer: 'Outback Mining', shipTo: 'StarTrack' }];

beforeEach(() => {
  vi.clearAllMocks();
  dispatchSessions.list.mockResolvedValue([]);
});

const select = () => fireEvent.click(screen.getByLabelText('Select 110002'));
const despatch = () => {
  select();
  fireEvent.click(screen.getByRole('button', { name: /dispatch selected/i }));
};

test('a batch is despatched without invoicing by default', () => {
  const onDispatch = vi.fn();
  renderWithQuery(<DispatchList jobs={JOBS} onDispatch={onDispatch} onClose={() => {}} />);
  despatch();
  expect(onDispatch).toHaveBeenCalledWith([expect.objectContaining({ id: '110002', advanceStatus: false })]);
});

test('a packed job waiting for the carrier is on the list, and can be invoiced as it goes', () => {
  const onDispatch = vi.fn();
  renderWithQuery(<DispatchList jobs={[{ ...JOBS[0], status: 'Desp/Ready' }]} onDispatch={onDispatch} onClose={() => {}} />);
  fireEvent.click(screen.getByLabelText(/advance finish → invoice on dispatch/i));
  despatch();
  expect(onDispatch).toHaveBeenCalledWith([expect.objectContaining({ id: '110002', advanceStatus: true })]);
});

test('a job still in production is not on the despatch list', () => {
  renderWithQuery(<DispatchList jobs={[{ ...JOBS[0], status: 'PRINT' }]} onDispatch={() => {}} onClose={() => {}} />);
  expect(screen.queryByLabelText('Select 110002')).not.toBeInTheDocument();
});

test('invoicing on despatch is chosen by ticking it', () => {
  const onDispatch = vi.fn();
  renderWithQuery(<DispatchList jobs={JOBS} onDispatch={onDispatch} onClose={() => {}} />);
  fireEvent.click(screen.getByLabelText(/advance finish → invoice on dispatch/i));
  despatch();
  expect(onDispatch).toHaveBeenCalledWith([expect.objectContaining({ advanceStatus: true })]);
});

test('Auto Pick picks the selected jobs in one request', async () => {
  jobs.autoPick.mockResolvedValue({ jobs: [{ job_id: '110002', all_picked: true }], failed: [] });
  renderWithQuery(<DispatchList jobs={JOBS} onDispatch={() => {}} onClose={() => {}} />);
  select();
  fireEvent.click(screen.getByRole('button', { name: /auto pick/i }));
  await waitFor(() => expect(jobs.autoPick).toHaveBeenCalledWith(['110002']));
});

test('a recorded batch ends on what the server recorded, not on what was sent', async () => {
  const onClose = vi.fn();
  const onDispatch = vi.fn().mockResolvedValue({
    id: 41,
    created_at: '2026-10-26T04:10:00Z',
    line_count: 1,
    lines: [{ job_id: '110002', customer_name: 'Outback Mining', ship_via: 'StarTrack', ship_ref: 'ST-889', cartons: 3 }],
  });
  renderWithQuery(<DispatchList jobs={JOBS} onDispatch={onDispatch} onClose={onClose} />);
  despatch();
  expect(await screen.findByRole('heading', { name: 'Dispatched' })).toBeInTheDocument();
  expect(screen.getByText('Dispatch #41')).toBeInTheDocument();
  expect(screen.getByText(/1 job · 3 cartons/)).toBeInTheDocument();
  expect(screen.getByText('ST-889')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(onClose).toHaveBeenCalled();
});

test('a refused batch stays on the list with the selection kept', async () => {
  const onDispatch = vi.fn().mockResolvedValue(undefined);
  renderWithQuery(<DispatchList jobs={JOBS} onDispatch={onDispatch} onClose={() => {}} />);
  despatch();
  await waitFor(() => expect(onDispatch).toHaveBeenCalled());
  expect(screen.queryByRole('heading', { name: 'Dispatched' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Select 110002')).toBeChecked();
});

test('delivery notes print across the selection', () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  renderWithQuery(<DispatchList jobs={JOBS} onDispatch={() => {}} onClose={() => {}} />);
  select();
  fireEvent.click(screen.getByRole('button', { name: /delivery notes/i }));
  expect(open).toHaveBeenCalledWith('/api/job-documents?type=delivery-note&job_id=110002', '_blank', 'noopener');
  open.mockRestore();
});

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
  expect(onDispatch).toHaveBeenCalledWith([expect.objectContaining({ id: '110002', advanceStatus: false })], expect.anything());
});

test('a packed job waiting for the carrier is on the list, and can be invoiced as it goes', () => {
  const onDispatch = vi.fn();
  renderWithQuery(<DispatchList jobs={[{ ...JOBS[0], status: 'Desp/Ready' }]} onDispatch={onDispatch} onClose={() => {}} />);
  fireEvent.click(screen.getByLabelText(/advance finish → invoice on dispatch/i));
  despatch();
  expect(onDispatch).toHaveBeenCalledWith([expect.objectContaining({ id: '110002', advanceStatus: true })], expect.anything());
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
  expect(onDispatch).toHaveBeenCalledWith([expect.objectContaining({ advanceStatus: true })], expect.anything());
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

test('the finished batch prints delivery notes and ship labels for the jobs it recorded (F21)', async () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  const onDispatch = vi.fn().mockResolvedValue({
    id: 42, created_at: '2026-10-27T01:00:00Z', line_count: 1,
    lines: [{ job_id: '110002', customer_name: 'Outback Mining', ship_via: 'StarTrack', ship_ref: 'ST-1', cartons: 2 }],
  });
  renderWithQuery(<DispatchList jobs={JOBS} onDispatch={onDispatch} onClose={() => {}} />);
  despatch();
  await screen.findByRole('heading', { name: 'Dispatched' });
  fireEvent.click(screen.getByRole('button', { name: /delivery notes/i }));
  fireEvent.click(screen.getByRole('button', { name: /ship labels/i }));
  expect(open.mock.calls.map((c) => c[0])).toEqual([
    '/api/job-documents?type=delivery-note&job_id=110002',
    '/api/job-documents?type=ship-label&job_id=110002',
  ]);
  open.mockRestore();
});

test("Ship Via starts from the job's carrier, not its ship-to site (F22)", () => {
  const onDispatch = vi.fn();
  renderWithQuery(<DispatchList jobs={[{ ...JOBS[0], shipTo: 'SITE-04', shipVia: 'Toll' }]} onDispatch={onDispatch} onClose={() => {}} />);
  expect(screen.getByLabelText('Ship via for 110002')).toHaveValue('Toll');
  despatch();
  expect(onDispatch).toHaveBeenCalledWith([expect.objectContaining({ shipVia: 'Toll', again: false })], expect.anything());
});

test('a job that has gone already is hidden until asked for, and goes again as a further consignment (F22)', () => {
  const onDispatch = vi.fn();
  const gone = { ...JOBS[0], dispatchedAt: '2026-10-20', connote: 'C1' };
  renderWithQuery(<DispatchList jobs={[gone]} onDispatch={onDispatch} onClose={() => {}} />);
  expect(screen.queryByLabelText('Select 110002')).not.toBeInTheDocument();

  fireEvent.click(screen.getByLabelText(/show despatched/i));
  const row = screen.getByLabelText('Select 110002').closest('tr');
  expect(row).toHaveTextContent(/further consignment/i);
  despatch();
  expect(onDispatch).toHaveBeenCalledWith([expect.objectContaining({ id: '110002', again: true })], expect.anything());
});

describe('the despatch date (B1-07)', () => {
  afterEach(() => vi.useRealTimers());

  test("the batch goes on the browser's today unless dated otherwise", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 8:30 in the morning, local: UTC's day is still yesterday in Sydney.
    vi.setSystemTime(new Date(2026, 10, 2, 8, 30));
    const onDispatch = vi.fn();
    renderWithQuery(<DispatchList jobs={JOBS} onDispatch={onDispatch} onClose={() => {}} />);
    const field = screen.getByLabelText('Despatch date');
    expect(field).toHaveValue('2026-11-02');
    // The range the server takes: 30 days back, 14 ahead.
    expect(field).toHaveAttribute('min', '2026-10-03');
    expect(field).toHaveAttribute('max', '2026-11-16');
    despatch();
    expect(onDispatch).toHaveBeenLastCalledWith(expect.any(Array), { despatchDate: '2026-11-02' });

    // After the carrier's cut-off: the next collection.
    fireEvent.change(field, { target: { value: '2026-11-03' } });
    fireEvent.click(screen.getByRole('button', { name: /dispatch selected/i }));
    expect(onDispatch).toHaveBeenLastCalledWith(expect.any(Array), { despatchDate: '2026-11-03' });
  });

  test('a list left open overnight sends the morning\'s batch on that morning', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 2, 16, 0));
    const onDispatch = vi.fn();
    renderWithQuery(<DispatchList jobs={JOBS} onDispatch={onDispatch} onClose={() => {}} />);
    vi.setSystemTime(new Date(2026, 10, 3, 8, 30));
    despatch();
    expect(onDispatch).toHaveBeenLastCalledWith(expect.any(Array), { despatchDate: '2026-11-03' });
  });
});

test('a recorded batch dated another day says when it goes', async () => {
  const onDispatch = vi.fn().mockResolvedValue({
    id: 43, created_at: '2026-10-27T01:00:00Z', line_count: 1,
    lines: [{ job_id: '110002', customer_name: 'Outback Mining', ship_via: 'StarTrack', ship_ref: 'ST-2', cartons: 1, despatch_date: '2099-01-02' }],
  });
  renderWithQuery(<DispatchList jobs={JOBS} onDispatch={onDispatch} onClose={() => {}} />);
  despatch();
  expect(await screen.findByText(/going 2099-01-02/)).toBeInTheDocument();
});

test('before a despatch the list prints job labels, not delivery notes or ship labels (F21)', () => {
  // Printed before a despatch is recorded, a delivery note or ship label read
  // the job's last despatch: a new job got "Carton 1 of 1" with no connote, a
  // further consignment the previous one's connote and cartons.
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  renderWithQuery(<DispatchList jobs={JOBS} onDispatch={() => {}} onClose={() => {}} />);
  select();
  expect(screen.queryByRole('button', { name: /delivery notes/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /ship labels/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /auto pick/i })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: /job labels/i }));
  expect(open).toHaveBeenCalledWith('/api/job-documents?type=job-label&job_id=110002', '_blank', 'noopener');
  open.mockRestore();
});

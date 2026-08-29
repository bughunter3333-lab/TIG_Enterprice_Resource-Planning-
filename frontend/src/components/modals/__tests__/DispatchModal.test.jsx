/**
 * DispatchModal — the older single-job despatch dialog.
 *
 * Its own file header says it is unreachable: nothing sets `dispatchModal.open`,
 * and despatch really happens through the batch path in
 * src/modules/jobs/DispatchList.jsx. These tests take it at its word and do not
 * try to wire it up — they cover it as what it still is, a component that
 * renders and still calls the single-job `api.jobs.dispatch`.
 *
 * Two behaviours are worth pinning either way. The required fields must block
 * the call, because a despatch with no carrier and no tracking reference is a
 * consignment nobody can trace. And a failed call must leave the dialog open:
 * closing is the only signal the operator gets, so closing on a failure reads
 * as a despatched job that was never despatched.
 *
 * `api` is reached through vi.spyOn on the real module, never a partial object
 * literal — a method the component calls that the mock forgot would otherwise
 * throw mid-render.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import DispatchModal from '../DispatchModal';
import { jobs } from '../../../api';

const job = { id: 4821, status: 'FINISH' };

const modal = (over = {}) => ({
  open: true,
  job,
  shipVia: 'StarTrack',
  shipRef: 'ST-88421',
  cartons: 3,
  notes: 'Rear dock before 3pm',
  advanceStatus: true,
  loading: false,
  error: '',
  ...over,
});

const setup = (over = {}) => {
  const props = {
    dispatchModal: modal(over),
    onJobUpdated: vi.fn(),
    setDispatchModal: vi.fn(),
  };
  return { ...props, ...renderWithQuery(<DispatchModal {...props} />) };
};

// The handlers pass updaters to the setter. Applying the last one to a sentinel
// is the only honest way to read it: the updater closes over the live DOM node,
// which React has already reset to its prop value by the time a test runs it.
const applyLast = (setter, seed) => setter.mock.calls.at(-1)[0](seed);

let dispatch;
beforeEach(() => {
  dispatch = vi.spyOn(jobs, 'dispatch').mockResolvedValue({ id: 4821, status: 'INVOICE' });
});
afterEach(() => vi.restoreAllMocks());

test('renders nothing while closed', () => {
  const { container } = setup({ open: false });
  expect(container).toBeEmptyDOMElement();
});

test('names the job it is about to despatch', () => {
  setup();
  expect(screen.getByRole('heading', { name: /Dispatch Job #4821/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirm Dispatch' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
});

test('shows the consignment it was handed', () => {
  setup();
  // The <label>s in this modal carry no htmlFor, so the text fields are only
  // reachable by placeholder. The checkbox below wraps its input, so that one
  // does resolve by label.
  expect(screen.getByPlaceholderText('e.g. StarTrack, Australia Post')).toHaveValue('StarTrack');
  expect(screen.getByPlaceholderText('Tracking number')).toHaveValue('ST-88421');
  expect(screen.getByPlaceholderText('Optional notes')).toHaveValue('Rear dock before 3pm');
  // input[type=number] holds a number, not the string '3'.
  expect(screen.getByRole('spinbutton')).toHaveValue(3);
});

test('offers the status advance only from FINISH', () => {
  setup();
  expect(screen.getByLabelText('Advance status to INVOICE after dispatch')).toBeChecked();
});

test('hides the status advance when the job is not at FINISH', () => {
  setup({ job: { id: 4821, status: 'INVOICE' } });
  expect(
    screen.queryByLabelText('Advance status to INVOICE after dispatch')
  ).not.toBeInTheDocument();
});

test('renders the error it was given', () => {
  setup({ error: 'Job 4821 is locked.' });
  expect(screen.getByText('Job 4821 is locked.')).toBeInTheDocument();
});

test('says it is working while a despatch is in flight', () => {
  setup({ loading: true });
  expect(screen.getByRole('button', { name: 'Dispatching...' })).toBeDisabled();
});

test('a missing ship reference blocks the despatch', () => {
  const { setDispatchModal } = setup({ shipRef: '' });

  fireEvent.click(screen.getByRole('button', { name: 'Confirm Dispatch' }));

  // The whole point: an untraceable consignment must not reach the API.
  expect(dispatch).not.toHaveBeenCalled();
  const result = applyLast(setDispatchModal, { open: true, job, loading: false });
  expect(result.error).toBe('Ship Via and Reference are required.');
  expect(result.open).toBe(true);
});

test('a missing carrier blocks the despatch', () => {
  const { setDispatchModal } = setup({ shipVia: '' });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Dispatch' }));
  expect(dispatch).not.toHaveBeenCalled();
  expect(applyLast(setDispatchModal, { open: true }).error).toBe(
    'Ship Via and Reference are required.'
  );
});

test('a confirmed despatch sends the whole consignment, refreshes jobs and closes', async () => {
  const props = {
    dispatchModal: modal(),
    onJobUpdated: vi.fn(),
    setDispatchModal: vi.fn(),
  };
  const { client } = renderWithQuery(<DispatchModal {...props} />);
  const invalidate = vi.spyOn(client, 'invalidateQueries');

  fireEvent.click(screen.getByRole('button', { name: 'Confirm Dispatch' }));

  await waitFor(() =>
    expect(dispatch).toHaveBeenCalledWith(4821, {
      shipVia: 'StarTrack',
      shipRef: 'ST-88421',
      cartons: 3,
      notes: 'Rear dock before 3pm',
      advanceStatus: true,
    })
  );
  // A despatched job still reading as FINISH in the list is the bug this guards.
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['jobs'] }));
  await waitFor(() =>
    expect(props.onJobUpdated).toHaveBeenCalledWith({ id: 4821, status: 'INVOICE' })
  );
  const result = applyLast(props.setDispatchModal, { open: true, job, shipVia: 'StarTrack' });
  expect(result.open).toBe(false);
  expect(result.shipVia).toBe('StarTrack');
});

test('a despatch that fails stays open and keeps the consignment on screen', async () => {
  dispatch.mockRejectedValue(new Error('Carrier rejected the consignment'));
  const { setDispatchModal, onJobUpdated } = setup();

  fireEvent.click(screen.getByRole('button', { name: 'Confirm Dispatch' }));

  await waitFor(() => expect(setDispatchModal.mock.calls.length).toBe(2));
  const result = applyLast(setDispatchModal, {
    open: true,
    job,
    shipVia: 'StarTrack',
    shipRef: 'ST-88421',
  });
  expect(result.error).toBe('Carrier rejected the consignment');
  expect(result.loading).toBe(false);
  // Closing here would read as a job that went out the door.
  expect(result.open).toBe(true);
  expect(result.shipRef).toBe('ST-88421');
  expect(onJobUpdated).not.toHaveBeenCalled();
});

test('editing the carrier keeps the rest of the consignment', () => {
  const { setDispatchModal } = setup();

  fireEvent.change(screen.getByPlaceholderText('e.g. StarTrack, Australia Post'), {
    target: { value: 'Australia Post' },
  });

  // Asserting the spread, not the new value: the updater holds a live DOM node.
  // Drop the spread and changing the carrier blanks the tracking number.
  const result = applyLast(setDispatchModal, {
    ...modal(),
    shipRef: 'KEEP-ME',
    notes: 'SENTINEL',
  });
  expect(result.shipRef).toBe('KEEP-ME');
  expect(result.notes).toBe('SENTINEL');
  expect(result.cartons).toBe(3);
});

test('cancel closes without despatching anything', () => {
  const { setDispatchModal } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(dispatch).not.toHaveBeenCalled();
  const result = applyLast(setDispatchModal, { open: true, job, notes: 'SENTINEL' });
  expect(result.open).toBe(false);
  expect(result.notes).toBe('SENTINEL');
});

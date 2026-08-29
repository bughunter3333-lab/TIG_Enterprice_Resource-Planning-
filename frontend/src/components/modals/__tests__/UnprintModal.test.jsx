/**
 * UnprintModal — pulls an invoiced job back to FINISH so it can be re-issued.
 *
 * This is a status reversal on a job that has already been invoiced, so the
 * dialog's job is to say exactly which way it is about to move the job before
 * anyone confirms: from the status it is on now, back to FINISH. A dialog that
 * says only "unprint" gives an operator nothing to check against.
 *
 * The other thing worth pinning is the failure path. `confirm` closes the modal
 * on success and only on success — if a rejected unprint also closed, the
 * operator would see the same outcome for "reverted" and "refused by the
 * server", and would go looking for an invoice that is still locked.
 *
 * `api` is reached through vi.spyOn on the real module, never a partial object
 * literal.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import UnprintModal from '../UnprintModal';
import { jobs } from '../../../api';

const job = { id: 7712, status: 'INVOICE' };

const modal = (over = {}) => ({
  open: true,
  job,
  loading: false,
  error: '',
  ...over,
});

const setup = (over = {}) => {
  const props = {
    unprintModal: modal(over),
    onJobUpdated: vi.fn(),
    setUnprintModal: vi.fn(),
  };
  return { ...props, ...renderWithQuery(<UnprintModal {...props} />) };
};

// The setter takes updaters, so what is readable is the function, not a value.
// Apply it to a sentinel: the closure holds the live DOM node, and React has
// already reset any controlled input by the time a test invokes it.
const applyLast = (setter, seed) => setter.mock.calls.at(-1)[0](seed);

let unprint;
beforeEach(() => {
  unprint = vi.spyOn(jobs, 'unprint').mockResolvedValue({ id: 7712, status: 'FINISH' });
});
afterEach(() => vi.restoreAllMocks());

test('renders nothing while closed', () => {
  const { container } = setup({ open: false });
  expect(container).toBeEmptyDOMElement();
});

test('names the job it is about to revert', () => {
  setup();
  expect(screen.getByRole('heading', { name: /Unprint Job #7712/ })).toBeInTheDocument();
});

test('states both ends of the reversal', () => {
  setup();
  // The two statuses sit in their own spans inside one sentence. Both have to
  // be on screen: "revert this job" with no from/to is not a confirmable action.
  expect(screen.getByText('INVOICE')).toBeInTheDocument();
  expect(screen.getByText('FINISH')).toBeInTheDocument();
  expect(
    screen.getByText(/An internal comment will be added recording this action/)
  ).toBeInTheDocument();
});

test('reads the status off the job it was given, not a hardcoded one', () => {
  setup({ job: { id: 7712, status: 'PAID' } });
  expect(screen.getByText('PAID')).toBeInTheDocument();
  expect(screen.queryByText('INVOICE')).not.toBeInTheDocument();
});

test('renders the error it was given', () => {
  setup({ error: 'Job 7712 is locked and cannot be unprinted.' });
  expect(
    screen.getByText('Job 7712 is locked and cannot be unprinted.')
  ).toBeInTheDocument();
});

test('says it is working while the revert is in flight', () => {
  setup({ loading: true });
  expect(screen.getByRole('button', { name: 'Reverting...' })).toBeDisabled();
});

test('confirming reverts the job, refreshes jobs and closes', async () => {
  const props = {
    unprintModal: modal(),
    onJobUpdated: vi.fn(),
    setUnprintModal: vi.fn(),
  };
  const { client } = renderWithQuery(<UnprintModal {...props} />);
  const invalidate = vi.spyOn(client, 'invalidateQueries');

  fireEvent.click(screen.getByRole('button', { name: 'Confirm Unprint' }));

  await waitFor(() => expect(unprint).toHaveBeenCalledWith(7712));
  // Without this the jobs list keeps showing the pre-unprint status.
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['jobs'] }));
  // updatePinnedJob is passed in as onJobUpdated; it has to receive the server's
  // row, since that is what refreshes both the active job and the pinned strip.
  await waitFor(() =>
    expect(props.onJobUpdated).toHaveBeenCalledWith({ id: 7712, status: 'FINISH' })
  );
  const result = applyLast(props.setUnprintModal, { open: true, job, error: '' });
  expect(result.open).toBe(false);
  expect(result.job).toBe(job);
});

test('a refused unprint stays open and reports why', async () => {
  unprint.mockRejectedValue(new Error('Job is locked'));
  const { setUnprintModal, onJobUpdated } = setup();

  fireEvent.click(screen.getByRole('button', { name: 'Confirm Unprint' }));

  // Two calls: loading on, then the failure. Closing would be a third.
  await waitFor(() => expect(setUnprintModal.mock.calls.length).toBe(2));
  const result = applyLast(setUnprintModal, { open: true, job, loading: true });
  expect(result.error).toBe('Job is locked');
  expect(result.loading).toBe(false);
  // "Closed" must not be able to mean "refused".
  expect(result.open).toBe(true);
  expect(onJobUpdated).not.toHaveBeenCalled();
});

test('confirming clears any previous error before it starts', () => {
  const { setUnprintModal } = setup({ error: 'Job is locked' });

  fireEvent.click(screen.getByRole('button', { name: 'Confirm Unprint' }));

  const first = setUnprintModal.mock.calls[0][0]({ open: true, job, error: 'Job is locked' });
  expect(first.loading).toBe(true);
  expect(first.error).toBe('');
  expect(first.job).toBe(job);
});

test('cancel closes without touching the job', () => {
  const { setUnprintModal, onJobUpdated } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(unprint).not.toHaveBeenCalled();
  expect(onJobUpdated).not.toHaveBeenCalled();
  const result = applyLast(setUnprintModal, { open: true, job, error: 'SENTINEL' });
  expect(result.open).toBe(false);
  expect(result.error).toBe('SENTINEL');
});

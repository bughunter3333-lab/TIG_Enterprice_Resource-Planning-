/**
 * The production board (docs/superpowers/specs/2026-11-07-production-board.md):
 * who has which work by lane; tap a card to hand it on, at a tablet.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as api from '../../../api';
import { renderWithQuery } from '../../../test/renderWithQuery';
import ProductionModule from '../ProductionModule';

const board = {
  lanes: [
    { key: 'picking', label: 'Picking' },
    { key: 'embroidery', label: 'Embroidery' },
    { key: 'print', label: 'Print' },
    { key: 'decorator:STITCH', label: 'Stitchworks Embroidery' },
    { key: 'packing', label: 'Packing' },
  ],
  cards: [
    {
      job_id: '1218774', lane: 'embroidery', customer_name: 'Ricoh Australia', cust_ref: 'PO 55',
      due: '18/11/2026', priority: 'Urgent', order_category: 'Normal', status: 'Picked',
      holder: 'Lina', since: '2026-11-07T09:42:00Z',
      lines: [{ item_id: 11, line: 1, stock_code: 'POLO-NAV', qty: 4, decoration: ['EMB.RIC'], holder: 'Lina', since: null }],
    },
    {
      job_id: '1218800', lane: 'picking', customer_name: 'Arcare', cust_ref: null,
      due: '20/11/2026', priority: 'Normal', order_category: 'Branch', status: 'ORDER',
      holder: null, since: null,
      lines: [{ item_id: 21, line: 2, stock_code: 'CAP-BLK', qty: 6, decoration: [], holder: null, since: null }],
    },
  ],
  holders: ['Lina', 'Sam'],
};

const access = (allowed) => ({ role: 'staff', areas: [], allowed });
const onOpenJob = vi.fn();
const lane = (name) => screen.findByRole('region', { name: new RegExp(`^${name}, `) });

beforeEach(() => {
  vi.spyOn(api.production, 'board').mockResolvedValue(board);
  vi.spyOn(api.production, 'handOff').mockResolvedValue({ comment: 'Line 2 given to Sam for Embroidery' });
  vi.spyOn(api.users, 'myAccess').mockResolvedValue(access(['GET /production-board', 'POST /production-board/hand-off']));
  onOpenJob.mockReset();
});

afterEach(() => vi.restoreAllMocks());

test('every lane is drawn in floor order, each card in its lane', async () => {
  renderWithQuery(<ProductionModule onOpenJob={onOpenJob} />);
  const regions = await screen.findAllByRole('region');
  expect(regions.map((r) => r.getAttribute('aria-label'))).toEqual([
    'Picking, 1 job', 'Embroidery, 1 job', 'Print, 0 jobs', 'Stitchworks Embroidery, 0 jobs', 'Packing, 0 jobs',
  ]);
  const emb = await lane('Embroidery');
  expect(within(emb).getByText('1218774')).toBeInTheDocument();
  expect(within(emb).getByText('Urgent')).toBeInTheDocument();
  expect(within(emb).getByText('L1 · POLO-NAV · 4 · EMB.RIC')).toBeInTheDocument();
  expect(within(emb).getByText('Lina')).toBeInTheDocument();
  expect(within(await lane('Picking')).getByText('1218800')).toBeInTheDocument();
});

test('tap a card, choose a lane and a person, hand it off', async () => {
  renderWithQuery(<ProductionModule onOpenJob={onOpenJob} />);
  fireEvent.click(within(await lane('Picking')).getByRole('button', { name: /Job 1218800/ }));
  const sheet = await screen.findByRole('dialog');
  fireEvent.click(within(sheet).getByRole('radio', { name: /^Embroidery/ }));
  fireEvent.change(within(sheet).getByLabelText('To a person (optional)'), { target: { value: ' Sam ' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Hand off' }));
  await waitFor(() => expect(api.production.handOff).toHaveBeenCalledWith({
    jobId: '1218800', fromLane: 'picking', toLane: 'embroidery', holder: 'Sam',
  }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('nothing to hand off until the lane or the person changes', async () => {
  renderWithQuery(<ProductionModule onOpenJob={onOpenJob} />);
  fireEvent.click(within(await lane('Embroidery')).getByRole('button', { name: /Job 1218774/ }));
  const sheet = await screen.findByRole('dialog');
  expect(within(sheet).getByRole('button', { name: 'Hand off' })).toBeDisabled();
  fireEvent.change(within(sheet).getByLabelText('To a person (optional)'), { target: { value: 'Sam' } });
  expect(within(sheet).getByRole('button', { name: 'Hand off' })).toBeEnabled();
});

test('the sheet opens the job', async () => {
  renderWithQuery(<ProductionModule onOpenJob={onOpenJob} />);
  fireEvent.click(within(await lane('Embroidery')).getByRole('button', { name: /Job 1218774/ }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Open job' }));
  expect(onOpenJob).toHaveBeenCalledWith('1218774');
});

test('a role that may not hand off reads the board only', async () => {
  api.users.myAccess.mockResolvedValue(access(['GET /production-board']));
  renderWithQuery(<ProductionModule onOpenJob={onOpenJob} />);
  await screen.findByText(/view only/);
  fireEvent.click(within(await lane('Embroidery')).getByRole('button', { name: /Job 1218774/ }));
  const sheet = await screen.findByRole('dialog');
  expect(within(sheet).queryByRole('button', { name: 'Hand off' })).not.toBeInTheDocument();
  expect(within(sheet).queryByRole('radio')).not.toBeInTheDocument();
});

test('a card dragged to another lane goes to that lane alone', async () => {
  renderWithQuery(<ProductionModule onOpenJob={onOpenJob} />);
  await screen.findByText(/drag it to a lane/); // the hand-off is offered
  const store = {};
  const dataTransfer = { setData: (k, v) => { store[k] = v; }, getData: (k) => store[k] };
  fireEvent.dragStart(within(await lane('Picking')).getByRole('button', { name: /Job 1218800/ }), { dataTransfer });
  fireEvent.drop(await lane('Packing'), { dataTransfer });
  await waitFor(() => expect(api.production.handOff).toHaveBeenCalledWith({
    jobId: '1218800', fromLane: 'picking', toLane: 'packing', holder: '',
  }));
});

test('a board that did not load says so and can be tried again', async () => {
  api.production.board.mockRejectedValue(new Error('Request failed: 500'));
  renderWithQuery(<ProductionModule onOpenJob={onOpenJob} />, { allowQueryErrors: true });
  expect(await screen.findByRole('alert')).toHaveTextContent('Request failed: 500');
});

test('a card moved on another tablet closes the sheet, so its old lane is never sent again', async () => {
  const moved = Object.assign(new Error('Job 1218800 has no work at picking now'), { status: 409 });
  api.production.handOff.mockRejectedValue(moved);
  renderWithQuery(<ProductionModule onOpenJob={onOpenJob} />);
  fireEvent.click(within(await lane('Picking')).getByRole('button', { name: /Job 1218800/ }));
  const sheet = await screen.findByRole('dialog');
  fireEvent.click(within(sheet).getByRole('radio', { name: /^Packing/ }));
  fireEvent.click(within(sheet).getByRole('button', { name: 'Hand off' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('a refresh that fails keeps the last good board on screen', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    renderWithQuery(<ProductionModule onOpenJob={onOpenJob} />, { allowQueryErrors: true });
    await lane('Embroidery');
    api.production.board.mockRejectedValue(new Error('offline'));
    await vi.advanceTimersByTimeAsync(31_000); // the 30-second refresh
    expect(await screen.findByText(/Could not refresh/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Job 1218774/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test('the lanes are one radio group, moved through with the arrow keys', async () => {
  renderWithQuery(<ProductionModule onOpenJob={onOpenJob} />);
  fireEvent.click(within(await lane('Picking')).getByRole('button', { name: /Job 1218800/ }));
  const sheet = await screen.findByRole('dialog');
  const picking = within(sheet).getByRole('radio', { name: /^Picking/ });
  await waitFor(() => expect(picking).toHaveFocus());
  fireEvent.keyDown(picking, { key: 'ArrowRight' });
  const emb = within(sheet).getByRole('radio', { name: /^Embroidery/ });
  expect(emb).toHaveAttribute('aria-checked', 'true');
  expect(emb).toHaveFocus();
  expect(picking).toHaveAttribute('tabindex', '-1');
});

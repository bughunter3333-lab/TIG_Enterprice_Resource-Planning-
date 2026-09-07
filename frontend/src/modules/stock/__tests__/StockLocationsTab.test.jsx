/**
 * The Locations grid, which is where a bin actually gets typed.
 *
 * Three things here are easy to get wrong and expensive when they are.
 *
 * Every branch is a row whether or not a record exists, so "no bin here" stops
 * looking like "no branch here" — but that means an untouched grid holds a
 * draft for every branch, and saving it naively would POST an empty record for
 * each one. Only rows whose values actually moved may be sent.
 *
 * A row that already exists must PATCH and a row that does not must POST;
 * getting that backwards is a 409 on every second save.
 *
 * And editing is a supervisory act — staff read this screen, admin and manager
 * change it.
 */
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import StockLocationsTab from '../tabs/StockLocationsTab';
import { stock } from '../../../api';
import { BRANCHES } from '../../../branches';

vi.mock('../../../api', () => ({
  stock: {
    locations: vi.fn(),
    locationSummary: vi.fn(),
    addLocation: vi.fn(),
    updateLocation: vi.fn(),
    history: vi.fn(),
  },
}));

const HQ = {
  id: 1, branch: 'HQ', zone: 'C', qty_on_hand: 40, committed_qty: 0,
  available_qty: 40, backorder_qty: 0, on_po_qty: 0,
  primary_bin_1: 'B.3.H.1', max_qty_bin_1: 60, primary_bin_2: null, max_qty_bin_2: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  stock.locations.mockResolvedValue([HQ]);
  stock.locationSummary.mockResolvedValue({ total_on_hand: 40, located: 40, unlocated: 0, in_sync: true });
  stock.addLocation.mockResolvedValue({ id: 2 });
  stock.updateLocation.mockResolvedValue({ ...HQ });
  stock.history.mockResolvedValue([]);
});

const show = (role = 'admin') =>
  renderWithQuery(<StockLocationsTab sku="MR.PS60.NAV" currentUser={{ role }} />);

const startEditing = async () => {
  show('admin');
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
};

test('every branch is a row, not only the ones that already have a record', async () => {
  show();
  // Branch names come from the static list, so they render before the fetch
  // resolves — waiting on the bin is what actually waits for the data.
  expect(await screen.findByText('B.3.H.1')).toBeInTheDocument();
  // HQ has a record; the last branch in the vocabulary does not. Both show.
  expect(screen.getByText('HQ')).toBeInTheDocument();
  expect(screen.getByText(BRANCHES.at(-1))).toBeInTheDocument();
});

test('a branch holding stock under a name not in the list still appears', async () => {
  stock.locations.mockResolvedValue([HQ, { ...HQ, id: 9, branch: 'MELB', primary_bin_1: 'C.1.A.1' }]);
  show();
  // Otherwise that stock is invisible rather than merely misfiled.
  expect(await screen.findByText('MELB')).toBeInTheDocument();
});

describe('who may edit', () => {
  test('staff get no Edit button and are told why', async () => {
    show('staff');
    expect(await screen.findByText(/needs the admin or manager role/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  test('a manager gets one', async () => {
    show('manager');
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});

test('editing an existing branch PATCHes it', async () => {
  await startEditing();

  fireEvent.change(screen.getByDisplayValue('B.3.H.1'), { target: { value: 'B.10.A.2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(stock.updateLocation).toHaveBeenCalled());
  const [sku, branch, payload] = stock.updateLocation.mock.calls[0];
  expect([sku, branch]).toEqual(['MR.PS60.NAV', 'HQ']);
  expect(payload.primary_bin_1).toBe('B.10.A.2');
  expect(stock.addLocation).not.toHaveBeenCalled();
});

test('filling in a branch that had no record POSTs it', async () => {
  await startEditing();

  // Row order follows BRANCHES, so index 1 is the second branch — named from
  // the vocabulary rather than hardcoded, which would tie this test to it.
  fireEvent.change(screen.getAllByPlaceholderText('B.3.H.1')[1], { target: { value: 'C.2.B.4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(stock.addLocation).toHaveBeenCalled());
  const [, payload] = stock.addLocation.mock.calls[0];
  expect(payload.branch).toBe(BRANCHES[1]);
  expect(payload.primary_bin_1).toBe('C.2.B.4');
  expect(stock.updateLocation).not.toHaveBeenCalled();
});

test('branches nobody touched are not written at all', async () => {
  await startEditing();

  fireEvent.change(screen.getAllByPlaceholderText('B.3.H.1')[1], { target: { value: 'C.2.B.4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(stock.addLocation).toHaveBeenCalledTimes(1));
  // Every other branch has an empty draft; none of them is a record.
  expect(stock.updateLocation).not.toHaveBeenCalled();
});

test('clearing a bin sends null rather than dropping the field', async () => {
  await startEditing();

  fireEvent.change(screen.getByDisplayValue('B.3.H.1'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(stock.updateLocation).toHaveBeenCalled());
  expect(stock.updateLocation.mock.calls[0][2].primary_bin_1).toBeNull();
});

test('saving nothing closes the editor without a request', async () => {
  await startEditing();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument());
  expect(stock.addLocation).not.toHaveBeenCalled();
  expect(stock.updateLocation).not.toHaveBeenCalled();
});

test('the history panel reads the trail on demand', async () => {
  stock.history.mockResolvedValue([{
    id: 5, branch: 'HQ', action: 'updated', field: 'primary_bin_1',
    old_value: 'B.3.H.1', new_value: 'B.10.A.2',
    changed_by: 'Emon117', changed_at: '2026-09-06T02:00:00+00:00',
  }]);
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'History' }));

  const entry = await screen.findByText('Emon117');
  expect(stock.history).toHaveBeenCalledWith('MR.PS60.NAV');
  const row = entry.closest('div');
  expect(within(row).getByText('B.3.H.1')).toBeInTheDocument();
  expect(within(row).getByText('B.10.A.2')).toBeInTheDocument();
});

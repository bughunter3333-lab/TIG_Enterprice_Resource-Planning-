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
import { act, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import StockLocationsTab from '../tabs/StockLocationsTab';
import { adminSettings, stock } from '../../../api';
import { BRANCHES } from '../../../branches';

vi.mock('../../../api', () => ({
  adminSettings: { get: vi.fn() },
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
  // No layout saved for any branch: each has the default racking.
  adminSettings.get.mockImplementation((key) => Promise.resolve({ key, value: null }));
});

const show = (role = 'admin') =>
  renderWithQuery(<StockLocationsTab sku="MR.PS60.NAV" currentUser={{ role }} />);

const startEditing = async () => {
  show('admin');
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  // Editing asks for every branch's racking, which is what a bin field goes
  // by. Wait for it, as a person's first keystroke always does.
  await waitFor(() => expect(adminSettings.get.mock.calls.length).toBeGreaterThanOrEqual(BRANCHES.length));
  await act(async () => {});
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

describe('a bin has to be a real box in the racking of its branch', () => {
  const bin1 = (branch) => screen.getByLabelText(`${branch} primary bin 1`);
  const save = () => screen.getByRole('button', { name: 'Save' });
  const problems = () => screen.getByRole('alert', { name: 'What has to be fixed before saving' });

  test('text that is not a code cannot be saved, and the grid says exactly what is wrong', async () => {
    await startEditing();
    fireEvent.change(bin1('3PLP'), { target: { value: 'dasdas' } });
    expect(save()).toBeDisabled();
    expect(problems()).toHaveTextContent('3PLP · Primary bin 1 “dasdas” is not an aisle.bay.level.box code, like B.3.H.1.');
    expect(bin1('3PLP')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(save());
    expect(stock.addLocation).not.toHaveBeenCalled();
  });

  test('a code for a box the racking has not got names the part that is wrong', async () => {
    await startEditing();
    fireEvent.change(bin1('3PLP'), { target: { value: 'B.44.A.1' } });
    // Not a location the system knows, so it is not put into capitals.
    await waitFor(() => expect(problems()).toHaveTextContent('3PLP · Primary bin 1 “b.44.a.1” is not in this racking: there is no bay 44 (bays 1 to 10).'));
    expect(save()).toBeDisabled();
  });

  test('putting it right lets the save through', async () => {
    await startEditing();
    fireEvent.change(bin1('3PLP'), { target: { value: 'dasdas' } });
    fireEvent.change(bin1('3PLP'), { target: { value: 'C.2.B.4' } });
    await waitFor(() => expect(save()).toBeEnabled());
    expect(screen.queryByRole('alert', { name: 'What has to be fixed before saving' })).not.toBeInTheDocument();
    fireEvent.click(save());
    await waitFor(() => expect(stock.addLocation).toHaveBeenCalled());
    expect(stock.addLocation.mock.calls[0][1]).toMatchObject({ branch: '3PLP', primary_bin_1: 'C.2.B.4' });
  });

  test('each branch is judged against its own racking', async () => {
    const small = { version: 1, aisles: ['A'], baysPerAisle: 2, beams: [2], excessShelf: false, positions: 3, oddSide: 'right' };
    adminSettings.get.mockImplementation((key) => Promise.resolve({ key, value: key === 'warehouse_layout:MELB' ? JSON.stringify(small) : null }));
    await startEditing();
    fireEvent.change(bin1('MELB'), { target: { value: 'B.3.H.1' } });
    await waitFor(() => expect(problems()).toHaveTextContent('MELB · Primary bin 1 “b.3.h.1” is not in this racking: there is no aisle B (aisles A).'));
    expect(adminSettings.get).toHaveBeenCalledWith('warehouse_layout:MELB');
    // The same code is a real box at HQ, where it already is.
    expect(bin1('HQ')).not.toHaveAttribute('aria-invalid');
  });

  test('one mistake holds the whole save back, so nothing is half saved', async () => {
    await startEditing();
    fireEvent.change(bin1('HQ'), { target: { value: 'B.10.A.2' } });
    fireEvent.change(bin1('3PLP'), { target: { value: 'dasdas' } });
    expect(save()).toBeDisabled();
    fireEvent.click(save());
    expect(stock.updateLocation).not.toHaveBeenCalled();
  });

  test('one box cannot be both bins of a position', async () => {
    await startEditing();
    fireEvent.change(screen.getByLabelText('HQ primary bin 2'), { target: { value: 'b.03.h.01' } });
    await waitFor(() => expect(problems()).toHaveTextContent('HQ · Primary bin 2 is the same box as primary bin 1.'));
    expect(save()).toBeDisabled();
  });

  test('a capacity has to be a whole number a bin could hold', async () => {
    await startEditing();
    fireEvent.change(screen.getByLabelText('HQ max qty 1'), { target: { value: '-5' } });
    expect(problems()).toHaveTextContent('HQ · Max qty 1 must be a whole number from 0 to 100,000, or empty.');
    expect(save()).toBeDisabled();
  });
});

describe('a bin on file from before bins were checked', () => {
  const OLD = { ...HQ, id: 2, branch: '3PLP', zone: null, primary_bin_1: 'dasdas', max_qty_bin_1: null, qty_on_hand: 0, available_qty: 0 };
  beforeEach(() => stock.locations.mockResolvedValue([HQ, OLD]));

  test('is pointed out, with what to do about it', async () => {
    show('admin');
    expect(await screen.findByText(/One bin on file is not a box in the racking: 3PLP dasdas\. Edit to re-slot or clear\./)).toBeInTheDocument();
    expect(screen.getByText('dasdas')).toHaveAttribute('title', '“dasdas” is not an aisle.bay.level.box code, like B.3.H.1');
  });

  test('staff are told it is there, not to edit it', async () => {
    show('staff');
    const note = await screen.findByText(/One bin on file is not a box in the racking: 3PLP dasdas\./);
    expect(note).not.toHaveTextContent('Edit to');
  });

  test('does not stop the rest of its row being saved while it is left as it is', async () => {
    await startEditing();
    await screen.findByDisplayValue('dasdas');
    fireEvent.change(screen.getByLabelText('3PLP zone'), { target: { value: 'Dock' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(stock.updateLocation).toHaveBeenCalled());
    expect(stock.updateLocation.mock.calls[0]).toEqual(['MR.PS60.NAV', '3PLP', expect.objectContaining({ zone: 'Dock', primary_bin_1: 'dasdas' })]);
  });

  test('cannot be changed to something else that is not a box, but can be re-slotted or cleared', async () => {
    await startEditing();
    const field = await screen.findByDisplayValue('dasdas');
    fireEvent.change(field, { target: { value: 'dasdasd' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(field, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.change(field, { target: { value: 'A.1.D.4' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  });
});

describe('typing a location', () => {
  const bin1 = (branch) => screen.getByLabelText(`${branch} primary bin 1`);
  const type = (field, value, more = {}) => fireEvent.change(field, { target: { value, ...more } });
  const offered = () => within(screen.getByRole('listbox', { name: 'Locations this could be' })).getAllByRole('option').map((o) => o.textContent);

  test('a letter that starts a real location goes into capitals and offers the first box it leads to', async () => {
    await startEditing();
    type(bin1('3PLP'), 'b');
    expect(bin1('3PLP')).toHaveValue('B');
    expect(offered()).toEqual(['B.1.A.1']);
    expect(bin1('3PLP')).toHaveAttribute('aria-expanded', 'true');
  });

  test('each further part offers the ways it can go on: bays, then levels, then boxes', async () => {
    await startEditing();
    type(bin1('3PLP'), 'b.');
    expect(offered()).toHaveLength(10);
    expect(offered().slice(0, 3)).toEqual(['B.1.A.1', 'B.2.A.1', 'B.3.A.1']);
    type(bin1('3PLP'), 'b.2.');
    expect(bin1('3PLP')).toHaveValue('B.2.');
    expect(offered()[0]).toBe('B.2.A.1');
    expect(offered()).toHaveLength(12);
    type(bin1('3PLP'), 'b.2.c.');
    expect(offered()).toEqual(['B.2.C.1', 'B.2.C.2', 'B.2.C.3', 'B.2.C.4', 'B.2.C.5', 'B.2.C.6']);
  });

  test('Enter takes the one that is lit, the arrows move through them, and it is what is saved', async () => {
    await startEditing();
    type(bin1('3PLP'), 'b.2.');
    fireEvent.keyDown(bin1('3PLP'), { key: 'ArrowDown' });
    fireEvent.keyDown(bin1('3PLP'), { key: 'ArrowDown' });
    fireEvent.keyDown(bin1('3PLP'), { key: 'ArrowUp' });
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('B.2.B.1');
    fireEvent.keyDown(bin1('3PLP'), { key: 'Enter' });
    expect(bin1('3PLP')).toHaveValue('B.2.B.1');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(stock.addLocation).toHaveBeenCalled());
    expect(stock.addLocation.mock.calls[0][1]).toMatchObject({ branch: '3PLP', primary_bin_1: 'B.2.B.1' });
  });

  test('one can be taken with the mouse, and the keyboard stays in the field', async () => {
    await startEditing();
    bin1('3PLP').focus();
    type(bin1('3PLP'), 'e.10.');
    const press = fireEvent.mouseDown(screen.getByRole('option', { name: 'E.10.C.1' }));
    expect(press).toBe(false); // the press is kept from taking focus out of the field
    expect(bin1('3PLP')).toHaveValue('E.10.C.1');
    expect(bin1('3PLP')).toHaveFocus();
  });

  test('a whole code that is real is in capitals and has nothing more to offer', async () => {
    await startEditing();
    type(bin1('3PLP'), 'c.2.b.4');
    expect(bin1('3PLP')).toHaveValue('C.2.B.4');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(bin1('3PLP')).toHaveAttribute('aria-expanded', 'false');
  });

  test('text that leads to no location stays in small letters, offers nothing, and cannot be saved', async () => {
    await startEditing();
    type(bin1('3PLP'), 'B.2.C.4');
    type(bin1('3PLP'), 'B.2.C.4x');
    expect(bin1('3PLP')).toHaveValue('b.2.c.4x');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    type(bin1('3PLP'), 'Q');
    expect(bin1('3PLP')).toHaveValue('q');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // Back on a real one, the capitals come back.
    type(bin1('3PLP'), 'b.2.c.4');
    expect(bin1('3PLP')).toHaveValue('B.2.C.4');
  });

  test('a location half typed cannot be saved, and is said to be unfinished rather than wrong', async () => {
    await startEditing();
    type(bin1('3PLP'), 'b.2.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('alert', { name: 'What has to be fixed before saving' }))
      .toHaveTextContent('3PLP · Primary bin 1 “B.2.” is not a whole location yet — finish it, or choose one from the list.');
    fireEvent.keyDown(bin1('3PLP'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  });

  test('Escape and leaving the field close the list without changing what was typed', async () => {
    await startEditing();
    type(bin1('3PLP'), 'b.');
    fireEvent.keyDown(bin1('3PLP'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(bin1('3PLP')).toHaveValue('B.');
    type(bin1('3PLP'), 'b.1');
    expect(offered()).toEqual(['B.1.A.1', 'B.10.A.1']);
    fireEvent.blur(bin1('3PLP'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(bin1('3PLP')).toHaveValue('B.1');
  });

  test('a code already in a field is not second-guessed until it is typed in', async () => {
    await startEditing();
    bin1('HQ').focus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(bin1('HQ')).toHaveValue('B.3.H.1');
  });

  test('each branch is offered its own racking', async () => {
    const small = { version: 1, aisles: ['A'], baysPerAisle: 2, beams: [2], excessShelf: false, positions: 3, oddSide: 'right' };
    adminSettings.get.mockImplementation((key) => Promise.resolve({ key, value: key === 'warehouse_layout:MELB' ? JSON.stringify(small) : null }));
    await startEditing();
    type(bin1('MELB'), 'a.');
    expect(offered()).toEqual(['A.1.A.1', 'A.2.A.1']);
    type(bin1('MELB'), 'b');
    expect(bin1('MELB')).toHaveValue('b');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('a letter typed into the middle of a code leaves the caret where it was', async () => {
    await startEditing();
    const field = bin1('HQ');
    field.focus();
    // "B.3.H.1" with its level retyped in lower case: the caret is just after it.
    type(field, 'B.3.h.1', { selectionStart: 5, selectionEnd: 5 });
    expect(field).toHaveValue('B.3.H.1');
    expect([field.selectionStart, field.selectionEnd]).toEqual([5, 5]);
  });

  test('only the bin fields: a zone is kept as it is typed', async () => {
    await startEditing();
    fireEvent.change(screen.getByLabelText('HQ zone'), { target: { value: 'Front dock' } });
    expect(screen.getByLabelText('HQ zone')).toHaveValue('Front dock');
  });
});

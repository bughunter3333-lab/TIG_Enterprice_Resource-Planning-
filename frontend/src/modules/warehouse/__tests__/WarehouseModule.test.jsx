/**
 * The warehouse screen around the 3D view. The canvas itself needs WebGL,
 * which jsdom has not got, so it is stubbed; what is tested is what a person
 * relies on: the counts, finding a bin, its details, the bins that do not fit
 * the racking, and who may change the layout.
 */
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { adminSettings, stock } from '../../../api';
import { subscribe } from '../../../lib/notify';
import WarehouseModule from '../WarehouseModule';

vi.mock('../../../api', () => ({
  adminSettings: { get: vi.fn(), set: vi.fn() },
  stock: { binMap: vi.fn(), putAway: vi.fn(), locationSummary: vi.fn() },
}));
// Every `focus` the scene is handed, in order: a new object is a new fly-to.
const scene = vi.hoisted(() => ({ focus: [] }));
vi.mock('../Warehouse3D', () => ({
  // Stands in for clicking an empty box in the canvas.
  default: ({ selected, focus, onSelect }) => {
    scene.focus.push(focus);
    return (
      <div data-testid="scene">
        scene {selected ?? 'none'}
        <button type="button" onClick={() => onSelect('E.2.H.4')}>pick E.2.H.4</button>
      </div>
    );
  },
}));

const BINS = [
  { bin: 'A.1.A.1', slot: 'primary', sku: 'AS-5001-NAV-L', name: 'Staple Tee Navy L', max_qty: 30, qty_on_hand: 40, committed_qty: 15, available_qty: 25 },
  { bin: 'B.3.C.4', slot: 'primary', sku: 'CAP-5PNL-BLK', name: '5-Panel Cap Black', max_qty: null, qty_on_hand: 0, committed_qty: 0, available_qty: 0 },
  { bin: 'A-01-04', slot: 'primary', sku: 'LEGACY-1', name: 'Old code', max_qty: null, qty_on_hand: 3, committed_qty: 0, available_qty: 3 },
];

beforeEach(() => {
  vi.clearAllMocks();
  scene.focus.length = 0;
  adminSettings.get.mockResolvedValue({ key: 'warehouse_layout:HQ', value: null });
  stock.binMap.mockResolvedValue({ branch: 'HQ', bins: BINS });
  stock.locationSummary.mockResolvedValue({ total_on_hand: 0, located: 0, unlocated: 0, in_sync: true });
  // jsdom cannot draw; pretend WebGL exists so the (stubbed) scene renders.
  window.WebGLRenderingContext = function WebGLRenderingContext() {};
  HTMLCanvasElement.prototype.getContext = () => ({});
});

const facet = (label) => within(screen.getByRole('group', { name: 'Highlight bins' })).getByText(label).closest('button');

test('counts bins by state, and lists codes that do not fit the racking', async () => {
  renderWithQuery(<WarehouseModule currentUser={{ role: 'staff' }} onOpenSku={() => {}} />);
  await screen.findByTestId('scene');
  expect(within(facet('Over capacity')).getByText('1')).toBeInTheDocument();
  expect(within(facet('Slotted, none on hand')).getByText('1')).toBeInTheDocument();
  expect(within(facet('Not on the map')).getByText('1')).toBeInTheDocument();
  expect(screen.getByText(/Not an aisle.bay.level.box code/)).toBeInTheDocument();
});

test('finding a SKU lists its bin; picking it opens the bin with the branch figures', async () => {
  const onOpenSku = vi.fn();
  renderWithQuery(<WarehouseModule currentUser={{ role: 'staff' }} onOpenSku={onOpenSku} />);
  await screen.findByTestId('scene');
  fireEvent.change(screen.getByLabelText('Find SKU, product or bin'), { target: { value: 'navy' } });
  fireEvent.click(screen.getByRole('button', { name: /A\.1\.A\.1/ }));

  const panel = screen.getByRole('complementary', { name: 'Bin A.1.A.1' });
  expect(within(panel).getByText(/Aisle A · Bay 1, right-hand side · Level A · Box 1/)).toBeInTheDocument();
  expect(within(panel).getByText('25')).toBeInTheDocument();
  expect(within(panel).getByText(/More on hand than its bins hold/)).toBeInTheDocument();
  expect(screen.getByTestId('scene')).toHaveTextContent('A.1.A.1');

  fireEvent.click(within(panel).getByRole('button', { name: /Open item/ }));
  expect(onOpenSku).toHaveBeenCalledWith('AS-5001-NAV-L');
});

describe('where the camera is sent', () => {
  const last = () => scene.focus[scene.focus.length - 1];

  test('picking a box asks for a front view of it, and nothing else moves the camera', async () => {
    renderWithQuery(<WarehouseModule currentUser={{ role: 'staff' }} onOpenSku={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'pick E.2.H.4' }));
    const sent = last();
    expect(sent.target).toHaveLength(3);
    expect(sent.eye[2]).toBe(sent.target[2]); // square to the box's face

    // Typing in the search redraws the screen; the camera must be left alone.
    fireEvent.change(screen.getByLabelText('Find SKU, product or bin'), { target: { value: 'navy' } });
    expect(last()).toBe(sent);
  });

  test('picking the same box again faces it again, after the view has been moved away', async () => {
    renderWithQuery(<WarehouseModule currentUser={{ role: 'staff' }} onOpenSku={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'pick E.2.H.4' }));
    const first = last();
    fireEvent.click(screen.getByRole('button', { name: 'pick E.2.H.4' }));
    expect(last()).not.toBe(first);
    expect(last()).toEqual(first);
  });

  test('says how to move around the racking', async () => {
    renderWithQuery(<WarehouseModule currentUser={{ role: 'staff' }} onOpenSku={() => {}} />);
    await screen.findByTestId('scene');
    expect(screen.getByText(/Drag to move/)).toHaveTextContent(/right-drag to turn.*scroll to zoom.*click a box to face it/i);
  });

  test('on a touch screen the hint names the gestures a touch screen has', async () => {
    const real = window.matchMedia;
    window.matchMedia = (query) => ({ matches: query === '(pointer: coarse)' });
    try {
      renderWithQuery(<WarehouseModule currentUser={{ role: 'staff' }} onOpenSku={() => {}} />);
      await screen.findByTestId('scene');
      expect(screen.getByText(/Drag to move/)).toHaveTextContent(/two fingers to turn.*pinch to zoom.*tap a box to face it/i);
    } finally {
      window.matchMedia = real;
    }
  });
});

test('only an admin can edit the racking layout, and it saves per branch', async () => {
  const { unmount } = renderWithQuery(<WarehouseModule currentUser={{ role: 'manager' }} onOpenSku={() => {}} />);
  await screen.findByTestId('scene');
  expect(screen.queryByRole('button', { name: /Edit layout/ })).not.toBeInTheDocument();
  unmount();

  adminSettings.set.mockResolvedValue({});
  renderWithQuery(<WarehouseModule currentUser={{ role: 'admin' }} onOpenSku={() => {}} />);
  await screen.findByTestId('scene');
  fireEvent.click(screen.getByRole('button', { name: /Edit layout/ }));
  fireEvent.change(screen.getByLabelText(/Bays per aisle/), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save layout' }));
  await vi.waitFor(() => expect(adminSettings.set).toHaveBeenCalled());
  const [key, value] = adminSettings.set.mock.calls[0];
  expect(key).toBe('warehouse_layout:HQ');
  expect(JSON.parse(value).baysPerAisle).toBe(12);
});

test('a layout that cannot be read falls back to the default and says so', async () => {
  adminSettings.get.mockResolvedValue({ key: 'warehouse_layout:HQ', value: '{"aisles":[]}' });
  renderWithQuery(<WarehouseModule currentUser={{ role: 'staff' }} onOpenSku={() => {}} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/default racking is shown/);
});

const INVENTORY = [
  { sku: 'AS-5001-NAV-L', name: 'Staple Tee Navy L' },
  { sku: 'CAP-5PNL-BLK', name: '5-Panel Cap Black' },
];

describe('adding stock to a box', () => {
  const open = async (role) => {
    renderWithQuery(<WarehouseModule currentUser={{ role }} inventory={INVENTORY} onOpenSku={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'pick E.2.H.4' }));
    return screen.getByRole('complementary', { name: 'Bin E.2.H.4' });
  };

  test('staff see the box but cannot add stock to it', async () => {
    const panel = await open('staff');
    expect(within(panel).getByText('Nothing is slotted into this box.')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /Add stock/ })).not.toBeInTheDocument();
  });

  test('a manager slots a product into an empty box and adds the quantity', async () => {
    stock.putAway.mockResolvedValue({ bin: 'E.2.H.4', placed_unlocated: 0, on_hand_change: 12 });
    const panel = await open('manager');
    fireEvent.click(within(panel).getByRole('button', { name: /Add stock/ }));
    fireEvent.change(within(panel).getByLabelText('Product'), { target: { value: 'cap' } });
    fireEvent.click(within(panel).getByRole('button', { name: /CAP-5PNL-BLK/ }));
    fireEvent.click(within(panel).getByLabelText('New stock, not counted yet'));
    fireEvent.change(within(panel).getByLabelText('New stock to add'), { target: { value: '12' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Add 12 to E.2.H.4' }));

    await vi.waitFor(() => expect(stock.putAway).toHaveBeenCalled());
    // CAP-5PNL-BLK's primary is B.3.C.4, so this box defaults to its overflow bin.
    expect(stock.putAway.mock.calls[0][0]).toEqual({
      branch: 'HQ', bin: 'E.2.H.4', sku: 'CAP-5PNL-BLK', slot: 'overflow',
      quantity: 12, new_stock: true, replace: false, replace_bin: null, max_qty: null, reason: null,
    });
  });

  test("a product's existing bin is replaced only when that is ticked", async () => {
    stock.putAway.mockResolvedValue({});
    const panel = await open('admin');
    fireEvent.click(within(panel).getByRole('button', { name: /Add stock/ }));
    fireEvent.change(within(panel).getByLabelText('Product'), { target: { value: 'navy' } });
    fireEvent.click(within(panel).getByRole('button', { name: /AS-5001-NAV-L/ }));
    fireEvent.click(within(panel).getByLabelText('Primary bin'));

    const submit = within(panel).getByRole('button', { name: 'Slot into E.2.H.4' });
    expect(submit).toBeDisabled();
    fireEvent.click(within(panel).getByLabelText(/Its primary bin is A.1.A.1/));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await vi.waitFor(() => expect(stock.putAway).toHaveBeenCalled());
    expect(stock.putAway.mock.calls[0][0]).toMatchObject({ sku: 'AS-5001-NAV-L', slot: 'primary', replace: true, quantity: 0 });
  });

  // Opens the form on E.2.H.4 and chooses a product by typing part of its name.
  const choose = async (text, sku, role = 'manager') => {
    const panel = await open(role);
    fireEvent.click(within(panel).getByRole('button', { name: /Add stock/ }));
    fireEvent.change(within(panel).getByLabelText('Product'), { target: { value: text } });
    fireEvent.click(within(panel).getByRole('button', { name: new RegExp(sku) }));
    return panel;
  };
  const addNew = (panel, quantity) => {
    fireEvent.click(within(panel).getByLabelText('New stock, not counted yet'));
    fireEvent.change(within(panel).getByLabelText('New stock to add'), { target: { value: String(quantity) } });
  };
  const CAP = { slot: 'primary', sku: 'CAP-5PNL-BLK', name: '5-Panel Cap Black', max_qty: null, qty_on_hand: 0, committed_qty: 0, available_qty: 0 };

  test('a box on file with a zero-padded code is the same box, not a second bin', async () => {
    // The Locations tab stores free text: E.02.H.04 is the box the map draws as E.2.H.4.
    stock.binMap.mockResolvedValue({ branch: 'HQ', bins: [{ ...CAP, bin: 'E.02.H.04' }] });
    stock.putAway.mockResolvedValue({});
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    expect(within(panel).getByText(/Already in this box/)).toBeInTheDocument();
    expect(within(panel).queryByLabelText('Overflow bin')).not.toBeInTheDocument();

    addNew(panel, 3);
    fireEvent.click(within(panel).getByRole('button', { name: 'Add 3 to E.2.H.4' }));
    await vi.waitFor(() => expect(stock.putAway).toHaveBeenCalled());
    expect(stock.putAway.mock.calls[0][0]).toMatchObject({ slot: 'primary', replace: false, quantity: 3 });
  });

  test('stock already on hand goes in without a quantity, and the count is not touched', async () => {
    // Received stock is in the on-hand figure already. The safe reading is the default.
    stock.locationSummary.mockResolvedValue({ total_on_hand: 40, located: 40, unlocated: 0, in_sync: true });
    stock.putAway.mockResolvedValue({ placed_unlocated: 0, on_hand_change: 0 });
    const panel = await choose('navy', 'AS-5001-NAV-L');
    expect(within(panel).getByLabelText('Already on hand')).toBeChecked();
    expect(await within(panel).findByText(/counted per branch, not per box.*total on hand stays at 40/i)).toBeInTheDocument();
    expect(within(panel).queryByRole('spinbutton', { name: /New stock|How many/ })).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' }));
    await vi.waitFor(() => expect(stock.putAway).toHaveBeenCalled());
    expect(stock.putAway.mock.calls[0][0]).toMatchObject({ sku: 'AS-5001-NAV-L', quantity: 0, new_stock: false });
  });

  test('on-hand stock with no location yet is placed, up to how much there is', async () => {
    stock.locationSummary.mockResolvedValue({ total_on_hand: 50, located: 0, unlocated: 50, in_sync: false });
    stock.putAway.mockResolvedValue({ placed_unlocated: 30, on_hand_change: 0 });
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    const some = await within(panel).findByLabelText(/How many of the 50 with no location go in this box/);
    expect(stock.locationSummary).toHaveBeenCalledWith('CAP-5PNL-BLK');

    fireEvent.change(some, { target: { value: '80' } });
    expect(within(panel).getByRole('alert')).toHaveTextContent(/Only 50 have no location/);
    expect(within(panel).getByRole('button', { name: /E\.2\.H\.4$/ })).toBeDisabled();

    fireEvent.change(some, { target: { value: '30' } });
    expect(within(panel).getByText(/Records 30 of them at HQ\. Total on hand stays at 50\./)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Put 30 into E.2.H.4' }));
    await vi.waitFor(() => expect(stock.putAway).toHaveBeenCalled());
    expect(stock.putAway.mock.calls[0][0]).toMatchObject({ quantity: 30, new_stock: false });
  });

  test('new stock has to be said to be new, and says the total goes up', async () => {
    stock.locationSummary.mockResolvedValue({ total_on_hand: 40, located: 40, unlocated: 0, in_sync: true });
    const panel = await choose('navy', 'AS-5001-NAV-L');
    addNew(panel, 12);
    expect(await within(panel).findByText(/Adds 12 to the total on hand \(40 → 52\)/)).toBeInTheDocument();

    fireEvent.click(within(panel).getByLabelText('Already on hand'));
    expect(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' })).toBeEnabled();
  });

  test('the confirmation reports what the server did, and the form waits for the answer', async () => {
    const said = [];
    const unsubscribe = subscribe((n) => said.push(n.message));
    let finish;
    stock.putAway.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    addNew(panel, 12);
    fireEvent.click(within(panel).getByRole('button', { name: 'Add 12 to E.2.H.4' }));
    await vi.waitFor(() => expect(stock.putAway).toHaveBeenCalled());

    // Still waiting on the server: nothing in the form can be changed.
    expect(within(panel).getByLabelText('New stock to add')).toBeDisabled();
    finish({ bin: 'E.2.H.4', placed_unlocated: 0, on_hand_change: 12 });
    await vi.waitFor(() => expect(said).toHaveLength(1));
    expect(said[0]).toBe('Added 12 × 5-Panel Cap Black to E.2.H.4 — total on hand up 12');
    unsubscribe();
  });

  test('stock that was already counted is confirmed as placed, with the total unchanged', async () => {
    const said = [];
    const unsubscribe = subscribe((n) => said.push(n.message));
    stock.locationSummary.mockResolvedValue({ total_on_hand: 50, located: 0, unlocated: 50, in_sync: false });
    // The server placed fewer than asked: someone else located some in the meantime.
    stock.putAway.mockResolvedValue({ bin: 'E.2.H.4', placed_unlocated: 9, on_hand_change: 0 });
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    fireEvent.change(await within(panel).findByLabelText(/How many of the 50/), { target: { value: '12' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Put 12 into E.2.H.4' }));
    await vi.waitFor(() => expect(said).toHaveLength(1));
    expect(said[0]).toBe('Put 9 × 5-Panel Cap Black into E.2.H.4 — already counted, total on hand unchanged');
    unsubscribe();
  });

  test('a capacity or quantity that cannot be saved says why the button is off', async () => {
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    fireEvent.change(within(panel).getByLabelText(/Box holds up to/), { target: { value: '0' } });
    expect(within(panel).getByRole('alert')).toHaveTextContent(/holds up to.*whole number.*1/i);
    expect(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' })).toBeDisabled();

    fireEvent.change(within(panel).getByLabelText(/Box holds up to/), { target: { value: '' } });
    addNew(panel, 100001);
    expect(within(panel).getByRole('alert')).toHaveTextContent(/New stock.*100,000/);
  });

  test('when someone else has taken the slot, the refusal brings the Replace choice with it', async () => {
    const taken = Object.assign(new Error("CAP-5PNL-BLK's overflow bin at HQ is D.1.A.1. Replace it with E.2.H.4, or use the other slot."), { status: 409 });
    stock.putAway.mockRejectedValue(taken);
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    // By the time the server refuses, the bin map knows about the other box.
    stock.binMap.mockResolvedValue({ branch: 'HQ', bins: [...BINS, { ...CAP, bin: 'D.1.A.1', slot: 'overflow' }] });
    fireEvent.click(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' }));

    expect(await within(panel).findByRole('alert')).toHaveTextContent(/overflow bin at HQ is D.1.A.1/);
    expect(await within(panel).findByLabelText(/Its overflow bin is D.1.A.1/)).toBeInTheDocument();
  });

  test('switching what the stock is drops the quantity typed for the other meaning', async () => {
    stock.locationSummary.mockResolvedValue({ total_on_hand: 50, located: 0, unlocated: 50, in_sync: false });
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    fireEvent.change(await within(panel).findByLabelText(/How many of the 50/), { target: { value: '30' } });
    expect(within(panel).getByRole('button', { name: 'Put 30 into E.2.H.4' })).toBeEnabled();

    // 30 of the unlocated must not become 30 new units.
    fireEvent.click(within(panel).getByLabelText('New stock, not counted yet'));
    expect(within(panel).getByLabelText('New stock to add')).toHaveValue(null);
    expect(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' })).toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText('New stock to add'), { target: { value: '7' } });
    fireEvent.click(within(panel).getByLabelText('Already on hand'));
    expect(within(panel).getByLabelText(/How many of the 50/)).toHaveValue(null);
  });

  test('one put-away records at most what the server takes, however much has no location', async () => {
    stock.locationSummary.mockResolvedValue({ total_on_hand: 250000, located: 0, unlocated: 250000, in_sync: false });
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    const some = await within(panel).findByLabelText(/How many of the 250,000 with no location/);
    fireEvent.change(some, { target: { value: '120000' } });
    expect(within(panel).getByRole('alert')).toHaveTextContent(/one put-away records up to 100,000/);
    expect(within(panel).getByRole('button', { name: /E\.2\.H\.4$/ })).toBeDisabled();
    fireEvent.change(some, { target: { value: '100000' } });
    expect(within(panel).getByRole('button', { name: 'Put 100,000 into E.2.H.4' })).toBeEnabled();
  });

  test('nothing can be called off once it is on its way, and a refusal gives the form back', async () => {
    let refuse;
    stock.putAway.mockReturnValue(new Promise((_, reject) => { refuse = reject; }));
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    fireEvent.click(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' }));
    await vi.waitFor(() => expect(stock.putAway).toHaveBeenCalled());
    expect(within(panel).getByRole('button', { name: 'Cancel' })).toBeDisabled();

    const said = [];
    const unsubscribe = subscribe((n) => said.push(n));
    refuse(Object.assign(new Error('Request failed: 500'), { status: 500 }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(/Couldn't add the stock: Request failed: 500/);
    expect(within(panel).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(stock.putAway).toHaveBeenCalledTimes(1);
    // Said once, in the form: not as a toast as well.
    expect(said).toHaveLength(0);
    unsubscribe();
  });

  test('a save that fails after the form has gone is still reported', async () => {
    const said = [];
    const unsubscribe = subscribe((n) => said.push(n));
    let refuse;
    stock.putAway.mockReturnValue(new Promise((_, reject) => { refuse = reject; }));
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    fireEvent.click(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' }));
    await vi.waitFor(() => expect(stock.putAway).toHaveBeenCalled());

    // The person moves on while it is saving: the panel, and the form in it, close.
    fireEvent.click(within(panel).getByRole('button', { name: 'Close bin details' }));
    refuse(Object.assign(new Error('Request failed: 500'), { status: 500 }));
    await vi.waitFor(() => expect(said).toHaveLength(1));
    expect(said[0]).toMatchObject({ type: 'error', message: "Couldn't add 5-Panel Cap Black to E.2.H.4: Request failed: 500" });
    unsubscribe();
  });

  test('agreeing to replace one bin is not agreeing to replace another', async () => {
    stock.putAway.mockResolvedValue({ placed_unlocated: 0, on_hand_change: 0 });
    const panel = await choose('navy', 'AS-5001-NAV-L');
    fireEvent.click(within(panel).getByLabelText('Primary bin'));
    fireEvent.click(within(panel).getByLabelText(/Its primary bin is A.1.A.1/));

    // The other slot was never agreed to; nor is the tick still standing when coming back.
    fireEvent.click(within(panel).getByLabelText('Overflow bin'));
    fireEvent.click(within(panel).getByLabelText('Primary bin'));
    expect(within(panel).getByLabelText(/Its primary bin is A.1.A.1/)).not.toBeChecked();
    expect(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' })).toBeDisabled();
  });

  test('a tick for a bin that has since changed is not sent for the new one', async () => {
    stock.putAway.mockResolvedValue({ placed_unlocated: 0, on_hand_change: 0 });
    const { client } = renderWithQuery(<WarehouseModule currentUser={{ role: 'manager' }} inventory={INVENTORY} onOpenSku={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'pick E.2.H.4' }));
    const panel = screen.getByRole('complementary', { name: 'Bin E.2.H.4' });
    fireEvent.click(within(panel).getByRole('button', { name: /Add stock/ }));
    fireEvent.change(within(panel).getByLabelText('Product'), { target: { value: 'navy' } });
    fireEvent.click(within(panel).getByRole('button', { name: /AS-5001-NAV-L/ }));
    fireEvent.click(within(panel).getByLabelText('Primary bin'));
    fireEvent.click(within(panel).getByLabelText(/Its primary bin is A.1.A.1/));
    expect(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' })).toBeEnabled();

    // Someone re-slots the product elsewhere while the form is open.
    stock.binMap.mockResolvedValue({ branch: 'HQ', bins: [{ ...BINS[0], bin: 'C.5.B.2' }] });
    await client.invalidateQueries({ queryKey: ['bin-map', 'HQ'] });
    const fresh = await within(panel).findByLabelText(/Its primary bin is C.5.B.2/);
    expect(fresh).not.toBeChecked();
    expect(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' })).toBeDisabled();
  });

  test('a refusal about one product does not stay on screen beside the next', async () => {
    stock.putAway.mockRejectedValue(Object.assign(new Error('Request failed: 500'), { status: 500 }));
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    fireEvent.click(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(/Request failed: 500/);
    fireEvent.click(within(panel).getByRole('button', { name: 'Change' }));
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
  });

  test('the keyboard keeps its place: product to the choices, and back to Add stock on cancel', async () => {
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    // The group, not a control in it: Enter still held from choosing must not save.
    expect(within(panel).getByRole('group', { name: '5-Panel Cap Black into E.2.H.4' })).toHaveFocus();
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancel' }));
    expect(within(panel).getByRole('button', { name: /Add stock/ })).toHaveFocus();
  });

  test('a save that lands does not pull focus from where the person has gone', async () => {
    let finish;
    stock.putAway.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    fireEvent.click(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' }));
    await vi.waitFor(() => expect(stock.putAway).toHaveBeenCalled());
    const search = screen.getByLabelText('Find SKU, product or bin');
    search.focus();
    finish({ placed_unlocated: 0, on_hand_change: 0 });
    await vi.waitFor(() => expect(within(panel).getByRole('button', { name: /Add stock/ })).toBeInTheDocument());
    expect(search).toHaveFocus();
  });

  test('the request names the bin the tick was for', async () => {
    stock.putAway.mockResolvedValue({ placed_unlocated: 0, on_hand_change: 0 });
    const panel = await choose('navy', 'AS-5001-NAV-L');
    fireEvent.click(within(panel).getByLabelText('Primary bin'));
    fireEvent.click(within(panel).getByLabelText(/Its primary bin is A.1.A.1/));
    fireEvent.click(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' }));
    await vi.waitFor(() => expect(stock.putAway).toHaveBeenCalled());
    expect(stock.putAway.mock.calls[0][0]).toMatchObject({ slot: 'primary', replace: true, replace_bin: 'A.1.A.1' });
  });

  test('ticking Replace fixes the slot, so a refreshed map cannot move the agreement to the other one', async () => {
    // Both of the cap's bins are taken; the form starts on Primary because neither is free.
    stock.binMap.mockResolvedValue({ branch: 'HQ', bins: [...BINS, { ...CAP, bin: 'D.1.A.1', slot: 'overflow' }] });
    const { client } = renderWithQuery(<WarehouseModule currentUser={{ role: 'manager' }} inventory={INVENTORY} onOpenSku={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'pick E.2.H.4' }));
    const panel = screen.getByRole('complementary', { name: 'Bin E.2.H.4' });
    fireEvent.click(within(panel).getByRole('button', { name: /Add stock/ }));
    fireEvent.change(within(panel).getByLabelText('Product'), { target: { value: 'cap' } });
    fireEvent.click(within(panel).getByRole('button', { name: /CAP-5PNL-BLK/ }));
    fireEvent.click(within(panel).getByLabelText(/Its primary bin is B.3.C.4/));

    // The overflow bin is cleared elsewhere. Unpinned, the default would now drift to Overflow.
    stock.binMap.mockResolvedValue({ branch: 'HQ', bins: BINS });
    await client.invalidateQueries({ queryKey: ['bin-map', 'HQ'] });
    await vi.waitFor(() => expect(within(panel).getByText(/overflow bin —/)).toBeInTheDocument());
    expect(within(panel).getByLabelText('Primary bin')).toBeChecked();
    expect(within(panel).getByLabelText(/Its primary bin is B.3.C.4/)).toBeChecked();
  });

  test('a quantity typed for stock with no location does not come back when that stock has gone', async () => {
    stock.locationSummary.mockResolvedValue({ total_on_hand: 50, located: 0, unlocated: 50, in_sync: false });
    const { client } = renderWithQuery(<WarehouseModule currentUser={{ role: 'manager' }} inventory={INVENTORY} onOpenSku={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'pick E.2.H.4' }));
    const panel = screen.getByRole('complementary', { name: 'Bin E.2.H.4' });
    fireEvent.click(within(panel).getByRole('button', { name: /Add stock/ }));
    fireEvent.change(within(panel).getByLabelText('Product'), { target: { value: 'cap' } });
    fireEvent.click(within(panel).getByRole('button', { name: /CAP-5PNL-BLK/ }));
    fireEvent.change(await within(panel).findByLabelText(/How many of the 50/), { target: { value: '30' } });

    // Someone else locates all of it: the field goes, and its number with it.
    stock.locationSummary.mockResolvedValue({ total_on_hand: 50, located: 50, unlocated: 0, in_sync: true });
    await client.invalidateQueries({ queryKey: ['stock-location-summary'] });
    await vi.waitFor(() => expect(within(panel).queryByLabelText(/How many of the/)).not.toBeInTheDocument());
    expect(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' })).toBeEnabled();

    stock.locationSummary.mockResolvedValue({ total_on_hand: 60, located: 50, unlocated: 10, in_sync: false });
    await client.invalidateQueries({ queryKey: ['stock-location-summary'] });
    expect(await within(panel).findByLabelText(/How many of the 10/)).toHaveValue(null);
  });

  test('choosing another product starts again: slot, agreement and what the stock is', async () => {
    // Both products have both bins taken, and the same box as their primary bin,
    // so nothing but a reset tells one product's choices from the other's.
    const TEE = { ...CAP, sku: 'AS-5001-NAV-L', name: 'Staple Tee Navy L' };
    stock.binMap.mockResolvedValue({ branch: 'HQ', bins: [
      { ...CAP, bin: 'A.1.A.1' }, { ...CAP, bin: 'D.1.A.1', slot: 'overflow' },
      { ...TEE, bin: 'A.1.A.1' }, { ...TEE, bin: 'D.2.A.1', slot: 'overflow' },
    ] });
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    const another = (text, sku) => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Change' }));
      fireEvent.change(within(panel).getByLabelText('Product'), { target: { value: text } });
      fireEvent.click(within(panel).getByRole('button', { name: new RegExp(sku) }));
    };
    fireEvent.click(within(panel).getByLabelText(/Its primary bin is A.1.A.1/));
    fireEvent.click(within(panel).getByLabelText('New stock, not counted yet'));

    another('navy', 'AS-5001-NAV-L');
    expect(within(panel).getByLabelText(/Its primary bin is A.1.A.1/)).not.toBeChecked();
    expect(within(panel).getByLabelText('Already on hand')).toBeChecked();

    fireEvent.click(within(panel).getByLabelText('Overflow bin'));
    another('cap', 'CAP-5PNL-BLK');
    expect(within(panel).getByLabelText('Primary bin')).toBeChecked();
  });

  test('offline, the save fails there and then instead of waiting to fire later', async () => {
    const { onlineManager } = await import('@tanstack/react-query');
    stock.putAway.mockRejectedValue(new Error('Failed to fetch'));
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    onlineManager.setOnline(false);
    try {
      fireEvent.click(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' }));
      expect(await within(panel).findByRole('alert')).toHaveTextContent(/Couldn't add the stock: Failed to fetch/);
      expect(stock.putAway).toHaveBeenCalledTimes(1);
    } finally {
      onlineManager.setOnline(true);
    }
  });

  test('a refused save gives the keyboard back to where it was', async () => {
    let refuse;
    stock.putAway.mockReturnValue(new Promise((_, reject) => { refuse = reject; }));
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    const noteField = within(panel).getByLabelText('Note (optional)');
    noteField.focus();
    fireEvent.submit(within(panel).getByRole('form', { name: 'Add stock to E.2.H.4' }));
    await vi.waitFor(() => expect(stock.putAway).toHaveBeenCalled());
    // A browser drops focus to the page when the field is disabled for the
    // save. jsdom leaves it there (and will not blur a disabled field), so
    // move it off by way of something that can be blurred.
    const elsewhere = document.body.appendChild(document.createElement('button'));
    elsewhere.focus();
    elsewhere.blur();
    elsewhere.remove();
    expect(document.body).toHaveFocus();
    refuse(Object.assign(new Error('Request failed: 500'), { status: 500 }));
    await within(panel).findByRole('alert');
    await vi.waitFor(() => expect(noteField).toHaveFocus());
  });

  test('signed out mid-save, the failure is said aloud, because the sign-in page is about to replace the form', async () => {
    const said = [];
    const unsubscribe = subscribe((n) => said.push(n));
    stock.putAway.mockRejectedValue(Object.assign(new Error('Not authenticated'), { status: 401 }));
    const panel = await choose('cap', 'CAP-5PNL-BLK');
    fireEvent.click(within(panel).getByRole('button', { name: 'Slot into E.2.H.4' }));
    await vi.waitFor(() => expect(said).toHaveLength(1));
    expect(said[0]).toMatchObject({ type: 'error', message: "Couldn't add 5-Panel Cap Black to E.2.H.4: Not authenticated" });
    unsubscribe();
  });
});

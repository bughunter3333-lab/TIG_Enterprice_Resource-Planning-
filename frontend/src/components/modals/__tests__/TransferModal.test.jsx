/**
 * Moving stock between items, bins and branches.
 *
 * Every field on this form ends up as a key in one POST body, and the branch
 * pair is the part with history: omitting it once made every transfer a
 * same-branch move against HQ whatever the operator picked, so `api.js` now
 * carries a comment about it. These pin the payload from this side — source,
 * destination, quantity and BOTH branches — because a transfer that reaches the
 * server with the wrong branch moves units that were never there.
 *
 * The two mutually exclusive destinations matter as much. Picking a SKU has to
 * clear a typed location and typing a location has to clear the picked SKU;
 * send both and the server is being told two different stories.
 *
 * The API is reached with vi.spyOn on the real module, never a partial mock —
 * a method this component calls that a literal forgot renders as nothing.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import TransferModal from '../TransferModal';
import { inventory as inventoryApi } from '../../../api';
import { BRANCHES } from '../../../branches';

const INVENTORY = [
  { sku: 'TEE-BLK-M', name: 'Heavy Tee — Black', stock: 40, location: 'A-12-3' },
  { sku: 'CAP-NVY', name: 'Structured Cap — Navy', stock: 12, location: 'B-04-1' },
];

const open = (over = {}) => ({
  open: true,
  fromSku: 'TEE-BLK-M',
  toSku: '',
  toLocation: '',
  quantity: 5,
  fromBranch: 'HQ',
  toBranch: 'Sydney',
  reference: 'XFER-014',
  notes: '',
  loading: false,
  error: '',
  ...over,
});

let transfer;
beforeEach(() => {
  transfer = vi.spyOn(inventoryApi, 'transfer').mockResolvedValue({ ok: true });
});
afterEach(() => vi.restoreAllMocks());

const setup = (state = {}) => {
  const props = {
    inventory: INVENTORY,
    transferModal: open(state),
    setTransferModal: vi.fn(),
  };
  const view = renderWithQuery(<TransferModal {...props} />);
  return { ...props, ...view };
};

// No label in this modal points at its control (bare <label>, no htmlFor), so
// the selects are told apart by what they offer rather than by label text.
const combos = () => screen.getAllByRole('combobox');
const selectOffering = (optionText) =>
  combos().find(s => [...s.options].some(o => o.textContent === optionText));
const sourceSelect = () => selectOffering('— Select source item —');
const destSelect = () => selectOffering('— Same item —');
const branchSelect = (value) =>
  combos().find(s => s.options.length === BRANCHES.length && s.value === value);

// The handlers pass updaters to the setter. Applying one to a sentinel is the
// only honest way to read it: the closure holds the live DOM node, which React
// has already reset to its prop value by the time a test runs the updater.
const applyLast = (setter, sentinel) => {
  const arg = setter.mock.calls.at(-1)[0];
  return typeof arg === 'function' ? arg(sentinel) : arg;
};

test('renders nothing while closed', () => {
  const { container } = setup({ open: false });
  expect(container).toBeEmptyDOMElement();
});

test('offers every stocked item as a source, with its holding', () => {
  setup();
  expect(screen.getByRole('heading', { name: 'Transfer Stock' })).toBeInTheDocument();
  expect([...sourceSelect().options].map(o => o.textContent)).toEqual([
    '— Select source item —',
    'TEE-BLK-M — Heavy Tee — Black (Stock: 40)',
    'CAP-NVY — Structured Cap — Navy (Stock: 12)',
  ]);
  expect(sourceSelect()).toHaveValue('TEE-BLK-M');
});

test('states what the chosen source actually has', () => {
  setup();
  expect(screen.getByText('Available: 40 | Location: A-12-3')).toBeInTheDocument();
});

test('an item with no bin says so rather than showing a blank', () => {
  renderWithQuery(
    <TransferModal
      inventory={[{ sku: 'NO-BIN', name: 'Unbinned Tee', stock: 3, location: null }]}
      transferModal={open({ fromSku: 'NO-BIN' })}
      setTransferModal={vi.fn()}
    />
  );
  expect(screen.getByText('Available: 3 | Location: N/A')).toBeInTheDocument();
});

test('the quantity cannot be asked to exceed what is on hand', () => {
  setup();
  const qty = screen.getByRole('spinbutton');
  // A number input reports a number, not the string in the state.
  expect(qty).toHaveValue(5);
  expect(qty).toHaveAttribute('max', '40');
  expect(qty).toHaveAttribute('min', '1');
});

test('the source item is not offered back as its own destination', () => {
  setup();
  const labels = [...destSelect().options].map(o => o.textContent);
  expect(labels).toEqual(['— Same item —', 'CAP-NVY — Structured Cap — Navy']);
  expect(labels.some(l => l.startsWith('TEE-BLK-M'))).toBe(false);
});

test('both branches are pickable and hold their own value', () => {
  setup();
  expect(branchSelect('HQ')).toBeInTheDocument();
  expect(branchSelect('Sydney')).toBeInTheDocument();
});

test('a failed transfer is shown, not swallowed', () => {
  setup({ error: 'Insufficient stock at HQ' });
  expect(screen.getByText('Insufficient stock at HQ')).toBeInTheDocument();
});

test('a transfer in flight says so and cannot be sent twice', () => {
  setup({ loading: true });
  const button = screen.getByRole('button', { name: /transferring/i });
  expect(button).toBeDisabled();
  expect(screen.queryByRole('button', { name: /^Transfer$/ })).not.toBeInTheDocument();
});

test('a transfer with no source is refused before it reaches the API', async () => {
  const { setTransferModal } = setup({ fromSku: '' });
  fireEvent.click(screen.getByRole('button', { name: /^Transfer$/ }));

  await waitFor(() => expect(setTransferModal).toHaveBeenCalled());
  expect(transfer).not.toHaveBeenCalled();
  const next = applyLast(setTransferModal, open({ fromSku: '', notes: 'KEEP-ME' }));
  expect(next.error).toBe('Source SKU is required.');
  expect(next.notes).toBe('KEEP-ME');
  expect(next.open).toBe(true);
});

test('a transfer with no destination at all is refused too', async () => {
  const { setTransferModal } = setup({ toSku: '', toLocation: '' });
  fireEvent.click(screen.getByRole('button', { name: /^Transfer$/ }));

  await waitFor(() => expect(setTransferModal).toHaveBeenCalled());
  expect(transfer).not.toHaveBeenCalled();
  const next = applyLast(setTransferModal, open({ reference: 'KEEP-ME' }));
  expect(next.error).toBe('Destination SKU or Location is required.');
  expect(next.reference).toBe('KEEP-ME');
});

test('a move to a new bin sends the whole payload, both branches included', async () => {
  const { setTransferModal, client } = setup({ toLocation: 'Bin A3', notes: 'Overflow rack' });
  const invalidate = vi.spyOn(client, 'invalidateQueries');

  fireEvent.click(screen.getByRole('button', { name: /^Transfer$/ }));

  await waitFor(() => expect(transfer).toHaveBeenCalledTimes(1));
  expect(transfer).toHaveBeenCalledWith({
    fromSku: 'TEE-BLK-M',
    toSku: null,
    toLocation: 'Bin A3',
    quantity: 5,
    fromBranch: 'HQ',
    toBranch: 'Sydney',
    reference: 'XFER-014',
    notes: 'Overflow rack',
  });

  // Stale holdings after a move are how the next transfer gets sized wrong.
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory'] }));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['stockMovements'] });

  await waitFor(() => expect(applyLast(setTransferModal, open()).open).toBe(false));
});

test('a move onto another SKU sends that SKU and no location', async () => {
  setup({ toSku: 'CAP-NVY', toLocation: '' });
  fireEvent.click(screen.getByRole('button', { name: /^Transfer$/ }));
  await waitFor(() => expect(transfer).toHaveBeenCalledTimes(1));
  expect(transfer.mock.calls[0][0]).toMatchObject({ toSku: 'CAP-NVY', toLocation: null });
});

test('the modal marks itself busy before the call goes out', async () => {
  const { setTransferModal } = setup({ toLocation: 'Bin A3', error: 'stale error' });
  fireEvent.click(screen.getByRole('button', { name: /^Transfer$/ }));

  await waitFor(() => expect(setTransferModal).toHaveBeenCalled());
  const first = setTransferModal.mock.calls[0][0](open({ reference: 'KEEP-ME' }));
  expect(first.loading).toBe(true);
  expect(first.error).toBe('');
  expect(first.reference).toBe('KEEP-ME');
});

test('a rejected transfer surfaces the reason and leaves the modal open', async () => {
  transfer.mockRejectedValue(new Error('Insufficient stock at HQ'));
  const { setTransferModal } = setup({ toLocation: 'Bin A3' });

  fireEvent.click(screen.getByRole('button', { name: /^Transfer$/ }));

  await waitFor(() => expect(setTransferModal).toHaveBeenCalledTimes(2));
  const next = applyLast(setTransferModal, open({ toLocation: 'Bin A3' }));
  expect(next.error).toBe('Insufficient stock at HQ');
  expect(next.loading).toBe(false);
  // Closing here would read as a completed move.
  expect(next.open).toBe(true);
  expect(next.toLocation).toBe('Bin A3');
});

test('picking a destination SKU clears a typed location', async () => {
  const { setTransferModal } = setup({ toLocation: 'Bin A3' });
  fireEvent.change(destSelect(), { target: { value: 'CAP-NVY' } });

  // The chosen SKU itself is not asserted: the updater reads e.target.value
  // when it runs, and React has restored the select to its prop value by then.
  // The clear is a literal in the updater, so it is readable — and it is the
  // half that matters, since sending both destinations is the bug.
  const next = applyLast(setTransferModal, open({ toLocation: 'Bin A3', reference: 'KEEP-ME' }));
  expect(next.toLocation).toBe('');
  expect(next.reference).toBe('KEEP-ME');
  expect(next.fromBranch).toBe('HQ');
});

test('typing a location clears a picked destination SKU', () => {
  const { setTransferModal } = setup({ toSku: 'CAP-NVY' });
  fireEvent.change(screen.getByPlaceholderText('e.g. Bin A3'), { target: { value: 'Bin A3' } });

  const next = applyLast(setTransferModal, open({ toSku: 'CAP-NVY', notes: 'KEEP-ME' }));
  expect(next.toSku).toBe('');
  expect(next.notes).toBe('KEEP-ME');
});

test('editing the reference keeps every other key', () => {
  const { setTransferModal } = setup();
  fireEvent.change(screen.getByPlaceholderText('XFER-001'), { target: { value: 'XFER-999' } });

  const sentinel = open({ notes: 'KEEP-ME', toLocation: 'KEEP-ME-TOO' });
  const next = applyLast(setTransferModal, sentinel);
  expect(next.notes).toBe('KEEP-ME');
  expect(next.toLocation).toBe('KEEP-ME-TOO');
  expect(Object.keys(next).sort()).toEqual(Object.keys(sentinel).sort());
});

test('cancel closes without transferring anything', () => {
  const { setTransferModal } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(transfer).not.toHaveBeenCalled();
  const next = applyLast(setTransferModal, open({ reference: 'KEEP-ME' }));
  expect(next.open).toBe(false);
  expect(next.reference).toBe('KEEP-ME');
});

/**
 * The count sheet.
 *
 * A stocktake is the bluntest write in the system: it sets stock to whatever
 * was typed, for every line at once. Three things carry the weight.
 *
 * The branch, first. `api.inventory.stocktake` carries a comment saying a count
 * also claims stock that has no branch yet — so a Melbourne count that reaches
 * the server without its branch sweeps every unlocated unit in the business
 * into HQ. It is a select on this form, and these assert it travels.
 *
 * A blind count, second: the whole point is that the counter cannot see the
 * system figure, so the modal has to withhold it rather than merely style it.
 *
 * And an emptied count box, third. `parseInt('')` is NaN; the fallback turns it
 * into a real zero, which is what "we found none" has to mean.
 *
 * The API is reached with vi.spyOn on the real module rather than a partial
 * mock of it — the project rule, and the reason is that a method missing from a
 * literal renders as an empty surface that still passes.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import StocktakeModal from '../StocktakeModal';
import { inventory as inventoryApi } from '../../../api';

const ITEMS = [
  { sku: 'TEE-BLK-M', name: 'Heavy Tee — Black', currentStock: 40, countedQty: 40, notes: '' },
  { sku: 'CAP-NVY', name: 'Structured Cap — Navy', currentStock: 12, countedQty: 12, notes: '' },
];

const open = (over = {}) => ({
  open: true,
  method: 'Informed',
  branch: 'Melbourne',
  reference: '',
  items: ITEMS,
  loading: false,
  error: '',
  results: null,
  ...over,
});

let stocktake;
beforeEach(() => {
  stocktake = vi.spyOn(inventoryApi, 'stocktake').mockResolvedValue({
    reference: 'ST-2026-014',
    results: [],
  });
});
afterEach(() => vi.restoreAllMocks());

const setup = (state = {}) => {
  const props = { stocktakeModal: open(state), setStocktakeModal: vi.fn() };
  const view = renderWithQuery(<StocktakeModal {...props} />);
  return { ...props, ...view };
};

const cellText = () => screen.getAllByRole('cell').map(c => c.textContent);
const countBoxes = () => screen.getAllByRole('spinbutton');
const applyLast = (setter, sentinel) => {
  const arg = setter.mock.calls.at(-1)[0];
  return typeof arg === 'function' ? arg(sentinel) : arg;
};

test('renders nothing while closed', () => {
  const { container } = setup({ open: false });
  expect(container).toBeEmptyDOMElement();
});

test('lists every line to be counted against its system figure', () => {
  setup();
  expect(screen.getByRole('heading', { name: 'Stocktake' })).toBeInTheDocument();
  expect(cellText()).toEqual([
    'TEE-BLK-M', 'Heavy Tee — Black', '40', '',
    'CAP-NVY', 'Structured Cap — Navy', '12', '',
  ]);
  // A number input reports a number, so the count boxes are compared as such.
  expect(countBoxes().map(i => i.value)).toEqual(['40', '12']);
  expect(countBoxes()[0]).toHaveValue(40);
});

test('a blind count withholds the system figure entirely', () => {
  // Not greyed, not styled out — absent. A counter who can read the expected
  // number is not counting blind.
  setup({ method: 'Blind' });
  const cells = cellText();
  expect(cells).toEqual([
    'TEE-BLK-M', 'Heavy Tee — Black', '—', '',
    'CAP-NVY', 'Structured Cap — Navy', '—', '',
  ]);
  expect(cells).not.toContain('40');
});

test('says out loud that counting a branch claims unlocated stock', () => {
  setup();
  expect(screen.getByText(/claims any stock that has no branch yet/i)).toBeInTheDocument();
});

test('committing sends the counts, the method and the branch counted', async () => {
  const { client } = setup({ branch: 'Melbourne', reference: 'ST-MEL-08' });
  const invalidate = vi.spyOn(client, 'invalidateQueries');

  fireEvent.click(screen.getByRole('button', { name: /commit stocktake/i }));

  await waitFor(() => expect(stocktake).toHaveBeenCalledTimes(1));
  // Branch last, and it is the argument that decides which units get claimed.
  expect(stocktake).toHaveBeenCalledWith(ITEMS, 'ST-MEL-08', 'Informed', 'Melbourne');

  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory'] }));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['stockMovements'] });
});

test('a blind count is committed as blind', async () => {
  setup({ method: 'Blind' });
  fireEvent.click(screen.getByRole('button', { name: /commit stocktake/i }));
  await waitFor(() => expect(stocktake).toHaveBeenCalledTimes(1));
  expect(stocktake.mock.calls[0][2]).toBe('Blind');
});

test('a commit in flight says so and cannot be sent twice', () => {
  setup({ loading: true });
  const button = screen.getByRole('button', { name: /saving/i });
  expect(button).toBeDisabled();
  expect(screen.queryByRole('button', { name: /commit stocktake/i })).not.toBeInTheDocument();
});

test('the results land in state with the reference the server gave back', async () => {
  const payload = {
    reference: 'ST-2026-014',
    results: [{ sku: 'TEE-BLK-M', previous: 40, counted: 43, variance: 3 }],
  };
  stocktake.mockResolvedValue(payload);
  const { setStocktakeModal } = setup();

  fireEvent.click(screen.getByRole('button', { name: /commit stocktake/i }));

  await waitFor(() => expect(setStocktakeModal).toHaveBeenCalledTimes(2));
  const next = applyLast(setStocktakeModal, open({ reference: 'KEEP-ME' }));
  expect(next.results).toEqual(payload);
  expect(next.loading).toBe(false);
  expect(next.reference).toBe('KEEP-ME');
});

test('a rejected commit shows why and keeps the sheet up', async () => {
  stocktake.mockRejectedValue(new Error('Branch Melbourne is locked'));
  const { setStocktakeModal } = setup();

  fireEvent.click(screen.getByRole('button', { name: /commit stocktake/i }));

  await waitFor(() => expect(setStocktakeModal).toHaveBeenCalledTimes(2));
  const next = applyLast(setStocktakeModal, open());
  expect(next.error).toBe('Branch Melbourne is locked');
  expect(next.loading).toBe(false);
  // No results means the sheet stays: the counts are still on screen to retry.
  expect(next.results).toBe(null);
  expect(next.open).toBe(true);
});

test('an error already in state is displayed', () => {
  setup({ error: 'Branch Melbourne is locked' });
  expect(screen.getByText('Branch Melbourne is locked')).toBeInTheDocument();
});

test('typing a count changes that line and no other', () => {
  const { setStocktakeModal } = setup();
  fireEvent.change(countBoxes()[0], { target: { value: '37' } });

  // Unlike this modal's other handlers, updateCount reads e.target.value while
  // the event is live and closes over the resulting string, so the counted
  // figure is genuinely readable here rather than a stale DOM read.
  const next = applyLast(setStocktakeModal, open({ reference: 'KEEP-ME' }));
  expect(next.items).toEqual([
    { sku: 'TEE-BLK-M', name: 'Heavy Tee — Black', currentStock: 40, countedQty: 37, notes: '' },
    { sku: 'CAP-NVY', name: 'Structured Cap — Navy', currentStock: 12, countedQty: 12, notes: '' },
  ]);
  expect(next.reference).toBe('KEEP-ME');
});

test('an emptied count box counts as zero, not as NaN', () => {
  // NaN would serialise to null and the line would be skipped — "none found"
  // has to survive the trip.
  const { setStocktakeModal } = setup();
  fireEvent.change(countBoxes()[1], { target: { value: '' } });

  const next = applyLast(setStocktakeModal, open());
  expect(next.items[1].countedQty).toBe(0);
  expect(next.items[0].countedQty).toBe(40);
});

test('the reference travels with the rest of the sheet intact', () => {
  const { setStocktakeModal } = setup();
  fireEvent.change(screen.getByPlaceholderText('auto-generated if blank'), {
    target: { value: 'ST-MEL-08' },
  });

  const sentinel = open({ branch: 'KEEP-ME', method: 'KEEP-ME-TOO' });
  const next = applyLast(setStocktakeModal, sentinel);
  expect(next.branch).toBe('KEEP-ME');
  expect(next.method).toBe('KEEP-ME-TOO');
  expect(next.items).toBe(ITEMS);
  expect(Object.keys(next).sort()).toEqual(Object.keys(sentinel).sort());
});

test('the results view replaces the sheet and reports each variance signed', () => {
  setup({
    results: {
      reference: 'ST-2026-014',
      results: [
        { sku: 'TEE-BLK-M', previous: 40, counted: 43, variance: 3 },
        { sku: 'CAP-NVY', previous: 12, counted: 10, variance: -2 },
        { sku: 'HOOD-GRY', previous: 8, counted: 8, variance: 0 },
      ],
    },
  });

  expect(screen.getByText('Stocktake complete — ST-2026-014')).toBeInTheDocument();
  expect(cellText()).toEqual([
    'TEE-BLK-M', '40', '43', '+3',
    'CAP-NVY', '12', '10', '-2',
    'HOOD-GRY', '8', '8', '0',
  ]);
  // The count sheet is gone, so nothing can be committed twice.
  expect(screen.queryByRole('button', { name: /commit stocktake/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
});

test('closing the results keeps everything but the open flag', () => {
  const { setStocktakeModal } = setup({
    results: { reference: 'ST-2026-014', results: [] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));

  const next = applyLast(setStocktakeModal, open({ branch: 'KEEP-ME' }));
  expect(next.open).toBe(false);
  expect(next.branch).toBe('KEEP-ME');
});

test('cancel closes without committing anything', () => {
  const { setStocktakeModal } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(stocktake).not.toHaveBeenCalled();
  expect(applyLast(setStocktakeModal, open()).open).toBe(false);
});

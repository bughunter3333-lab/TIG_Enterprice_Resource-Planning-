/**
 * The read-only movement ledger.
 *
 * It writes nothing, which makes it the one surface an operator uses to answer
 * "where did those units go" — so what it has to get right is that a movement
 * reads with its direction attached and that the search never hides a line the
 * user asked for. A row rendered without its sign is a receipt and an issue
 * that look identical.
 *
 * The data arrives already fetched, as a prop, so nothing here is mocked: the
 * component is a pure function of the state the monolith hands it, and these
 * drive it through loading, populated, filtered and empty.
 */
import { screen, fireEvent } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import StockFlowModal from '../StockFlowModal';

const TEE = {
  sku: 'TEE-BLK-M',
  name: 'Heavy Tee — Black',
  location: 'A-12-3',
  stock: 4,
  min_stock: 10,
  unit_cost: 6.4,
  sell_price: 18,
  movements: [
    { id: 1, date: '2026-08-01', type: 'Receipt', quantity: 12, reference: 'PO-3001', notes: 'Bulk intake' },
    { id: 2, date: '2026-08-03', type: 'Sale', quantity: -3, reference: '', notes: '' },
  ],
};

const CAP = {
  sku: 'CAP-NVY',
  name: 'Structured Cap — Navy',
  location: '',
  stock: 12,
  min_stock: 5,
  unit_cost: 3.25,
  sell_price: 9.5,
  movements: [],
};

const open = (over = {}) => ({
  open: true,
  loading: false,
  data: [TEE, CAP],
  search: '',
  ...over,
});

const setup = (state = {}) => {
  const props = { stockFlowModal: open(state), setStockFlowModal: vi.fn() };
  const view = renderWithQuery(<StockFlowModal {...props} />);
  return { ...props, ...view };
};

const applyLast = (setter, sentinel) => {
  const arg = setter.mock.calls.at(-1)[0];
  return typeof arg === 'function' ? arg(sentinel) : arg;
};

test('renders nothing while closed', () => {
  const { container } = setup({ open: false });
  expect(container).toBeEmptyDOMElement();
});

test('says it is loading instead of showing an empty ledger', () => {
  // data is null until the fetch lands. Rendering "No items match." there would
  // read as "this item has never moved", which is a different answer.
  setup({ loading: true, data: null });
  expect(screen.getByText('Loading stock flow data...')).toBeInTheDocument();
  expect(screen.queryByText('No items match.')).not.toBeInTheDocument();
  expect(screen.queryByText('TEE-BLK-M')).not.toBeInTheDocument();
});

test('heads an item with its holding, its floor and its prices', () => {
  // One item only: every card carries a "Stock:" span, so this reads the
  // figures of a known row rather than of whichever card came first.
  setup({ data: [TEE] });
  expect(screen.getByRole('heading', { name: 'Stock Flow' })).toBeInTheDocument();
  expect(screen.getByText('TEE-BLK-M')).toBeInTheDocument();
  expect(screen.getByText('Heavy Tee — Black')).toBeInTheDocument();
  expect(screen.getByText('@ A-12-3')).toBeInTheDocument();
  // "Stock:" holds its figure in a nested span, so it is asserted whole.
  expect(screen.getByText(/^Stock:$/)).toHaveTextContent('Stock: 4');
  expect(screen.getByText('Min: 10')).toBeInTheDocument();
  expect(screen.getByText('Cost: $6.40')).toBeInTheDocument();
  expect(screen.getByText('Price: $18.00')).toBeInTheDocument();
});

test('an item with no bin does not print a stray "@"', () => {
  setup({ data: [CAP] });
  expect(screen.getByText('CAP-NVY')).toBeInTheDocument();
  expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
});

test('every movement reads with its direction attached', () => {
  setup({ data: [TEE] });
  expect(screen.getByText('2026-08-01')).toBeInTheDocument();
  expect(screen.getByText('Receipt')).toBeInTheDocument();
  expect(screen.getByText('Sale')).toBeInTheDocument();
  // A receipt is signed, an issue keeps its minus. Without the sign the two
  // rows are the same row.
  expect(screen.getByText('+12')).toBeInTheDocument();
  expect(screen.getByText('-3')).toBeInTheDocument();
  expect(screen.getByText('PO-3001')).toBeInTheDocument();
  expect(screen.getByText('Bulk intake')).toBeInTheDocument();
  // A movement with no reference shows a dash rather than a gap.
  expect(screen.getByText('—')).toBeInTheDocument();
});

test('an item that has never moved says so', () => {
  setup({ data: [CAP] });
  expect(screen.getByText('No movement history')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('a search matches on SKU, ignoring case', () => {
  setup({ search: 'blk' });
  expect(screen.getByText('TEE-BLK-M')).toBeInTheDocument();
  expect(screen.queryByText('CAP-NVY')).not.toBeInTheDocument();
});

test('a search matches on name too', () => {
  // 'structured' appears in the name only, so this fails if the name half of
  // the filter is dropped.
  setup({ search: 'Structured' });
  expect(screen.getByText('CAP-NVY')).toBeInTheDocument();
  expect(screen.queryByText('TEE-BLK-M')).not.toBeInTheDocument();
});

test('a search that matches nothing says nothing matched', () => {
  setup({ search: 'zzz' });
  expect(screen.getByText('No items match.')).toBeInTheDocument();
  expect(screen.queryByText('TEE-BLK-M')).not.toBeInTheDocument();
});

test('an empty search hides nothing', () => {
  setup({ search: '' });
  expect(screen.getByText('TEE-BLK-M')).toBeInTheDocument();
  expect(screen.getByText('CAP-NVY')).toBeInTheDocument();
});

test('typing in the search box keeps the fetched data', () => {
  const { setStockFlowModal } = setup();
  fireEvent.change(screen.getByPlaceholderText('Search SKU or name...'), {
    target: { value: 'blk' },
  });

  // The typed text is not read back: the updater closes over the live input,
  // which React has already reset to its prop value. What is asserted is the
  // spread — drop it and searching throws away the rows being searched.
  const next = applyLast(setStockFlowModal, open({ data: [TEE] }));
  expect(next.data).toEqual([TEE]);
  expect(next.open).toBe(true);
  expect(next.loading).toBe(false);
});

test('closing keeps everything but the open flag', () => {
  // The only button on this surface is the header X, which carries an icon and
  // no accessible name.
  const { setStockFlowModal } = setup();
  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(1);
  fireEvent.click(buttons[0]);

  const sentinel = open({ search: 'KEEP-ME' });
  const next = applyLast(setStockFlowModal, sentinel);
  expect(next.open).toBe(false);
  expect(next.search).toBe('KEEP-ME');
  expect(Object.keys(next).sort()).toEqual(Object.keys(sentinel).sort());
});

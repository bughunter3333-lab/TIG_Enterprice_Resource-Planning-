/**
 * The manual stock adjustment dialog.
 *
 * It is the one place an operator can move `InventoryItem.stock` by hand, so
 * the two things worth pinning are the arithmetic it shows before the write and
 * the arguments it hands to `adjustStock`. The preview is not cosmetic: it is
 * the only confirmation of what the ledger is about to record, and it clamps at
 * zero, so a -50 against 40 units writes -50 while the operator was shown 0.
 * That clamp is asserted here rather than assumed.
 *
 * The reason string is also load-bearing — it is what the movement row carries
 * — and a blank one falls back to 'Manual adjustment' instead of writing an
 * empty reason onto the ledger.
 *
 * Labels in this modal are bare <label> elements with no htmlFor, so the
 * controls are reached by role (number vs text) rather than by label text.
 */
import { screen, fireEvent } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import StockAdjustModal from '../StockAdjustModal';

const RESET = { show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' };

const open = (over = {}) => ({
  show: true,
  sku: 'TEE-BLK-M',
  name: 'Heavy Tee — Black',
  currentStock: 40,
  adjustment: '',
  reason: '',
  ...over,
});

const setup = (state = {}) => {
  const props = {
    stockAdjustModal: open(state),
    adjustStock: vi.fn(),
    setStockAdjustModal: vi.fn(),
  };
  const view = renderWithQuery(<StockAdjustModal {...props} />);
  return { ...props, ...view };
};

// The preview line reads "Current: 40 → New: 45", with the new figure in its
// own span. Matched on the element's own text, then asserted whole.
const preview = () => screen.getByText(/^Current: \d+ → New:$/);

const amountField = () => screen.getByRole('spinbutton');
const reasonField = () => screen.getByRole('textbox');

test('renders nothing while closed', () => {
  const { container } = setup({ show: false });
  expect(container).toBeEmptyDOMElement();
});

test('names the item being adjusted', () => {
  setup();
  expect(screen.getByRole('heading', { name: 'Adjust Stock' })).toBeInTheDocument();
  expect(screen.getByText('Heavy Tee — Black')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /apply adjustment/i })).toBeInTheDocument();
});

test('previews what the adjustment will leave on hand', () => {
  setup({ adjustment: '5' });
  expect(preview()).toHaveTextContent('Current: 40 → New: 45');
});

test('a removal previews the lower figure', () => {
  setup({ adjustment: '-7' });
  expect(preview()).toHaveTextContent('Current: 40 → New: 33');
});

test('the preview floors at zero rather than showing negative stock', () => {
  // The component clamps with Math.max(0, ...). What it does NOT clamp is the
  // adjustment it sends — see the next test — so the two are pinned separately.
  setup({ currentStock: 3, adjustment: '-10' });
  expect(preview()).toHaveTextContent('Current: 3 → New: 0');
});

test('an oversized removal is still sent whole', () => {
  // Worth stating out loud: the preview says 0, the write says -10. The clamp
  // is display only. If the backend ever stops rejecting this, the operator has
  // been shown a number the ledger never used.
  const { adjustStock } = setup({ currentStock: 3, adjustment: '-10', reason: 'Damaged in transit' });
  fireEvent.click(screen.getByRole('button', { name: /apply adjustment/i }));
  expect(adjustStock).toHaveBeenCalledWith('TEE-BLK-M', -10, 'Damaged in transit');
});

test('applying an adjustment writes it and closes', () => {
  const { adjustStock, setStockAdjustModal } = setup({ adjustment: '5', reason: 'Stocktake' });
  fireEvent.click(screen.getByRole('button', { name: /apply adjustment/i }));
  expect(adjustStock).toHaveBeenCalledWith('TEE-BLK-M', 5, 'Stocktake');
  expect(setStockAdjustModal).toHaveBeenCalledWith(RESET);
});

test('a blank reason still reaches the ledger as something', () => {
  // The movement row carries this string; an empty one is a ledger entry that
  // explains nothing.
  const { adjustStock } = setup({ adjustment: '5', reason: '' });
  fireEvent.click(screen.getByRole('button', { name: /apply adjustment/i }));
  expect(adjustStock).toHaveBeenCalledWith('TEE-BLK-M', 5, 'Manual adjustment');
});

test('an adjustment of zero cannot be applied', () => {
  const { adjustStock } = setup({ adjustment: '0' });
  const apply = screen.getByRole('button', { name: /apply adjustment/i });
  expect(apply).toBeDisabled();
  fireEvent.click(apply);
  expect(adjustStock).not.toHaveBeenCalled();
});

test('an empty adjustment cannot be applied either', () => {
  const { adjustStock } = setup({ adjustment: '' });
  expect(screen.getByRole('button', { name: /apply adjustment/i })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /apply adjustment/i }));
  expect(adjustStock).not.toHaveBeenCalled();
});

test('cancel closes without writing anything', () => {
  const { adjustStock, setStockAdjustModal } = setup({ adjustment: '5', reason: 'Stocktake' });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(adjustStock).not.toHaveBeenCalled();
  expect(setStockAdjustModal).toHaveBeenCalledWith(RESET);
});

test('the header close button clears the draft too', () => {
  // The X carries an icon and no accessible name, so it is taken positionally:
  // it is the first button in the card, ahead of Cancel and Apply.
  const { setStockAdjustModal } = setup({ adjustment: '5' });
  fireEvent.click(screen.getAllByRole('button')[0]);
  expect(setStockAdjustModal).toHaveBeenCalledWith(RESET);
});

test('typing an amount keeps the rest of the draft', () => {
  // This handler builds its object during the event rather than passing an
  // updater, so the typed value is readable here — unlike the sibling modals.
  const { setStockAdjustModal } = setup({ adjustment: '', reason: 'Damaged in transit' });
  fireEvent.change(amountField(), { target: { value: '12' } });
  expect(setStockAdjustModal).toHaveBeenCalledWith({
    ...open({ reason: 'Damaged in transit' }),
    adjustment: '12',
  });
});

test('typing a reason keeps the amount', () => {
  const { setStockAdjustModal } = setup({ adjustment: '12' });
  fireEvent.change(reasonField(), { target: { value: 'Damaged in transit' } });
  expect(setStockAdjustModal).toHaveBeenCalledWith({
    ...open({ adjustment: '12' }),
    reason: 'Damaged in transit',
  });
});

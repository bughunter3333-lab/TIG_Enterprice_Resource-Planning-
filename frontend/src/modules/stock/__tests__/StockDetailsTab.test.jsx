/**
 * The Details tab shows the weight per unit and, where the role may edit the
 * item, saves it with the item (F08): an order is weighed from it, and the
 * Stock module was the one place it could not be seen or changed.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { inventory, users } from '../../../api';
import StockDetailsTab from '../tabs/StockDetailsTab';

vi.mock('../../../api', () => ({
  inventory: { update: vi.fn() },
  users: { myAccess: vi.fn() },
}));

const EDITOR = { role: 'staff', areas: [], allowed: ['PATCH /inventory/{sku}'] };
const READER = { role: 'overseas_staff', areas: [], allowed: [] };
const item = { sku: 'POLO-M', name: 'Polo', stock: 5, committed_qty: 0, weight_kg: 0.25 };

beforeEach(() => {
  vi.clearAllMocks();
  inventory.update.mockResolvedValue({ ...item, weight_kg: 0.3 });
});

test('the weight per unit is saved with the item', async () => {
  users.myAccess.mockResolvedValue(EDITOR);
  renderWithQuery(<StockDetailsTab item={item} />);
  const input = await screen.findByLabelText('Weight per unit (kg)');
  expect(input.value).toBe('0.25');
  expect(screen.getByRole('button', { name: 'Save weight' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '0.3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save weight' }));
  await waitFor(() => expect(inventory.update).toHaveBeenCalledWith('POLO-M', { weight_kg: 0.3 }));
});

test('a weight that is not a number of kg or more is not sent', async () => {
  users.myAccess.mockResolvedValue(EDITOR);
  renderWithQuery(<StockDetailsTab item={item} />);
  fireEvent.change(await screen.findByLabelText('Weight per unit (kg)'), { target: { value: '-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save weight' }));
  expect(await screen.findByText('A weight of 0 kg or more.')).toBeInTheDocument();
  expect(inventory.update).not.toHaveBeenCalled();
});

test('a role that cannot edit the item reads the weight only', async () => {
  users.myAccess.mockResolvedValue(READER);
  renderWithQuery(<StockDetailsTab item={item} />);
  expect(await screen.findByText('0.25 kg')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save weight' })).not.toBeInTheDocument();
});

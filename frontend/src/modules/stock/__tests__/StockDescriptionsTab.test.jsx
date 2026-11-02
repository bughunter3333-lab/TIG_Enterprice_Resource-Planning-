import {  screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import StockDescriptionsTab from '../tabs/StockDescriptionsTab';

const update = vi.fn().mockResolvedValue({});
vi.mock('../../../api', () => ({ inventory: { update: (...a) => update(...a) } }));

const wrap = renderWithQuery;

const item = { sku: 'CAP-1', desc_extended: 'orig', desc_web: '', desc_care: '' };

beforeEach(() => update.mockClear());

// The mock once offered a stock.update that the real api.js never had, so the
// test passed while Save failed in the app. The method mocked must exist.
test('saves through a method the real api has', async () => {
  const real = await vi.importActual('../../../api');
  expect(typeof real.inventory.update).toBe('function');
});

test('seeds textareas from the item and disables Save until edited', () => {
  wrap(<StockDescriptionsTab item={item} />);
  expect(screen.getByPlaceholderText(/extended description/i).value).toBe('orig');
  expect(screen.getByText(/Save Descriptions/).closest('button')).toBeDisabled();
});

test('editing enables Save and PATCHes only the three description fields', async () => {
  wrap(<StockDescriptionsTab item={item} />);
  fireEvent.change(screen.getByPlaceholderText(/extended description/i), { target: { value: 'new copy' } });
  const btn = screen.getByText(/Save Descriptions/).closest('button');
  expect(btn).not.toBeDisabled();
  fireEvent.click(btn);
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  expect(update).toHaveBeenCalledWith('CAP-1', {
    desc_extended: 'new copy',
    desc_web: '',
    desc_care: '',
  });
  await screen.findByText('Saved');
});

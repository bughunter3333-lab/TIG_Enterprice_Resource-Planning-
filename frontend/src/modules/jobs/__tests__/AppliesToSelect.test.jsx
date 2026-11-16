/**
 * The line editor's "Applies to" choice (F02, F19): the job's other goods
 * lines, and the choice handed back as the target line's reference.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import AppliesToSelect from '../AppliesToSelect';

const items = [
  { id: 11, displayType: 'product', stockCode: 'POLO-M', description: 'Polo' },
  { id: 12, displayType: 'product', stockCode: 'EMB.CFG.LHC', logoId: 4 },
  { lineKey: 'n2', displayType: 'product', description: 'Hem shorten' },
];

test('offers the job\'s goods lines and hands back the one chosen', () => {
  const onChange = vi.fn();
  render(<AppliesToSelect items={items} idx={2} onChange={onChange} />);
  const select = screen.getByLabelText('Line 3 applies to');
  expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['— none —', 'Line 1 · POLO-M · Polo']);
  fireEvent.change(select, { target: { value: 'id:11' } });
  expect(onChange).toHaveBeenCalledWith('id:11');
});

test('shows the link the server holds on a saved line', () => {
  render(<AppliesToSelect items={[items[0], { ...items[2], id: 13, appliesToItemId: 11 }]} idx={1} onChange={vi.fn()} />);
  expect(screen.getByLabelText('Line 2 applies to').value).toBe('id:11');
});

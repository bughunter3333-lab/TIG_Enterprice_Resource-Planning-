/**
 * The PO status control (F17, F29): a person sets Draft, Sent or Cancelled.
 * Partial and Received are what the lines say has arrived, so they are shown,
 * never chosen — choosing Received by hand hid the receive controls with
 * stock still outstanding.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import POStatusSelect from '../POStatusSelect';

const optionsOf = () => screen.getAllByRole('option').map((o) => o.textContent);

test('an open PO offers Draft, Sent and Cancelled, and nothing derived', () => {
  const onChange = vi.fn();
  renderWithQuery(<POStatusSelect status="Sent" onChange={onChange} />);
  expect(optionsOf()).toEqual(['Draft', 'Sent', 'Cancelled']);
  fireEvent.change(screen.getByLabelText('PO status'), { target: { value: 'Cancelled' } });
  expect(onChange).toHaveBeenCalledWith('Cancelled');
});

test('a Received PO shows its status and cannot be set by hand', () => {
  renderWithQuery(<POStatusSelect status="Received" onChange={() => {}} />);
  const select = screen.getByLabelText('PO status');
  expect(select).toHaveValue('Received');
  expect(select).toBeDisabled();
  expect(optionsOf()).toEqual(['Received']);
});

test('a Partial PO can be closed short: the rest is not coming (F25)', () => {
  // A short-shipped PO could be neither cancelled (goods arrived) nor set
  // Received, so it stayed Partial and its unbilled spend never went away.
  const onChange = vi.fn();
  renderWithQuery(<POStatusSelect status="Partial" onChange={onChange} />);
  const select = screen.getByLabelText('PO status');
  expect(select).toHaveValue('Partial');
  expect(select).toBeEnabled();
  expect(optionsOf()).toEqual(['Partial', 'Close short (Received)']);
  fireEvent.change(select, { target: { value: 'Received' } });
  expect(onChange).toHaveBeenCalledWith('Received');
});

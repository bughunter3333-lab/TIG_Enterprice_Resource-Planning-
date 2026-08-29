/**
 * The destructive-confirm dialog. Both buttons matter: Cancel has to clear the
 * whole state shape (a stale `onConfirm` left behind would fire against the
 * next thing the user tries to delete), and Delete has to call the callback it
 * was handed rather than a copy taken at some earlier render.
 */
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@testing-library/react';
import ConfirmModal from '../ConfirmModal';

const open = (over = {}) => ({ show: true, message: 'Delete 3 selected jobs?', onConfirm: vi.fn(), ...over });

test('renders nothing while closed', () => {
  const { container } = render(<ConfirmModal confirmModal={open({ show: false })} setConfirmModal={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});

test('shows the message it was given', () => {
  render(<ConfirmModal confirmModal={open()} setConfirmModal={vi.fn()} />);
  expect(screen.getByText('Delete 3 selected jobs?')).toBeInTheDocument();
});

test('cancel clears the callback as well as the flag', () => {
  const setConfirmModal = vi.fn();
  render(<ConfirmModal confirmModal={open()} setConfirmModal={setConfirmModal} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(setConfirmModal).toHaveBeenCalledWith({ show: false, message: '', onConfirm: null });
});

test('delete invokes the confirm callback', () => {
  const state = open();
  render(<ConfirmModal confirmModal={state} setConfirmModal={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(state.onConfirm).toHaveBeenCalledTimes(1);
});

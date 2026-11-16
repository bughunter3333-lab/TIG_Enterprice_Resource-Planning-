/**
 * Choosing your own password after signing in with one an admin gave: what is
 * refused before anything is sent, what the server's refusal looks like, and
 * that a good choice signs the person on into the app.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { auth } from '../../../api';
import ChoosePasswordScreen from '../ChoosePasswordScreen';

vi.mock('../../../api', () => ({
  auth: { changePassword: vi.fn(), me: vi.fn() },
}));

const JO = { id: 2, username: 'j.smith', full_name: 'Jo Smith', role: 'staff', must_change_password: true };

let onDone;
let onLogout;
beforeEach(() => {
  vi.clearAllMocks();
  onDone = vi.fn();
  onLogout = vi.fn();
  render(<ChoosePasswordScreen user={JO} onDone={onDone} onLogout={onLogout} />);
});

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fill = (given, chosen, again = chosen) => {
  type('The password you were given', given);
  type('Your new password', chosen);
  type('The new password again', again);
};
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

test('says why it is asked, by name', () => {
  expect(screen.getByRole('heading', { name: 'Choose your own password' })).toBeInTheDocument();
  expect(screen.getByText(/Jo Smith, you signed in with a password someone gave you/)).toBeInTheDocument();
});

test('a password that would not count, the same one again, or two that differ are refused before anything is sent', () => {
  fill('Given2them', 'short');
  submit();
  expect(screen.getByText('It needs at least 8 characters, an uppercase letter, a digit.')).toBeInTheDocument();
  expect(screen.getByLabelText('Your new password')).toHaveAttribute('aria-invalid', 'true');

  fill('Given2them', 'Given2them');
  expect(screen.getByText('It has to be different from the one you were given.')).toBeInTheDocument();

  fill('Given2them', 'MyOwn2pass', 'MyOwn2pas');
  expect(screen.getByText('The two new passwords are not the same.')).toBeInTheDocument();
  expect(auth.changePassword).not.toHaveBeenCalled();
});

test('a good choice is saved and the person goes on in, as the server now has them', async () => {
  auth.changePassword.mockResolvedValue({ message: 'Password updated' });
  auth.me.mockResolvedValue({ ...JO, must_change_password: false });
  fill('Given2them', 'MyOwn2pass');
  submit();
  await waitFor(() => expect(onDone).toHaveBeenCalledWith({ ...JO, must_change_password: false }));
  expect(auth.changePassword).toHaveBeenCalledWith('Given2them', 'MyOwn2pass');
});

test('a change that went through is not reported as failed when reading the account back does not', async () => {
  // Retrying would send the given password again, which no longer works.
  auth.changePassword.mockResolvedValue({ message: 'Password updated' });
  auth.me.mockRejectedValue(new Error("Can't reach the server — it may be down or restarting."));
  fill('Given2them', 'MyOwn2pass');
  submit();
  await waitFor(() => expect(onDone).toHaveBeenCalledWith({ ...JO, must_change_password: false }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a refused save puts the cursor on the first field to fix, which says why', () => {
  fill('Given2them', 'short', 'short');
  submit();
  const chosen = screen.getByLabelText('Your new password');
  expect(chosen).toHaveFocus();
  expect(chosen).toHaveAccessibleDescription(/It needs at least 8 characters/);
});

test('the rules for a password are read with the field, before anything is wrong', () => {
  expect(screen.getByLabelText('Your new password')).toHaveAccessibleDescription('At least 8 characters, with an uppercase letter and a digit.');
});

test('a password manager is told whose password this is', () => {
  const username = document.querySelector('input[autocomplete="username"]');
  expect(username).toHaveValue('j.smith');
});

test('the server refusing is shown, and they can try again', async () => {
  auth.changePassword.mockRejectedValue(new Error('Current password incorrect'));
  fill('Wrong1pass', 'MyOwn2pass');
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent('Current password incorrect');
  expect(onDone).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save and continue' })).toBeEnabled();
});

test('they can sign out instead', () => {
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(onLogout).toHaveBeenCalled();
});

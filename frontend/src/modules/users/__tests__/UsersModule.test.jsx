/**
 * Users and roles, as an admin uses the screen: who is listed and how, adding
 * an account, changing a role, resetting a password, switching an account off
 * and deleting one — and that none of it is offered to anyone who is not an
 * admin, or against the admin's own access.
 */
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { users } from '../../../api';
import { subscribe } from '../../../lib/notify';
import UsersModule from '../UsersModule';

vi.mock('../../../api', () => ({
  users: { list: vi.fn(), access: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), resetPassword: vi.fn() },
}));

const ME = { id: 1, username: 'Emon117', full_name: 'Emon Miah', email: 'emon@tig.com.au', role: 'admin', is_active: true, totp_enabled: true, last_login: '2026-10-12T01:30:00+00:00' };
const JO = { id: 2, username: 'j.smith', full_name: 'Jo Smith', email: 'jo@tig.com.au', role: 'staff', is_active: true, totp_enabled: false, last_login: null };
const OLD = { id: 3, username: 'old_hand', full_name: 'Old Hand', email: 'old@tig.com.au', role: 'manager', is_active: false, totp_enabled: true, last_login: null };

const cells = (admin, manager, staff, overseas) => ({ admin, manager, staff, overseas_staff: overseas });
const ACCESS = {
  roles: ['admin', 'manager', 'staff', 'overseas_staff'],
  areas: [
    { area: 'Stock', view: cells([20, 20], [20, 20], [20, 20], [20, 20]), change: cells([21, 21], [21, 21], [15, 21], [0, 21]) },
    { area: 'Reports', view: cells([20, 20], [20, 20], [20, 20], [20, 20]), change: cells([0, 0], [0, 0], [0, 0], [0, 0]) },
    { area: 'Users and roles', view: cells([3, 3], [1, 3], [1, 3], [1, 3]), change: cells([4, 4], [0, 4], [0, 4], [0, 4]) },
  ],
};

let toasts;
let stop;
beforeEach(() => {
  vi.clearAllMocks();
  users.list.mockResolvedValue([ME, JO, OLD]);
  users.access.mockResolvedValue(ACCESS);
  toasts = [];
  stop = subscribe((t) => toasts.push(t));
});
afterEach(() => stop());

const open = async (currentUser = ME, options) => {
  const rendered = renderWithQuery(<UsersModule currentUser={currentUser} />, options);
  if (currentUser.role === 'admin') await screen.findByText('Jo Smith');
  return rendered;
};
const row = (name) => within(screen.getByRole('rowheader', { name: new RegExp(name) }).closest('tr'));
const dialog = () => within(screen.getByRole('dialog'));
const type = (label, value) => fireEvent.change(dialog().getByLabelText(label), { target: { value } });

describe('who sees it', () => {
  test.each(['manager', 'staff', 'overseas_staff'])('a %s is told it is an admin’s screen, and nothing is asked of the server', async (role) => {
    await open({ ...JO, role });
    expect(screen.getByRole('note')).toHaveTextContent('Only an admin can manage users and roles.');
    expect(users.list).not.toHaveBeenCalled();
    expect(users.access).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Add user/ })).not.toBeInTheDocument();
  });
});

describe('the list', () => {
  test('shows each account with its role, status, second factor and last sign-in', async () => {
    await open();
    expect(screen.getByText('3 accounts · 2 active · 1 deactivated')).toBeInTheDocument();
    const jo = row('Jo Smith');
    expect(jo.getByText('j.smith')).toBeInTheDocument();
    expect(jo.getByText('Staff')).toBeInTheDocument();
    expect(jo.getByText('Active')).toBeInTheDocument();
    expect(jo.getByText('Off')).toBeInTheDocument();
    expect(jo.getByText('Never')).toBeInTheDocument();
    const old = row('Old Hand');
    expect(old.getByText('Manager')).toBeInTheDocument();
    expect(old.getByText('Deactivated')).toBeInTheDocument();
    expect(row('Emon Miah').getByText('(you)')).toBeInTheDocument();
    expect(row('Emon Miah').queryByText('Never')).not.toBeInTheDocument();
  });

  test('says which accounts are still on a password an admin chose', async () => {
    users.list.mockResolvedValue([ME, { ...JO, must_change_password: true }, OLD]);
    await open();
    expect(row('Jo Smith').getByText('Yet to choose a password')).toBeInTheDocument();
    expect(row('Emon Miah').queryByText('Yet to choose a password')).not.toBeInTheDocument();
  });

  test('an admin is not offered their own deactivation or deletion', async () => {
    await open();
    const mine = row('Emon Miah');
    expect(mine.getByRole('button', { name: 'Edit Emon117' })).toBeInTheDocument();
    expect(mine.getByRole('button', { name: 'Reset password for Emon117' })).toBeInTheDocument();
    expect(mine.queryByRole('button', { name: /Deactivate/ })).not.toBeInTheDocument();
    expect(mine.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    expect(row('Jo Smith').getByRole('button', { name: 'Deactivate j.smith' })).toBeInTheDocument();
    expect(row('Old Hand').getByRole('button', { name: 'Reactivate old_hand' })).toBeInTheDocument();
  });

  test('is narrowed by a search, a role and a status', async () => {
    await open();
    const listed = () => within(screen.getByRole('table', { name: 'Accounts' })).getAllByRole('rowheader').map((r) => r.textContent);
    expect(listed()).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('Find a user'), { target: { value: 'smith' } });
    expect(listed()).toEqual([expect.stringContaining('Jo Smith')]);
    fireEvent.change(screen.getByLabelText('Find a user'), { target: { value: '' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'Role' })).getByRole('button', { name: /Manager 1/ }));
    expect(listed()).toEqual([expect.stringContaining('Old Hand')]);
    fireEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Active' }));
    expect(screen.getByText('No account matches.')).toBeInTheDocument();
  });

  test('says so when the accounts cannot be loaded, and offers to try again', async () => {
    users.list.mockRejectedValueOnce(new Error('Request failed: 500'));
    renderWithQuery(<UsersModule currentUser={ME} />, { allowQueryErrors: true });
    fireEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Jo Smith')).toBeInTheDocument();
  });
});

describe('adding a user', () => {
  const fill = () => {
    type('Username', ' new.person ');
    type('Full name', 'New Person');
    type('Email', 'new@tig.com.au');
    type('First password', 'Welcome2TIG');
  };

  test('creates the account with the role chosen, says so, and shows it in the list', async () => {
    const made = { id: 4, username: 'new.person', full_name: 'New Person', email: 'new@tig.com.au', role: 'manager', is_active: true, totp_enabled: false, last_login: null };
    users.create.mockResolvedValue(made);
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Add user/ }));
    fill();
    fireEvent.change(dialog().getByLabelText('Role'), { target: { value: 'manager' } });
    users.list.mockResolvedValue([ME, JO, OLD, made]);
    fireEvent.click(dialog().getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(users.create).toHaveBeenCalledWith({
      username: 'new.person', full_name: 'New Person', email: 'new@tig.com.au', password: 'Welcome2TIG', role: 'manager',
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('New Person')).toBeInTheDocument();
    expect(toasts.at(-1)).toMatchObject({ type: 'success', message: 'Account created for New Person (new.person), as Manager' });
  });

  test('a new account is staff unless something else is chosen', async () => {
    users.create.mockResolvedValue({ ...JO, id: 9, username: 'new.person', full_name: 'New Person' });
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Add user/ }));
    fill();
    fireEvent.click(dialog().getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(users.create).toHaveBeenCalled());
    expect(users.create.mock.calls[0][0].role).toBe('staff');
  });

  test('nothing is sent until the form is right, and each field says what is wrong with it', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Add user/ }));
    // Nothing is complained about before anything is typed.
    expect(dialog().queryByText(/3 to 50 letters/)).not.toBeInTheDocument();
    fireEvent.click(dialog().getByRole('button', { name: 'Create account' }));
    expect(dialog().getByText(/^3 to 50 letters, digits, dots/)).toBeInTheDocument();
    expect(dialog().getByText('Enter their full name.')).toBeInTheDocument();
    expect(dialog().getByText(/Enter an email address/)).toBeInTheDocument();
    expect(dialog().getByText('It needs at least 8 characters, an uppercase letter, a digit.')).toBeInTheDocument();
    expect(dialog().getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(users.create).not.toHaveBeenCalled();
  });

  test('a username or address someone already has is caught before saving, whatever its case', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Add user/ }));
    fill();
    type('Username', 'EMON117');
    type('Email', 'JO@tig.com.au');
    fireEvent.click(dialog().getByRole('button', { name: 'Create account' }));
    expect(dialog().getByText('That username is taken.')).toBeInTheDocument();
    expect(dialog().getByText('j.smith already uses this address.')).toBeInTheDocument();
    expect(users.create).not.toHaveBeenCalled();
  });

  test('a refusal from the server is shown, and the form keeps what was typed', async () => {
    users.create.mockRejectedValue(Object.assign(new Error('Username already exists'), { status: 409 }));
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Add user/ }));
    fill();
    fireEvent.click(dialog().getByRole('button', { name: 'Create account' }));
    expect(await dialog().findByText("Couldn't create the account: Username already exists")).toBeInTheDocument();
    expect(dialog().getByLabelText('Full name')).toHaveValue('New Person');
  });

  test('the password can be looked at while it is typed', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Add user/ }));
    expect(dialog().getByLabelText('First password')).toHaveAttribute('type', 'password');
    fireEvent.click(dialog().getByLabelText('Show it'));
    expect(dialog().getByLabelText('First password')).toHaveAttribute('type', 'text');
  });
});

describe('changing an account', () => {
  test('a new role is the only thing sent, and it says what it is doing first', async () => {
    users.update.mockResolvedValue({ ...JO, role: 'manager' });
    await open();
    fireEvent.click(row('Jo Smith').getByRole('button', { name: 'Edit j.smith' }));
    expect(dialog().getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.change(dialog().getByLabelText('Role'), { target: { value: 'manager' } });
    expect(dialog().getByText(/Jo Smith goes from Staff to Manager\. It applies from their next request\./)).toBeInTheDocument();
    fireEvent.click(dialog().getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(users.update).toHaveBeenCalledWith(2, { role: 'manager' }));
    await waitFor(() => expect(toasts.at(-1)).toMatchObject({ type: 'success', message: 'j.smith updated, now Manager' }));
  });

  test('an admin cannot change their own role, and is told why', async () => {
    await open();
    fireEvent.click(row('Emon Miah').getByRole('button', { name: 'Edit Emon117' }));
    expect(dialog().getByLabelText('Role')).toBeDisabled();
    expect(dialog().getByText(/Your role is another admin’s to change/)).toBeInTheDocument();
    // Their name is theirs to correct.
    users.update.mockResolvedValue({ ...ME, full_name: 'Emon M' });
    type('Full name', 'Emon M');
    fireEvent.click(dialog().getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(users.update).toHaveBeenCalledWith(1, { full_name: 'Emon M' }));
  });

  test('an address another account uses cannot be saved', async () => {
    await open();
    fireEvent.click(row('Jo Smith').getByRole('button', { name: 'Edit j.smith' }));
    type('Email', 'emon@tig.com.au');
    expect(dialog().getByText('Emon117 already uses this address.')).toBeInTheDocument();
    expect(dialog().getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });
});

describe('resetting a password', () => {
  test('a password that will not do is not sent', async () => {
    await open();
    fireEvent.click(row('Jo Smith').getByRole('button', { name: 'Reset password for j.smith' }));
    type('New password', 'weak');
    fireEvent.click(dialog().getByRole('button', { name: 'Reset password' }));
    expect(dialog().getByText('It needs at least 8 characters, an uppercase letter, a digit.')).toBeInTheDocument();
    expect(users.resetPassword).not.toHaveBeenCalled();
  });

  test('resets it and leaves the second factor alone', async () => {
    users.resetPassword.mockResolvedValue({ ok: true });
    await open();
    fireEvent.click(row('Jo Smith').getByRole('button', { name: 'Reset password for j.smith' }));
    // Nothing to remove on an account without one.
    expect(dialog().queryByLabelText(/remove two-factor/)).not.toBeInTheDocument();
    type('New password', 'Another1Pass');
    fireEvent.click(dialog().getByRole('button', { name: 'Reset password' }));
    await waitFor(() => expect(users.resetPassword).toHaveBeenCalledWith(2, 'Another1Pass', false));
    await waitFor(() => expect(toasts.at(-1)).toMatchObject({ message: 'Password reset for j.smith' }));
  });

  test('removing the second factor has to be asked for', async () => {
    users.resetPassword.mockResolvedValue({ ok: true });
    await open();
    fireEvent.click(row('Old Hand').getByRole('button', { name: 'Reset password for old_hand' }));
    type('New password', 'Another1Pass');
    fireEvent.click(dialog().getByLabelText(/Also remove two-factor sign-in/));
    fireEvent.click(dialog().getByRole('button', { name: 'Reset password' }));
    await waitFor(() => expect(users.resetPassword).toHaveBeenCalledWith(3, 'Another1Pass', true));
    await waitFor(() => expect(toasts.at(-1)).toMatchObject({ message: 'Password reset for old_hand, and two-factor sign-in removed' }));
  });
});

describe('switching an account off, on, and deleting it', () => {
  test('deactivating asks first and says what it means', async () => {
    users.update.mockResolvedValue({ ...JO, is_active: false });
    await open();
    fireEvent.click(row('Jo Smith').getByRole('button', { name: 'Deactivate j.smith' }));
    expect(dialog().getByText(/Jo Smith will not be able to sign in/)).toBeInTheDocument();
    expect(users.update).not.toHaveBeenCalled();
    fireEvent.click(dialog().getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(users.update).toHaveBeenCalledWith(2, { is_active: false }));
    await waitFor(() => expect(toasts.at(-1)).toMatchObject({ message: 'j.smith deactivated' }));
  });

  test('Cancel changes nothing', async () => {
    await open();
    fireEvent.click(row('Jo Smith').getByRole('button', { name: 'Deactivate j.smith' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(users.update).not.toHaveBeenCalled();
  });

  test('a deactivated account can be reactivated', async () => {
    users.update.mockResolvedValue({ ...OLD, is_active: true });
    await open();
    fireEvent.click(row('Old Hand').getByRole('button', { name: 'Reactivate old_hand' }));
    expect(dialog().getByText('Old Hand will be able to sign in again, as Manager.')).toBeInTheDocument();
    fireEvent.click(dialog().getByRole('button', { name: 'Reactivate' }));
    await waitFor(() => expect(users.update).toHaveBeenCalledWith(3, { is_active: true }));
  });

  test('deleting asks first; an account the server will not delete says why', async () => {
    users.delete.mockRejectedValue(Object.assign(new Error('j.smith has recorded despatches, which stay on file under their name. Deactivate the account instead.'), { status: 409 }));
    await open();
    fireEvent.click(row('Jo Smith').getByRole('button', { name: 'Delete j.smith' }));
    expect(dialog().getByText(/cannot be undone/)).toBeInTheDocument();
    fireEvent.click(dialog().getByRole('button', { name: 'Delete account' }));
    await waitFor(() => expect(users.delete).toHaveBeenCalledWith(2));
    expect(await dialog().findByText(/Couldn't delete the account: j\.smith has recorded despatches/)).toBeInTheDocument();
  });

  test('closing a dialog puts the keyboard back on the button that opened it', async () => {
    await open();
    const edit = row('Jo Smith').getByRole('button', { name: 'Edit j.smith' });
    fireEvent.click(edit);
    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(edit).toHaveFocus());
  });
});

describe('what each role can do', () => {
  test('is the server’s own count, in words', async () => {
    await open();
    const table = within(await screen.findByRole('region', { name: 'What each role can do' }));
    const stock = within(table.getByRole('rowheader', { name: 'Stock' }).closest('tr')).getAllByRole('cell');
    expect(stock.map((c) => c.textContent)).toEqual(['View allChange all', 'View allChange all', 'View allChange 15 of 21', 'View allNo changes']);
    const accounts = within(table.getByRole('rowheader', { name: 'Users and roles' }).closest('tr')).getAllByRole('cell');
    expect(accounts[0]).toHaveTextContent('View allChange all');
    expect(accounts[1]).toHaveTextContent('View 1 of 3No changes');
    // An area with nothing to change says nothing about changing.
    const reports = within(table.getByRole('rowheader', { name: 'Reports' }).closest('tr')).getAllByRole('cell');
    expect(reports[2].textContent).toBe('View all');
    expect(table.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Area', 'Admin', 'Manager', 'Staff', 'Overseas Staff']);
  });

  test('if it cannot be loaded the accounts are still there, and it says so', async () => {
    users.access.mockRejectedValue(new Error('Request failed: 500'));
    await open(ME, { allowQueryErrors: true });
    expect(await screen.findByText(/Couldn't load what each role can do: Request failed: 500/)).toBeInTheDocument();
    expect(screen.getByText('Jo Smith')).toBeInTheDocument();
  });
});

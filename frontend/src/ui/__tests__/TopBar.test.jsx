/**
 * The top bar: search (and Ctrl+K), the assistant, what is overdue, Admin for
 * admins, and New Job when the role may add one.
 */
import { screen, fireEvent } from '@testing-library/react';
import { renderWithQuery } from '../../test/renderWithQuery';
import { users } from '../../api';
import TopBar, { OPEN_ASSISTANT } from '../shell/TopBar';

vi.mock('../../api', () => ({
  users: { myAccess: vi.fn() },
}));

const base = {
  title: 'Jobs',
  adminMode: false,
  onAdminToggle: vi.fn(),
  currentUser: { username: 'em', role: 'admin' },
  onNewJob: vi.fn(),
  searchValue: '',
  onSearchChange: vi.fn(),
  notifCount: 2,
};
const access = (allowed = ['GET /jobs', 'POST /jobs']) => ({ role: 'staff', areas: [], allowed });
const open = (props = {}) => renderWithQuery(<TopBar {...base} {...props} />);

beforeEach(() => {
  vi.clearAllMocks();
  users.myAccess.mockResolvedValue(access());
});

test('says where you are', () => {
  open();
  expect(screen.getByText('Jobs')).toBeInTheDocument();
});

describe('New Job', () => {
  test('fires when the role may add a job', async () => {
    open();
    fireEvent.click(await screen.findByText('New Job'));
    expect(base.onNewJob).toHaveBeenCalled();
  });

  test('is hidden once access says the role may not add a job', async () => {
    users.myAccess.mockResolvedValue(access(['GET /jobs']));
    open();
    await vi.waitFor(() => expect(screen.queryByText('New Job')).not.toBeInTheDocument());
  });

  test('is offered while access is loading', () => {
    users.myAccess.mockReturnValue(new Promise(() => {}));
    open();
    expect(screen.getByText('New Job')).toBeInTheDocument();
  });
});

test('admin lock only renders for the admin role', () => {
  const { unmount } = open();
  expect(screen.getByLabelText('Admin Tools')).toBeInTheDocument();
  unmount();
  open({ currentUser: { username: 'jo', role: 'staff' } });
  expect(screen.queryByLabelText('Admin Tools')).not.toBeInTheDocument();
});

test('search forwards what is typed, and Ctrl+K focuses it', () => {
  open();
  fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'bhp' } });
  expect(base.onSearchChange).toHaveBeenCalledWith('bhp');
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
  expect(screen.getByPlaceholderText('Search…')).toHaveFocus();
});

test('the overdue count is announced', () => {
  open();
  expect(screen.getByRole('status', { name: '2 overdue jobs' })).toBeInTheDocument();
});

test('Ask opens the assistant', () => {
  const heard = vi.fn();
  window.addEventListener(OPEN_ASSISTANT, heard);
  open();
  fireEvent.click(screen.getByRole('button', { name: /ask/i }));
  expect(heard).toHaveBeenCalledTimes(1);
  window.removeEventListener(OPEN_ASSISTANT, heard);
});
